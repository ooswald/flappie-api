import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const CONFIG_PATH = process.env.FLAPPIE_CONFIG ?? join(homedir(), ".config", "flappie", "config.json");

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(cfg) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  try { chmodSync(CONFIG_PATH, 0o600); } catch {}
}

export function configPath() {
  return CONFIG_PATH;
}
