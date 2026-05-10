#!/usr/bin/env node
import { program } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Flappie, FlappieApiError } from "../lib/flappie.js";
import { configPath } from "../lib/config.js";

function fail(err) {
  if (err instanceof FlappieApiError) console.error(`error: ${err.message}`);
  else console.error(err.stack || String(err));
  process.exit(1);
}

async function prompt(q, { hidden = false } = {}) {
  const rl = createInterface({ input, output });
  if (hidden) {
    const orig = output.write;
    output.write = (chunk, ...rest) => {
      if (typeof chunk === "string" && chunk !== q) return true;
      return orig.call(output, chunk, ...rest);
    };
    try {
      const ans = await rl.question(q);
      return ans;
    } finally {
      output.write = orig;
      rl.close();
      output.write("\n");
    }
  }
  const ans = await rl.question(q);
  rl.close();
  return ans;
}

function resolveDevice(devices, ref) {
  if (!devices.length) throw new Error("No devices on this account.");
  if (!ref) {
    if (devices.length === 1) return devices[0];
    throw new Error(`More than one device. Specify by id or name: ${devices.map(d => d.name ?? d.id).join(", ")}`);
  }
  const r = ref.toLowerCase();
  const m = devices.find((d) =>
    String(d.id).toLowerCase() === r ||
    (d.name && d.name.toLowerCase().includes(r))
  );
  if (!m) throw new Error(`Device not found: ${ref}. Available: ${devices.map(d => d.name ?? d.id).join(", ")}`);
  return m;
}

const POLICIES = ["OPEN", "CLOSED", "OPEN_IN", "OPEN_OUT"];

function parseBool(v) {
  const s = String(v).toLowerCase();
  if (["on", "true", "1", "yes"].includes(s)) return true;
  if (["off", "false", "0", "no"].includes(s)) return false;
  throw new Error(`expected on/off, got "${v}"`);
}

function normalizePolicy(p) {
  const u = String(p).toUpperCase().replace(/-/g, "_");
  if (!POLICIES.includes(u)) throw new Error(`policy must be one of ${POLICIES.join(", ")}, got "${p}"`);
  return u;
}

program.name("flappie").description("CLI for Flappie cat doors via the cloud API").version("0.2.0");

program
  .command("login")
  .description("Sign in and store access token")
  .option("-e, --email <email>", "email address")
  .action(async (opts) => {
    try {
      const email = opts.email ?? await prompt("Email: ");
      const password = await prompt("Password: ", { hidden: true });
      const f = new Flappie();
      await f.login(email.trim(), password);
      console.log(`Logged in as ${email.trim()}. Token saved to ${configPath()}.`);
    } catch (e) { fail(e); }
  });

program
  .command("logout")
  .description("Forget stored credentials")
  .action(() => {
    new Flappie().logout();
    console.log("Logged out.");
  });

program
  .command("whoami")
  .description("Show the currently logged-in user")
  .action(async () => {
    try { console.log(JSON.stringify(await new Flappie().getUser(), null, 2)); } catch (e) { fail(e); }
  });

program
  .command("devices")
  .description("List all devices with current state")
  .action(async () => {
    try {
      const f = new Flappie();
      const [devices, dash] = await Promise.all([f.listDevices(), f.dashboard()]);
      const ops = (dash?.operational_status ?? []).reduce((m, o) => (m[o.device_id] = o, m), {});
      if (!devices.length) { console.log("(no devices)"); return; }
      for (const d of devices) {
        const o = ops[d.id] ?? {};
        let status;
        try {
          const s = await f.getDeviceStatus(d.id);
          status = s.state ?? "?";
          if (s.lock_until) status += ` (until ${s.lock_until})`;
        } catch { status = "?"; }
        const ai = o.prey_detection_user_preference ? "ai-on" : "ai-off";
        const sysLock = o.prey_detection_system_lock ? " sys-locked" : "";
        console.log(`  ${String(d.id).padEnd(20)}  ${String(d.name ?? "").padEnd(15)}  ${d.model ?? ""}  fw=${d.firmware_version ?? "?"}  ${status}  ${ai}${sysLock}`);
      }
    } catch (e) { fail(e); }
  });

program
  .command("status [device]")
  .description("Show full status (state, lock_until, etc) of a device")
  .action(async (ref) => {
    try {
      const f = new Flappie();
      const devices = await f.listDevices();
      const d = resolveDevice(devices, ref);
      const [info, status] = await Promise.all([
        f.getDeviceInformation(d.id),
        f.getDeviceStatus(d.id),
      ]);
      console.log(JSON.stringify({ device: d, information: info, status }, null, 2));
    } catch (e) { fail(e); }
  });

