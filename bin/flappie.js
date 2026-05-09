#!/usr/bin/env node
import { program } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Flappie, FlappieApiError } from "../lib/flappie.js";
import { configPath } from "../lib/config.js";

function fail(err) {
  if (err instanceof FlappieApiError) {
    console.error(`error: ${err.message}`);
  } else {
    console.error(err.stack || String(err));
  }
  process.exit(1);
}

async function prompt(q, { hidden = false } = {}) {
  const rl = createInterface({ input, output });
  if (hidden) {
    // suppress echo
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
  if (!ref) {
    if (devices.length === 1) return devices[0];
    throw new Error(`More than one device. Specify by id or name: ${devices.map(d => d.name ?? d.id).join(", ")}`);
  }
  const r = ref.toLowerCase();
  const match = devices.find((d) =>
    String(d.id).toLowerCase() === r ||
    (d.serial && String(d.serial).toLowerCase() === r) ||
    (d.name && d.name.toLowerCase().includes(r))
  );
  if (!match) throw new Error(`Device not found: ${ref}. Available: ${devices.map(d => d.name ?? d.id).join(", ")}`);
  return match;
}

program.name("flappie").description("Control Flappie cat doors via the cloud API").version("0.1.0");

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
    try {
      const f = new Flappie();
      const u = await f.getUser();
      console.log(JSON.stringify(u, null, 2));
    } catch (e) { fail(e); }
  });

program
  .command("devices")
  .description("List all devices")
  .action(async () => {
    try {
      const f = new Flappie();
      const list = await f.listDevices();
      const devices = Array.isArray(list) ? list : list.data ?? list.items ?? list.devices ?? [];
      if (!devices.length) {
        console.log("(no devices)");
        return;
      }
      for (const d of devices) {
        const name = d.name ?? d.serial ?? d.id;
        const policy = d.door_policy ?? d.doorPolicy ?? "?";
        const online = d.is_online ?? d.online ?? d.status ?? "?";
        console.log(`  ${String(d.id).padEnd(36)}  ${String(name).padEnd(20)}  policy=${policy}  online=${online}`);
      }
    } catch (e) { fail(e); }
  });

program
  .command("status [device]")
  .description("Show device status (full payload)")
  .action(async (ref) => {
    try {
      const f = new Flappie();
      const list = await f.listDevices();
      const devices = Array.isArray(list) ? list : list.data ?? list.items ?? list.devices ?? [];
      const d = resolveDevice(devices, ref);
      const full = await f.getDevice(d.id);
      console.log(JSON.stringify(full, null, 2));
    } catch (e) { fail(e); }
  });

async function applyPolicy(ref, policy) {
  const f = new Flappie();
  const list = await f.listDevices();
  const devices = Array.isArray(list) ? list : list.data ?? list.items ?? list.devices ?? [];
  const d = resolveDevice(devices, ref);
  const res = await f.setDoorPolicy(d.id, policy);
  console.log(`${policy.padEnd(20)} → ${d.name ?? d.id}`);
  return res;
}

program
  .command("open [device]")
  .description("Force the door to always-open")
  .action(async (ref) => { try { await applyPolicy(ref, "always_open"); } catch (e) { fail(e); } });

program
  .command("close [device]")
  .description("Force the door to always-locked")
  .action(async (ref) => { try { await applyPolicy(ref, "always_locked"); } catch (e) { fail(e); } });

program
  .command("auto [device]")
  .description("Switch back to AI prey-detection mode")
  .action(async (ref) => { try { await applyPolicy(ref, "prey_detection"); } catch (e) { fail(e); } });

program
  .command("policy <policy> [device]")
  .description("Set arbitrary door policy (e.g. always_open, always_locked, prey_detection)")
  .action(async (policy, ref) => { try { await applyPolicy(ref, policy); } catch (e) { fail(e); } });

program
  .command("cats")
  .description("List cats")
  .action(async () => {
    try {
      const f = new Flappie();
      const list = await f.listCats();
      console.log(JSON.stringify(list, null, 2));
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
