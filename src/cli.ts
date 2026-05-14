#!/usr/bin/env node
import { program } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { FlappieClient } from "./client.js";
import { FlappieApiError } from "./errors.js";
import { loadConfig, saveConfig, configPath } from "./config.js";
import { POLICIES, parseBool, normalizePolicy, parseWeekdays, summarizeSettings } from "./cli-helpers.js";
import type { Device, TimePlanRequest, CatRequest } from "./types.js";

const fail = (err: unknown): never => {
  if (err instanceof FlappieApiError) console.error(`error: ${err.message}`);
  else console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
};

async function prompt(q: string, opts: { hidden?: boolean } = {}): Promise<string> {
  const rl = createInterface({ input, output });
  if (opts.hidden) {
    const orig = output.write.bind(output);
    (output as unknown as { write: typeof orig }).write = ((chunk: unknown, ...rest: unknown[]) => {
      if (typeof chunk === "string" && chunk !== q) return true;
      return orig(chunk as string | Uint8Array, ...rest as []);
    }) as typeof orig;
    try {
      return await rl.question(q);
    } finally {
      (output as unknown as { write: typeof orig }).write = orig;
      rl.close();
      output.write("\n");
    }
  }
  const ans = await rl.question(q);
  rl.close();
  return ans;
}

function client(): FlappieClient {
  if (process.env["FLAPPIE_API"]) {
    return new FlappieClient({
      baseUrl: process.env["FLAPPIE_API"],
      auth: loadConfig(),
      onAuthChange: saveConfig,
      userAgent: "flappie-api",
    });
  }
  return new FlappieClient({ auth: loadConfig(), onAuthChange: saveConfig, userAgent: "flappie-api" });
}

function resolveDevice(devices: Device[], ref: string | undefined): Device {
  if (devices.length === 0) throw new Error("No devices on this account.");
  if (!ref) {
    if (devices.length === 1) return devices[0]!;
    throw new Error(`More than one device. Specify by id or name: ${devices.map(d => d.name ?? d.id).join(", ")}`);
  }
  const r = ref.toLowerCase();
  const m = devices.find((d) =>
    String(d.id).toLowerCase() === r ||
    (d.name && d.name.toLowerCase().includes(r)),
  );
  if (!m) throw new Error(`Device not found: ${ref}. Available: ${devices.map(d => d.name ?? d.id).join(", ")}`);
  return m;
}

const wrap = <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
  async (...args: A): Promise<void> => { try { await fn(...args); } catch (e) { fail(e); } };

program.name("flappie").description("CLI for Flappie cat doors via the cloud API").version("0.4.0");

program
  .command("login")
  .description("Sign in and store access token")
  .option("-e, --email <email>", "email address")
  .action(wrap(async (opts: { email?: string }) => {
    const email = opts.email ?? await prompt("Email: ");
    const password = await prompt("Password: ", { hidden: true });
    const c = client();
    await c.login(email.trim(), password);
    console.log(`Logged in as ${email.trim()}. Token saved to ${configPath()}.`);
  }));

program
  .command("logout")
  .description("Forget stored credentials")
  .action(wrap(async () => {
    await client().logout();
    console.log("Logged out.");
  }));

program
  .command("whoami")
  .description("Show the currently logged-in user")
  .action(wrap(async () => {
    console.log(JSON.stringify(await client().getUser(), null, 2));
  }));

program
  .command("devices")
  .description("List all devices with current state")
  .action(wrap(async () => {
    const c = client();
    const [devices, dash] = await Promise.all([c.listDevices(), c.dashboard()]);
    const ops = (dash.operational_status ?? []).reduce<Record<string, typeof dash.operational_status[number]>>((m, o) => { m[o.device_id] = o; return m; }, {});
    if (!devices.length) { console.log("(no devices)"); return; }
    for (const d of devices) {
      const o = ops[d.id];
      let status: string;
      try {
        const s = await c.getDeviceStatus(d.id);
        status = s.state ?? "?";
        if (s.lock_until) status += ` (until ${s.lock_until})`;
      } catch { status = "?"; }
      const ai = o?.prey_detection_user_preference ? "ai-on" : "ai-off";
      const sysLock = o?.prey_detection_system_lock ? " sys-locked" : "";
      console.log(`  ${String(d.id).padEnd(20)}  ${String(d.name ?? "").padEnd(15)}  ${d.model ?? ""}  fw=${d.firmware_version ?? "?"}  ${status}  ${ai}${sysLock}`);
    }
  }));