program
  .command("dashboard")
  .description("Show dashboard (recent prey, system lock state, etc)")
  .action(async () => {
    try { console.log(JSON.stringify(await new Flappie().dashboard(), null, 2)); } catch (e) { fail(e); }
  });

program
  .command("cats")
  .description("List cats")
  .action(async () => {
    try { console.log(JSON.stringify(await new Flappie().listCats(), null, 2)); } catch (e) { fail(e); }
  });

program
  .command("stats <kind>")
  .description("Stats: 'hunting' or 'prey' grouped by period")
  .option("-g, --group-by <period>", "hour | day | week | month", "day")
  .option("-s, --start <YYYY-MM-DD>", "start date")
  .option("-e, --end <YYYY-MM-DD>", "end date")
  .action(async (kind, opts) => {
    try {
      const f = new Flappie();
      const args = { groupBy: opts.groupBy, startDate: opts.start, endDate: opts.end };
      const data = kind === "prey" ? await f.preyStats(args) : await f.huntingStats(args);
      console.log(JSON.stringify(data, null, 2));
    } catch (e) { fail(e); }
  });

program
  .command("news")
  .description("List news items")
  .action(async () => {
    try { console.log(JSON.stringify(await new Flappie().news(), null, 2)); } catch (e) { fail(e); }
  });

program
  .command("settings [device]")
  .description("Show current device settings (door policy, ai, buttons, etc)")
  .action(async (ref) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      console.log(JSON.stringify(await f.getDeviceSettings(d.id), null, 2));
    } catch (e) { fail(e); }
  });

function summarizeSettings(s) {
  if (!s || typeof s !== "object") return "";
  const parts = [];
  if (s.open_status) parts.push(`open=${s.open_status}`);
  if ("buttons_enabled" in s) parts.push(`buttons=${s.buttons_enabled ? "on" : "off"}`);
  if ("prey_detection_user_preference" in s) parts.push(`ai=${s.prey_detection_user_preference ? "on" : "off"}`);
  if (s.prey_detection_system_lock) parts.push("sys-locked");
  return parts.join(" ");
}

program
  .command("policy <policy> [device]")
  .description(`Set door policy: ${POLICIES.join(" | ")} (lower-case + dashes also accepted)`)
  .action(async (policy, ref) => {
    try {
      const open_status = normalizePolicy(policy);
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      const updated = await f.patchDeviceSettings(d.id, { open_status });
      console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
    } catch (e) { fail(e); }
  });

program
  .command("lock [device]")
  .description("Close door in both directions (alias for: policy CLOSED)")
  .action(async (ref) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      const updated = await f.patchDeviceSettings(d.id, { open_status: "CLOSED" });
      console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
    } catch (e) { fail(e); }
  });

program
  .command("unlock [device]")
  .description("Open door in both directions (alias for: policy OPEN)")
  .action(async (ref) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      const updated = await f.patchDeviceSettings(d.id, { open_status: "OPEN" });
      console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
    } catch (e) { fail(e); }
  });

program
  .command("power-off-policy <policy> [device]")
  .description(`Door policy when battery dies: ${POLICIES.join(" | ")}`)
  .action(async (policy, ref) => {
    try {
      const power_off_open_status = normalizePolicy(policy);
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      const updated = await f.patchDeviceSettings(d.id, { power_off_open_status });
      console.log(`${d.name ?? d.id}: power_off_open_status=${updated?.power_off_open_status ?? power_off_open_status}`);
    } catch (e) { fail(e); }
  });

program
  .command("ai <state> [device]")
  .description("Turn prey detection AI on/off")
  .action(async (state, ref) => {
    try {
      const prey_detection_user_preference = parseBool(state);
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      const updated = await f.patchDeviceSettings(d.id, { prey_detection_user_preference });
      console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
    } catch (e) { fail(e); }
  });

program
  .command("buttons <state> [device]")
  .description("Enable/disable physical buttons on the door")
  .action(async (state, ref) => {
    try {
      const buttons_enabled = parseBool(state);
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      const updated = await f.patchDeviceSettings(d.id, { buttons_enabled });
      console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
    } catch (e) { fail(e); }
  });

program
  .command("set-name <name> [device]")
  .description("Rename the device")
  .action(async (name, ref) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      await f.updateDeviceName(d.id, name);
      console.log(`${d.id}: name -> ${name}`);
    } catch (e) { fail(e); }
  });

