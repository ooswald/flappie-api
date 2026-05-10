// Pure helpers used by the CLI - exported separately so they can be unit
// tested without invoking the commander entrypoint.

import type { DoorPolicy, Weekday } from "./types.js";

export const POLICIES: readonly DoorPolicy[] = ["OPEN", "CLOSED", "OPEN_IN", "OPEN_OUT"];

export function parseBool(v: string | boolean | undefined): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (["on", "true", "1", "yes"].includes(s)) return true;
  if (["off", "false", "0", "no"].includes(s)) return false;
  throw new Error(`expected on/off, got "${v}"`);
}

export function normalizePolicy(p: string): DoorPolicy {
  const u = String(p).toUpperCase().replace(/-/g, "_");
  if (!(POLICIES as readonly string[]).includes(u)) {
    throw new Error(`policy must be one of ${POLICIES.join(", ")}, got "${p}"`);
  }
  return u as DoorPolicy;
}

const WEEKDAYS: Record<string, Weekday> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

export function parseWeekdays(spec: string): Weekday[] {
  if (!spec || spec === "all" || spec === "every") return [1, 2, 3, 4, 5, 6, 7];
  if (spec === "weekdays") return [1, 2, 3, 4, 5];
  if (spec === "weekend") return [6, 7];
  return spec.split(",").map((s) => {
    const t = s.trim().toLowerCase();
    const k = WEEKDAYS[t.slice(0, 3) as keyof typeof WEEKDAYS];
    if (k) return k;
    const n = Number(t);
    if (Number.isInteger(n) && n >= 1 && n <= 7) return n as Weekday;
    throw new Error(`unknown weekday: "${s}". Use mon..sun, 1..7, or weekdays/weekend/all`);
  });
}

export interface SettingsLike {
  open_status?: DoorPolicy;
  buttons_enabled?: boolean;
  prey_detection_user_preference?: boolean;
  prey_detection_system_lock?: boolean;
}

export function summarizeSettings(s: SettingsLike | undefined): string {
  if (!s) return "";
  const parts: string[] = [];
  if (s.open_status) parts.push(`open=${s.open_status}`);
  if (typeof s.buttons_enabled === "boolean") parts.push(`buttons=${s.buttons_enabled ? "on" : "off"}`);
  if (typeof s.prey_detection_user_preference === "boolean") parts.push(`ai=${s.prey_detection_user_preference ? "on" : "off"}`);
  if (s.prey_detection_system_lock) parts.push("sys-locked");
  return parts.join(" ");
}