program
  .command("status [device]")
  .description("Show full status (state, lock_until, etc) of a device")
  .action(wrap(async (ref?: string) => {
    const c = client();
    const devices = await c.listDevices();
    const d = resolveDevice(devices, ref);
    const [info, status] = await Promise.all([c.getDeviceInformation(d.id), c.getDeviceStatus(d.id)]);
    console.log(JSON.stringify({ device: d, information: info, status }, null, 2));
  }));

program
  .command("dashboard")
  .description("Show dashboard (recent prey, system lock state, etc)")
  .action(wrap(async () => { console.log(JSON.stringify(await client().dashboard(), null, 2)); }));

program
  .command("cats")
  .description("List cats")
  .action(wrap(async () => { console.log(JSON.stringify(await client().listCats(), null, 2)); }));

program
  .command("stats <kind>")
  .description("Stats: 'hunting' or 'prey' grouped by period")
  .option("-g, --group-by <period>", "hour | day | week | month", "day")
  .option("-s, --start <YYYY-MM-DD>", "start date")
  .option("-e, --end <YYYY-MM-DD>", "end date")
  .action(wrap(async (kind: string, opts: { groupBy: "hour" | "day" | "week" | "month"; start?: string; end?: string }) => {
    const c = client();
    const args = { groupBy: opts.groupBy, startDate: opts.start, endDate: opts.end };
    const data = kind === "prey" ? await c.preyStats(args) : await c.huntingStats(args);
    console.log(JSON.stringify(data, null, 2));
  }));

program
  .command("news")
  .description("List news items")
  .action(wrap(async () => { console.log(JSON.stringify(await client().news(), null, 2)); }));

program
  .command("settings [device]")
  .description("Show current device settings (door policy, ai, buttons, etc)")
  .action(wrap(async (ref?: string) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    console.log(JSON.stringify(await c.getDeviceSettings(d.id), null, 2));
  }));

program
  .command("policy <policy> [device]")
  .description(`Set door policy: ${POLICIES.join(" | ")} (lower-case + dashes also accepted)`)
  .action(wrap(async (policy: string, ref?: string) => {
    const open_status = normalizePolicy(policy);
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    const updated = await c.patchDeviceSettings(d.id, { open_status });
    console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
  }));

program
  .command("lock [device]")
  .description("Close door in both directions (alias for: policy CLOSED)")
  .action(wrap(async (ref?: string) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    const updated = await c.lock(d.id);
    console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
  }));

program
  .command("unlock [device]")
  .description("Open door in both directions (alias for: policy OPEN)")
  .action(wrap(async (ref?: string) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    const updated = await c.unlock(d.id);
    console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
  }));

program
  .command("power-off-policy <policy> [device]")
  .description(`Door policy when battery dies: ${POLICIES.join(" | ")}`)
  .action(wrap(async (policy: string, ref?: string) => {
    const power_off_open_status = normalizePolicy(policy);
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    const updated = await c.patchDeviceSettings(d.id, { power_off_open_status });
    console.log(`${d.name ?? d.id}: power_off_open_status=${updated.power_off_open_status ?? power_off_open_status}`);
  }));

program
  .command("ai <state> [device]")
  .description("Turn prey detection AI on/off")
  .action(wrap(async (state: string, ref?: string) => {
    const prey_detection_user_preference = parseBool(state);
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    const updated = await c.patchDeviceSettings(d.id, { prey_detection_user_preference });
    console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
  }));

program
  .command("buttons <state> [device]")
  .description("Enable/disable physical buttons on the door")
  .action(wrap(async (state: string, ref?: string) => {
    const buttons_enabled = parseBool(state);
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    const updated = await c.patchDeviceSettings(d.id, { buttons_enabled });
    console.log(`${d.name ?? d.id}: ${summarizeSettings(updated)}`);
  }));