const WEEKDAYS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
function parseWeekdays(spec) {
  if (!spec) return [1, 2, 3, 4, 5, 6, 7];
  if (spec === "weekdays") return [1, 2, 3, 4, 5];
  if (spec === "weekend") return [6, 7];
  if (spec === "all" || spec === "every") return [1, 2, 3, 4, 5, 6, 7];
  return spec.split(",").map((s) => {
    const t = s.trim().toLowerCase();
    if (WEEKDAYS[t.slice(0, 3)]) return WEEKDAYS[t.slice(0, 3)];
    const n = Number(t);
    if (n >= 1 && n <= 7) return n;
    throw new Error(`unknown weekday: "${s}". Use mon..sun, 1..7, or weekdays/weekend/all`);
  });
}

const timeplan = program.command("timeplan").description("Time plan management");

timeplan
  .command("list [device]")
  .description("List time plans configured on the device")
  .action(async (ref) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      console.log(JSON.stringify(await f.getDeviceTimePlans(d.id), null, 2));
    } catch (e) { fail(e); }
  });

timeplan
  .command("add")
  .description("Add a new time plan to a device")
  .requiredOption("--open <HH:MM>", "time of day to open (e.g. 07:00)")
  .requiredOption("--close <HH:MM>", "time of day to close (e.g. 22:00)")
  .requiredOption("--policy <policy>", `door policy during the open window: ${POLICIES.join(" | ")}`)
  .requiredOption("--start <YYYY-MM-DD>", "first date the plan applies on")
  .requiredOption("--end <YYYY-MM-DD>", "last date the plan applies on")
  .option("--days <list>", "comma-separated weekdays (mon,tue,..) or weekdays/weekend/all", "all")
  .option("--inactive", "create the plan in inactive state", false)
  .option("--device <device>", "device id or name fragment if more than one")
  .action(async (opts) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), opts.device);
      const body = {
        open_time: opts.open,
        close_time: opts.close,
        open_status: normalizePolicy(opts.policy),
        weekdays: parseWeekdays(opts.days),
        is_active: !opts.inactive,
        start_date: opts.start,
        end_date: opts.end,
      };
      console.log(JSON.stringify(await f.addDeviceTimePlan(d.id, body), null, 2));
    } catch (e) { fail(e); }
  });

timeplan
  .command("edit <id>")
  .description("Edit an existing time plan (PUT replaces all fields)")
  .requiredOption("--open <HH:MM>")
  .requiredOption("--close <HH:MM>")
  .requiredOption("--policy <policy>", `door policy: ${POLICIES.join(" | ")}`)
  .requiredOption("--start <YYYY-MM-DD>")
  .requiredOption("--end <YYYY-MM-DD>")
  .option("--days <list>", "comma-separated weekdays or weekdays/weekend/all", "all")
  .option("--active <bool>", "true/false", "true")
  .option("--device <device>")
  .action(async (id, opts) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), opts.device);
      const body = {
        open_time: opts.open,
        close_time: opts.close,
        open_status: normalizePolicy(opts.policy),
        weekdays: parseWeekdays(opts.days),
        is_active: parseBool(opts.active),
        start_date: opts.start,
        end_date: opts.end,
      };
      console.log(JSON.stringify(await f.editDeviceTimePlan(d.id, id, body), null, 2));
    } catch (e) { fail(e); }
  });

timeplan
  .command("delete <id>")
  .description("Delete a time plan")
  .option("--device <device>")
  .action(async (id, opts) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), opts.device);
      await f.deleteDeviceTimePlan(d.id, id);
      console.log(`time plan ${id}: deleted`);
    } catch (e) { fail(e); }
  });

const bundles = program.command("bundles").description("Prey/activity detections (photos & videos)");

bundles
  .command("list", { isDefault: true })
  .description("List bundles, paginated")
  .option("-p, --page <n>", "page number (1-indexed)", "1")
  .option("-f, --from <YYYY-MM-DD>", "filter: from this date")
  .option("-t, --to <YYYY-MM-DD>", "filter: up to this date")
  .option("-o, --order <asc|desc>", "createdAt sort direction", "desc")
  .action(async (opts) => {
    try {
      const f = new Flappie();
      const data = await f.listBundles({
        page: Number(opts.page),
        from: opts.from,
        to: opts.to,
        order: opts.order,
      });
      console.log(JSON.stringify(data, null, 2));
    } catch (e) { fail(e); }
  });

bundles
  .command("show <id>")
  .description("Show a single bundle")
  .action(async (id) => {
    try { console.log(JSON.stringify(await new Flappie().getBundle(id), null, 2)); } catch (e) { fail(e); }
  });

const cat = program.command("cat").description("Cat profile management");

