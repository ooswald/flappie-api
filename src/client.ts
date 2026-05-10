import { FlappieApiError } from "./errors.js";
import type {
  DoorPolicy,
  TokenPair,
  User,
  Device,
  DeviceInformation,
  DeviceStatus,
  DeviceSettings,
  DeviceSettingsPatch,
  TimePlan,
  TimePlanRequest,
  Cat,
  CatRequest,
  Bundle,
  BundlesPage,
  ListBundlesOptions,
  Dashboard,
  GraphPoint,
  HuntingStats,
  BreedTypes,
  StatsOptions,
} from "./types.js";

export interface FlappieAuthState {
  email?: string;
  access_token?: string;
  refresh_token?: string;
}

export interface FlappieClientOptions {
  /** API base URL. Defaults to https://app.flappiedoors.com. */
  baseUrl?: string;
  /** Initial auth state. Pass an empty object if you want to call login(). */
  auth?: FlappieAuthState;
  /**
   * Called whenever the client mutates auth (login, logout, refresh).
   * Use this to persist tokens to disk, a database, etc.
   */
  onAuthChange?: (auth: FlappieAuthState) => void | Promise<void>;
  /** Override `fetch` (e.g. for tests or proxy). */
  fetch?: typeof fetch;
  /** Sent as `User-Agent`. */
  userAgent?: string;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
  /** Internal: prevent infinite refresh loops. */
  retried?: boolean;
}

const DEFAULT_BASE_URL = "https://app.flappiedoors.com";

/**
 * Typed client for the Flappie cloud API.
 *
 * The vendor has not published an official API. Endpoint shapes are
 * best-effort and may change without notice.
 *
 * @example
 * ```ts
 * const client = new FlappieClient();
 * await client.login("you@example.com", "password");
 * const devices = await client.listDevices();
 * await client.lock(devices[0].id);
 * ```
 */
export class FlappieClient {
  readonly baseUrl: string;
  private auth: FlappieAuthState;
  private readonly onAuthChange?: (auth: FlappieAuthState) => void | Promise<void>;
  private readonly fetchFn: typeof fetch;
  private readonly userAgent: string;

  constructor(opts: FlappieClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.auth = { ...(opts.auth ?? {}) };
    this.onAuthChange = opts.onAuthChange;
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new Error("FlappieClient: no fetch implementation available - pass `fetch` in options");
    this.fetchFn = f.bind(globalThis);
    this.userAgent = opts.userAgent ?? "flappie-api";
  }

  /** Snapshot of the current auth state (token pair + email). */
  get authState(): Readonly<FlappieAuthState> { return { ...this.auth }; }
  get accessToken(): string | undefined { return this.auth.access_token; }
  get refreshToken(): string | undefined { return this.auth.refresh_token; }
  get isAuthenticated(): boolean { return Boolean(this.auth.access_token); }

  private async persistAuth(): Promise<void> {
    if (this.onAuthChange) await this.onAuthChange({ ...this.auth });
  }

