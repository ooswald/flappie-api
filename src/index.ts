/**
 * Flappie API client - typed access to the undocumented Flappie cloud API.
 *
 * @example
 * ```ts
 * import { FlappieClient } from "flappie-cli";
 *
 * const client = new FlappieClient({
 *   auth: { access_token: process.env.FLAPPIE_TOKEN },
 * });
 *
 * const devices = await client.listDevices();
 * await client.lock(devices[0].id);
 * ```
 *
 * @example Persisting tokens to disk:
 * ```ts
 * import { FlappieClient } from "flappie-cli";
 * import { writeFileSync, readFileSync } from "node:fs";
 *
 * const path = "/var/lib/myapp/flappie.json";
 * let auth = {};
 * try { auth = JSON.parse(readFileSync(path, "utf8")); } catch { /* first run *\/ }
 *
 * const client = new FlappieClient({
 *   auth,
 *   onAuthChange: (next) => writeFileSync(path, JSON.stringify(next)),
 * });
 * ```
 */

export { FlappieClient } from "./client.js";
export type { FlappieAuthState, FlappieClientOptions } from "./client.js";
export { FlappieApiError } from "./errors.js";
export type * from "./types.js";