cat
  .command("list", { isDefault: true })
  .description("List cat profiles (alias for top-level `flappie cats`)")
  .action(async () => {
    try { console.log(JSON.stringify(await new Flappie().listCats(), null, 2)); } catch (e) { fail(e); }
  });

cat
  .command("breeds")
  .description("List the cat breeds the API knows about")
  .action(async () => {
    try { console.log(JSON.stringify(await new Flappie().catBreeds(), null, 2)); } catch (e) { fail(e); }
  });

cat
  .command("add")
  .description("Add a new cat profile")
  .requiredOption("--name <name>")
  .option("--birthday <YYYY-MM-DD>")
  .option("--gender <FEMALE|MALE|UNKNOWN>")
  .option("--breed <breed>")
  .option("--weight <kg>")
  .action(async (opts) => {
    try {
      const body = { name: opts.name };
      if (opts.birthday) body.birthday = opts.birthday;
      if (opts.gender) body.gender = String(opts.gender).toUpperCase();
      if (opts.breed) body.breed = opts.breed;
      if (opts.weight !== undefined) body.weight = Number(opts.weight);
      console.log(JSON.stringify(await new Flappie().addCat(body), null, 2));
    } catch (e) { fail(e); }
  });

cat
  .command("edit <id>")
  .description("Edit an existing cat profile")
  .option("--name <name>")
  .option("--birthday <YYYY-MM-DD>")
  .option("--gender <FEMALE|MALE|UNKNOWN>")
  .option("--breed <breed>")
  .option("--weight <kg>")
  .action(async (id, opts) => {
    try {
      const body = {};
      if (opts.name) body.name = opts.name;
      if (opts.birthday) body.birthday = opts.birthday;
      if (opts.gender) body.gender = String(opts.gender).toUpperCase();
      if (opts.breed) body.breed = opts.breed;
      if (opts.weight !== undefined) body.weight = Number(opts.weight);
      console.log(JSON.stringify(await new Flappie().editCat(id, body), null, 2));
    } catch (e) { fail(e); }
  });

cat
  .command("delete <id>")
  .description("Delete a cat profile")
  .action(async (id) => {
    try {
      await new Flappie().deleteCat(id);
      console.log(`cat ${id}: deleted`);
    } catch (e) { fail(e); }
  });

const graph = program.command("graph").description("Activity graphs at finer time resolutions");

graph
  .command("day <date>")
  .description("Hourly prey-detection graph for a specific day (YYYY-MM-DD)")
  .action(async (date) => {
    try {
      const f = new Flappie();
      const data = await f.preyStats({ groupBy: "hour", startDate: date, endDate: date });
      console.log(JSON.stringify(data, null, 2));
    } catch (e) { fail(e); }
  });

graph
  .command("period <granularity>")
  .description("Prey-detection graph: granularity = day | month")
  .requiredOption("-s, --start <YYYY-MM-DD>")
  .requiredOption("-e, --end <YYYY-MM-DD>")
  .action(async (granularity, opts) => {
    try {
      if (!["day", "month"].includes(granularity)) throw new Error("granularity must be day or month");
      const f = new Flappie();
      console.log(JSON.stringify(await f.preyStats({ groupBy: granularity, startDate: opts.start, endDate: opts.end }), null, 2));
    } catch (e) { fail(e); }
  });

graph
  .command("hunting-day <date>")
  .description("Hunting stats for a single day (with hourly prey overlay)")
  .action(async (date) => {
    try {
      const f = new Flappie();
      const [hunting, prey] = await Promise.all([
        f.huntingStats({ groupBy: "day", startDate: date }),
        f.preyStats({ groupBy: "hour", startDate: date, endDate: date }),
      ]);
      console.log(JSON.stringify({ hunting, prey }, null, 2));
    } catch (e) { fail(e); }
  });

program
  .command("timeplans [device]")
  .description("(Deprecated alias) List time plans - use 'flappie timeplan list' instead")
  .action(async (ref) => {
    try {
      const f = new Flappie();
      const d = resolveDevice(await f.listDevices(), ref);
      console.log(JSON.stringify(await f.getDeviceTimePlans(d.id), null, 2));
    } catch (e) { fail(e); }
  });

program
  .command("raw <method> <path>")
  .description("Send a raw API call (e.g. flappie raw GET /api/v1/dashboard)")
  .option("-d, --data <json>", "JSON request body")
  .action(async (method, path, opts) => {
    try {
      const f = new Flappie();
      const body = opts.data ? JSON.parse(opts.data) : undefined;
      const res = await f.request(method.toUpperCase(), path, { body });
      console.log(JSON.stringify(res, null, 2));
    } catch (e) { fail(e); }
  });

program.parse();
