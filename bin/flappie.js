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

program.name("flappie").description("Read-only CLI for Flappie cat doors via the cloud API").version("0.1.0");

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
