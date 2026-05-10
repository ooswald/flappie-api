import { loadConfig, saveConfig } from "./config.js";

const BASE_URL = process.env.FLAPPIE_API ?? "https://app.flappiedoors.com";

export class FlappieApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class Flappie {
  constructor(config = loadConfig()) {
    this.config = config;
  }

  get accessToken() { return this.config.access_token; }
  get refreshToken() { return this.config.refresh_token; }

  async request(method, path, { body, auth = true, retried = false } = {}) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "flappie-cli/0.1",
    };
    if (auth) {
      if (!this.accessToken) {
        throw new FlappieApiError("Not authenticated. Run `flappie login`.");
      }
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && auth && !retried && this.refreshToken) {
      const ok = await this.tryRefresh();
      if (ok) return this.request(method, path, { body, auth, retried: true });
    }

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      throw new FlappieApiError(
        `${method} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
        { status: res.status, body: data },
      );
    }
    return data;
  }

  async tryRefresh() {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/users/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.config.access_token = data.access_token ?? data.accessToken;
      if (data.refresh_token ?? data.refreshToken) {
        this.config.refresh_token = data.refresh_token ?? data.refreshToken;
      }
      saveConfig(this.config);
      return true;
    } catch { return false; }
  }

  async login(email, password) {
    const data = await this.request("POST", "/api/v1/users/login", {
      body: { email, password }, auth: false,
    });
    const access = data.access_token ?? data.accessToken;
    const refresh = data.refresh_token ?? data.refreshToken;
    if (!access) throw new FlappieApiError("Login response did not include access_token", { body: data });
    this.config.email = email;
    this.config.access_token = access;
    if (refresh) this.config.refresh_token = refresh;
    saveConfig(this.config);
    return data;
  }

  logout() { this.config = {}; saveConfig(this.config); }

  // User
  getUser() { return this.request("GET", "/api/v1/users"); }

  // Devices
  // Note: the backend has an inconsistent slash-before-id convention.
  // /information, /timeplans, /status all want a slash; /settings and the
  // bare PATCH for renaming want NO slash. This matches what the Flutter app
  // actually sends and is verified live.
  listDevices() { return this.request("GET", "/api/v1/devices"); }
  getDeviceInformation(id) { return this.request("GET", `/api/v1/devices/${id}/information`); }
  getDeviceStatus(id) { return this.request("GET", `/api/v1/devices/${id}/status`); }
  getDeviceSettings(id) { return this.request("GET", `/api/v1/devices${id}/settings`); }
  getDeviceTimePlans(id) { return this.request("GET", `/api/v1/devices/${id}/timeplans`); }

  // Device write actions (reverse-engineered from official Android app).
  // PATCH /settings returns the full updated settings object, so callers
  // get a confirmed read-back without a second GET.
  patchDeviceSettings(id, body) {
    return this.request("PATCH", `/api/v1/devices${id}/settings`, { body });
  }
  updateDeviceName(id, name) {
    return this.request("PATCH", `/api/v1/devices${id}`, { body: { name } });
  }

  // Dashboard - includes prey_detection_user_preference + prey_detection_system_lock per device
  dashboard() { return this.request("GET", "/api/v1/dashboard"); }

  // Time plans
  addDeviceTimePlan(deviceId, plan) {
    return this.request("POST", `/api/v1/devices/${deviceId}/timeplans`, { body: plan });
  }
  editDeviceTimePlan(deviceId, tpId, plan) {
    return this.request("PUT", `/api/v1/devices/${deviceId}/timeplans/${tpId}`, { body: plan });
  }
  deleteDeviceTimePlan(deviceId, tpId) {
    return this.request("DELETE", `/api/v1/devices/${deviceId}/timeplans/${tpId}`);
  }

  // Cats
  listCats() { return this.request("GET", "/api/v1/cats"); }
  addCat(body) { return this.request("POST", "/api/v1/cats", { body }); }
  editCat(id, body) { return this.request("PUT", `/api/v1/cats/${id}`, { body }); }
  deleteCat(id) { return this.request("DELETE", `/api/v1/cats/${id}`); }
  catBreeds() { return this.request("GET", "/api/v1/cats/breed-types"); }

  // Bundles (prey detections, photo/video records)
  listBundles({ page = 1, from, to, order = "desc" } = {}) {
    const params = new URLSearchParams({ page: String(page) });
    params.set("order_by", "createdAt");
    params.set("order_direction", order);
    if (from) params.set("fromCreatedAt", from);
    if (to) params.set("toCreatedAt", to);
    return this.request("GET", `/api/v1/bundles?${params}`);
  }
  getBundle(id) { return this.request("GET", `/api/v1/bundles/${id}`); }

  // News
  news() { return this.request("GET", "/api/v1/news/"); }

  // Statistics
  huntingStats({ groupBy = "day", startDate, endDate } = {}) {
    const params = new URLSearchParams({ group_by_period: groupBy });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return this.request("GET", `/api/v1/statistics/hunting?${params}`);
  }
  preyStats({ groupBy = "day", startDate, endDate } = {}) {
    const params = new URLSearchParams({ group_by_period: groupBy });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return this.request("GET", `/api/v1/statistics/prey?${params}`);
  }
}
