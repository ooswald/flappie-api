// File-backed token storage for the CLI. Library consumers don't need this -
// they wire up persistence via FlappieClient's `onAuthChange` option.

import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import type { FlappieAuthState } from "./client.js";

export function configPath(): string {
  if (process.env["FLAPPIE_CONFIG"]) return process.env["FLAPPIE_CONFIG"]!;
  const xdg = process.env["XDG_CONFIG_HOME"] ?? `${homedir()}/.config`;
  return `${xdg}/flappie/config.json`;
}

export function loadConfig(): FlappieAuthState {
  try {
    const txt = readFileSync(configPath(), "utf8");
    return JSON.parse(txt) as FlappieAuthState;
  } catch { return {}; }
}

export function saveConfig(cfg: FlappieAuthState): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2));
  try { chmodSync(path, 0o600); } catch { /* ignore on platforms that don't support it */ }
}