program
  .command("set-name <name> [device]")
  .description("Rename the device")
  .action(wrap(async (name: string, ref?: string) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    await c.updateDeviceName(d.id, name);
    console.log(`${d.id}: name -> ${name}`);
  }));

const timeplan = program.command("timeplan").description("Time plan management");

timeplan
  .command("list [device]")
  .description("List time plans configured on the device")
  .action(wrap(async (ref?: string) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    console.log(JSON.stringify(await c.getDeviceTimePlans(d.id), null, 2));
  }));

interface TimePlanOpts {
  open: string; close: string; policy: string; start: string; end: string;
  days: string; inactive?: boolean; active?: string; device?: string;
}

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
  .action(wrap(async (opts: TimePlanOpts) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), opts.device);
    const body: TimePlanRequest = {
      open_time: opts.open,
      close_time: opts.close,
      open_status: normalizePolicy(opts.policy),
      weekdays: parseWeekdays(opts.days),
      is_active: !opts.inactive,
      start_date: opts.start,
      end_date: opts.end,
    };
    console.log(JSON.stringify(await c.addDeviceTimePlan(d.id, body), null, 2));
  }));

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
  .action(wrap(async (id: string, opts: TimePlanOpts) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), opts.device);
    const body: TimePlanRequest = {
      open_time: opts.open,
      close_time: opts.close,
      open_status: normalizePolicy(opts.policy),
      weekdays: parseWeekdays(opts.days),
      is_active: parseBool(opts.active ?? "true"),
      start_date: opts.start,
      end_date: opts.end,
    };
    console.log(JSON.stringify(await c.editDeviceTimePlan(d.id, id, body), null, 2));
  }));

timeplan
  .command("delete <id>")
  .description("Delete a time plan")
  .option("--device <device>")
  .action(wrap(async (id: string, opts: { device?: string }) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), opts.device);
    await c.deleteDeviceTimePlan(d.id, id);
    console.log(`time plan ${id}: deleted`);
  }));

const bundles = program.command("bundles").description("Prey/activity detections (photos & videos)");

bundles
  .command("list", { isDefault: true })
  .description("List bundles, paginated")
  .option("-p, --page <n>", "page number (1-indexed)", "1")
  .option("-f, --from <YYYY-MM-DD>", "filter: from this date")
  .option("-t, --to <YYYY-MM-DD>", "filter: up to this date")
  .option("-o, --order <asc|desc>", "createdAt sort direction", "desc")
  .option("--prey <true|false>", "filter: only prey (true) or only non-prey (false)")
  .option("--viewed <true|false>", "filter: only viewed / unviewed")
  .option("--new", "filter: only never-seen bundles")
  .option("--unsaved", "filter: only bundles not in a collection")
  .action(wrap(async (opts: {
    page: string;
    from?: string;
    to?: string;
    order?: "asc" | "desc";
    prey?: string;
    viewed?: string;
    new?: boolean;
    unsaved?: boolean;
  }) => {
    const data = await client().listBundles({
      page: Number(opts.page),
      from: opts.from,
      to: opts.to,
      order: opts.order ?? "desc",
      onlyPrey: opts.prey === undefined ? undefined : parseBool(opts.prey),
      isViewed: opts.viewed === undefined ? undefined : parseBool(opts.viewed),
      onlyNew: opts.new ? true : undefined,
      onlyUnsaved: opts.unsaved ? true : undefined,
    });
    console.log(JSON.stringify(data, null, 2));
  }));

bundles
  .command("show <id>")
  .description("Show a single bundle")
  .action(wrap(async (id: string) => {
    console.log(JSON.stringify(await client().getBundle(id), null, 2));
  }));

const cat = program.command("cat").description("Cat profile management");

cat
  .command("list", { isDefault: true })
  .description("List cat profiles (alias for top-level `flappie cats`)")
  .action(wrap(async () => { console.log(JSON.stringify(await client().listCats(), null, 2)); }));

cat
  .command("breeds")
  .description("List the cat breeds the API knows about")
  .action(wrap(async () => { console.log(JSON.stringify(await client().catBreeds(), null, 2)); }));

