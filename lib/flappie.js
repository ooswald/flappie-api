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

  get accessToken() {
    return this.config.access_token;
  }

  get refreshToken() {
    return this.config.refresh_token;
  }

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

    // Auto-refresh on 401 once
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
    } catch {
      return false;
    }
  }

  async login(email, password) {
    const data = await this.request("POST", "/api/v1/users/login", {
      body: { email, password },
      auth: false,
    });
    const access = data.access_token ?? data.accessToken;
    const refresh = data.refresh_token ?? data.refreshToken;
    if (!access) {
      throw new FlappieApiError("Login response did not include access_token", { body: data });
    }
    this.config.email = email;
    this.config.access_token = access;
    if (refresh) this.config.refresh_token = refresh;
    saveConfig(this.config);
    return data;
  }

  logout() {
    this.config = {};
    saveConfig(this.config);
  }

  // Devices
  listDevices() { return this.request("GET", "/api/v1/devices"); }
  getDevice(id) { return this.request("GET", `/api/v1/devices/${id}`); }
  setDoorPolicy(id, policy) {
    // We try PATCH first; fall back to PUT inside the command if needed.
    return this.request("PATCH", `/api/v1/devices/${id}`, { body: { door_policy: policy } });
  }

  // Cats
  listCats() { return this.request("GET", "/api/v1/cats"); }

  // Dashboard
  dashboard() { return this.request("GET", "/api/v1/dashboard"); }

  // User
  getUser() { return this.request("GET", "/api/v1/users"); }
}