  /**
   * Low-level: send any HTTP request to the API. Handles auth header and
   * automatic refresh on 401. Used by all other methods - exposed publicly
   * so consumers can call endpoints we haven't wrapped yet.
   */
  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const { body, query, auth = true, retried = false } = opts;

    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += (path.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = {
      "Accept": "application/json",
      "User-Agent": this.userAgent,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) {
      if (!this.auth.access_token) {
        throw new FlappieApiError("Not authenticated. Call login() first.");
      }
      headers["Authorization"] = `Bearer ${this.auth.access_token}`;
    }

    const res = await this.fetchFn(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && auth && !retried && this.auth.refresh_token) {
      const ok = await this.tryRefresh();
      if (ok) return this.request<T>(method, path, { ...opts, retried: true });
    }

    const text = await res.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new FlappieApiError(`${method} ${path} -> ${res.status}: ${detail}`, {
        status: res.status,
        body: data,
      });
    }
    return data as T;
  }

  /** Try to refresh the access token. Returns true on success. */
  async tryRefresh(): Promise<boolean> {
    if (!this.auth.refresh_token) return false;
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/v1/users/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ refresh_token: this.auth.refresh_token }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as Partial<TokenPair> & { accessToken?: string; refreshToken?: string };
      const access = data.access_token ?? data.accessToken;
      const refresh = data.refresh_token ?? data.refreshToken;
      if (!access) return false;
      this.auth.access_token = access;
      if (refresh) this.auth.refresh_token = refresh;
      await this.persistAuth();
      return true;
    } catch { return false; }
  }

  // -------------------------------------------------------------------- auth

  async login(email: string, password: string): Promise<TokenPair> {
    const data = await this.request<TokenPair & { accessToken?: string; refreshToken?: string }>(
      "POST", "/api/v1/users/login", { body: { email, password }, auth: false },
    );
    const access = data.access_token ?? data.accessToken;
    const refresh = data.refresh_token ?? data.refreshToken;
    if (!access) throw new FlappieApiError("Login response did not include access_token", { body: data });
    this.auth.email = email;
    this.auth.access_token = access;
    if (refresh) this.auth.refresh_token = refresh;
    await this.persistAuth();
    return { access_token: access, refresh_token: refresh ?? "", token_type: data.token_type ?? "bearer" };
  }

  async logout(): Promise<void> {
    this.auth = {};
    await this.persistAuth();
  }

  // -------------------------------------------------------------------- user

  getUser(): Promise<User> {
    return this.request<User>("GET", "/api/v1/users");
  }

  // ----------------------------------------------------------------- devices

  // The backend has an inconsistent slash convention between /api/v1/devices
  // and the device id. /information, /timeplans and /status need a slash;
  // /settings and the bare-rename PATCH expect NO slash. Verified live.

  listDevices(): Promise<Device[]> {
    return this.request<Device[]>("GET", "/api/v1/devices");
  }

  getDeviceInformation(id: string): Promise<DeviceInformation> {
    return this.request<DeviceInformation>("GET", `/api/v1/devices/${id}/information`);
  }

  getDeviceStatus(id: string): Promise<DeviceStatus> {
    return this.request<DeviceStatus>("GET", `/api/v1/devices/${id}/status`);
  }

  getDeviceSettings(id: string): Promise<DeviceSettings> {
    return this.request<DeviceSettings>("GET", `/api/v1/devices${id}/settings`);
  }

  patchDeviceSettings(id: string, body: DeviceSettingsPatch): Promise<DeviceSettings> {
    return this.request<DeviceSettings>("PATCH", `/api/v1/devices${id}/settings`, { body });
  }

  /** Convenience: set door policy without thinking about field names. */
  setDoorPolicy(id: string, policy: DoorPolicy): Promise<DeviceSettings> {
    return this.patchDeviceSettings(id, { open_status: policy });
  }
  /** Convenience: door fully closed (= locked). */
  lock(id: string): Promise<DeviceSettings> { return this.setDoorPolicy(id, "CLOSED"); }
  /** Convenience: door fully open (= unlocked). */
  unlock(id: string): Promise<DeviceSettings> { return this.setDoorPolicy(id, "OPEN"); }

  updateDeviceName(id: string, name: string): Promise<unknown> {
    return this.request("PATCH", `/api/v1/devices${id}`, { body: { name } });
  }

  // -------------------------------------------------------------- time plans

  getDeviceTimePlans(deviceId: string): Promise<TimePlan[]> {
    return this.request<TimePlan[]>("GET", `/api/v1/devices/${deviceId}/timeplans`);
  }

  addDeviceTimePlan(deviceId: string, plan: TimePlanRequest): Promise<TimePlan[]> {
    return this.request<TimePlan[]>("POST", `/api/v1/devices/${deviceId}/timeplans`, { body: plan });
  }

  editDeviceTimePlan(deviceId: string, tpId: number | string, plan: TimePlanRequest): Promise<TimePlan[]> {
    return this.request<TimePlan[]>("PUT", `/api/v1/devices/${deviceId}/timeplans/${tpId}`, { body: plan });
  }

  deleteDeviceTimePlan(deviceId: string, tpId: number | string): Promise<void> {
    return this.request<void>("DELETE", `/api/v1/devices/${deviceId}/timeplans/${tpId}`);
  }

  // -------------------------------------------------------------------- cats

  listCats(): Promise<Cat[]> {
    return this.request<Cat[]>("GET", "/api/v1/cats");
  }

  addCat(body: CatRequest): Promise<Cat> {
    return this.request<Cat>("POST", "/api/v1/cats", { body });
  }

  editCat(id: number | string, body: CatRequest): Promise<Cat> {
    return this.request<Cat>("PUT", `/api/v1/cats/${id}`, { body });
  }

  deleteCat(id: number | string): Promise<void> {
    return this.request<void>("DELETE", `/api/v1/cats/${id}`);
  }

  catBreeds(): Promise<BreedTypes> {
    return this.request<BreedTypes>("GET", "/api/v1/cats/breed-types");
  }

  // ----------------------------------------------------------------- bundles

  listBundles(opts: ListBundlesOptions = {}): Promise<BundlesPage> {
    const { page = 1, from, to, order = "desc" } = opts;
    return this.request<BundlesPage>("GET", "/api/v1/bundles", {
      query: {
        page,
        order_by: "createdAt",
        order_direction: order,
        fromCreatedAt: from,
        toCreatedAt: to,
      },
    });
  }

  getBundle(id: number | string): Promise<Bundle> {
    return this.request<Bundle>("GET", `/api/v1/bundles/${id}`);
  }

  // -------------------------------------------------------------- statistics

  huntingStats(opts: StatsOptions = {}): Promise<HuntingStats> {
    const { groupBy = "day", startDate, endDate } = opts;
    return this.request<HuntingStats>("GET", "/api/v1/statistics/hunting", {
      query: { group_by_period: groupBy, start_date: startDate, end_date: endDate },
    });
  }

  preyStats(opts: StatsOptions = {}): Promise<GraphPoint[]> {
    const { groupBy = "day", startDate, endDate } = opts;
    return this.request<GraphPoint[]>("GET", "/api/v1/statistics/prey", {
      query: { group_by_period: groupBy, start_date: startDate, end_date: endDate },
    });
  }

  // --------------------------------------------------------------- dashboard

  dashboard(): Promise<Dashboard> {
    return this.request<Dashboard>("GET", "/api/v1/dashboard");
  }

  // -------------------------------------------------------------------- news

  news(): Promise<unknown> {
    return this.request("GET", "/api/v1/news/");
  }
}