interface CatOpts { name?: string; birthday?: string; gender?: string; breed?: string; weight?: string }

cat
  .command("add")
  .description("Add a new cat profile")
  .requiredOption("--name <name>")
  .option("--birthday <YYYY-MM-DD>")
  .option("--gender <FEMALE|MALE|UNKNOWN>")
  .option("--breed <breed>")
  .option("--weight <kg>")
  .action(wrap(async (opts: CatOpts) => {
    const body: CatRequest = { name: opts.name! };
    if (opts.birthday) body.birthday = opts.birthday;
    if (opts.gender) body.gender = opts.gender.toUpperCase() as CatRequest["gender"];
    if (opts.breed) body.breed = opts.breed;
    if (opts.weight !== undefined) body.weight = Number(opts.weight);
    console.log(JSON.stringify(await client().addCat(body), null, 2));
  }));

cat
  .command("edit <id>")
  .description("Edit an existing cat profile")
  .option("--name <name>")
  .option("--birthday <YYYY-MM-DD>")
  .option("--gender <FEMALE|MALE|UNKNOWN>")
  .option("--breed <breed>")
  .option("--weight <kg>")
  .action(wrap(async (id: string, opts: CatOpts) => {
    const body: Partial<CatRequest> = {};
    if (opts.name) body.name = opts.name;
    if (opts.birthday) body.birthday = opts.birthday;
    if (opts.gender) body.gender = opts.gender.toUpperCase() as CatRequest["gender"];
    if (opts.breed) body.breed = opts.breed;
    if (opts.weight !== undefined) body.weight = Number(opts.weight);
    console.log(JSON.stringify(await client().editCat(id, body as CatRequest), null, 2));
  }));

cat
  .command("delete <id>")
  .description("Delete a cat profile")
  .action(wrap(async (id: string) => {
    await client().deleteCat(id);
    console.log(`cat ${id}: deleted`);
  }));

const graph = program.command("graph").description("Activity graphs at finer time resolutions");

graph
  .command("day <date>")
  .description("Hourly prey-detection graph for a specific day (YYYY-MM-DD)")
  .action(wrap(async (date: string) => {
    const data = await client().preyStats({ groupBy: "hour", startDate: date, endDate: date });
    console.log(JSON.stringify(data, null, 2));
  }));

graph
  .command("period <granularity>")
  .description("Prey-detection graph: granularity = day | month")
  .requiredOption("-s, --start <YYYY-MM-DD>")
  .requiredOption("-e, --end <YYYY-MM-DD>")
  .action(wrap(async (granularity: string, opts: { start: string; end: string }) => {
    if (!["day", "month"].includes(granularity)) throw new Error("granularity must be day or month");
    const c = client();
    console.log(JSON.stringify(await c.preyStats({ groupBy: granularity as "day" | "month", startDate: opts.start, endDate: opts.end }), null, 2));
  }));

graph
  .command("hunting-day <date>")
  .description("Hunting stats for a single day (with hourly prey overlay)")
  .action(wrap(async (date: string) => {
    const c = client();
    const [hunting, prey] = await Promise.all([
      c.huntingStats({ groupBy: "day", startDate: date }),
      c.preyStats({ groupBy: "hour", startDate: date, endDate: date }),
    ]);
    console.log(JSON.stringify({ hunting, prey }, null, 2));
  }));

program
  .command("timeplans [device]")
  .description("(Deprecated alias) List time plans - use 'flappie timeplan list' instead")
  .action(wrap(async (ref?: string) => {
    const c = client();
    const d = resolveDevice(await c.listDevices(), ref);
    console.log(JSON.stringify(await c.getDeviceTimePlans(d.id), null, 2));
  }));

program
  .command("raw <method> <path>")
  .description("Send a raw API call (e.g. flappie raw GET /api/v1/dashboard)")
  .option("-d, --data <json>", "JSON request body")
  .action(wrap(async (method: string, path: string, opts: { data?: string }) => {
    const body = opts.data ? JSON.parse(opts.data) : undefined;
    const res = await client().request(method.toUpperCase(), path, { body });
    console.log(JSON.stringify(res, null, 2));
  }));

program.parse();
