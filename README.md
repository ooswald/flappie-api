# flappie-api

[![npm version](https://img.shields.io/npm/v/flappie-api.svg)](https://www.npmjs.com/package/flappie-api)
[![types](https://img.shields.io/npm/types/flappie-api.svg)](https://www.npmjs.com/package/flappie-api)
[![license](https://img.shields.io/npm/l/flappie-api.svg)](./LICENSE)
[![CI](https://github.com/ooswald/flappie-api/actions/workflows/ci.yml/badge.svg)](https://github.com/ooswald/flappie-api/actions/workflows/ci.yml)

> **Control your Flappie cat door from Node or the terminal.** Typed TypeScript client with full CRUD for time plans, settings, and prey events. Unofficial, not associated with Flappie Technologies AG.

A typed Node.js client + CLI for [Flappie](https://flappiedoors.com) cat doors. It talks to the cloud API at `app.flappiedoors.com` — the same one the mobile app uses — and lets you script lock / unlock, policy changes, time plans, prey-detection events, stats and dashboard reads from a terminal, a home-automation system, or your own Node app.

This repository was entirely made by Claude Code and will be maintained by it. I did not test everything. Use at your own risk. Submit an issue or PR if something is broken.

> The vendor has not published an official public API. Endpoint names, fields, and behaviour can change at any time. Pin a release if you need stability.
>
> There is no documented local control: the door talks only to the cloud, and so does this client. Anything you can do via the official app should be doable here, plus a few raw escape hatches.

## Install

**As a CLI** (globally on your PATH):

```bash
npm install -g flappie-api
flappie login -e you@example.com
flappie devices
```

**As a library** in your own Node.js project:

```bash
npm install flappie-api
```

```ts
import { FlappieClient } from "flappie-api";

const flappie = new FlappieClient();
await flappie.login("you@example.com", process.env.FLAPPIE_PASSWORD!);
const devices = await flappie.listDevices();
await flappie.lock(devices[0].id);
```

Requires Node.js ≥ 18 (for global `fetch`).

## Use as a library

```ts
import { FlappieClient, FlappieApiError } from "flappie-api";
import { readFileSync, writeFileSync } from "node:fs";

// Persist tokens wherever you like (file, db, redis, env).
const tokenFile = "./flappie-tokens.json";
let auth = {};
try { auth = JSON.parse(readFileSync(tokenFile, "utf8")); } catch { /* first run */ }

const flappie = new FlappieClient({
  auth,
  onAuthChange: (next) => writeFileSync(tokenFile, JSON.stringify(next, null, 2)),
});

if (!flappie.isAuthenticated) {
  await flappie.login(process.env.FLAPPIE_EMAIL!, process.env.FLAPPIE_PASSWORD!);
}

const devices = await flappie.listDevices();
const door = devices[0];

// Typed reads
const settings = await flappie.getDeviceSettings(door.id);
console.log(settings.open_status);            // "OPEN" | "CLOSED" | "OPEN_IN" | "OPEN_OUT"

// Typed writes
await flappie.lock(door.id);
await flappie.setDoorPolicy(door.id, "OPEN_IN");
await flappie.patchDeviceSettings(door.id, { buttons_enabled: false });

// Schedule
await flappie.addDeviceTimePlan(door.id, {
  open_time: "07:00", close_time: "22:00",
  open_status: "OPEN",
  weekdays: [1, 2, 3, 4, 5],
  start_date: "2026-05-10", end_date: "2026-12-31",
  is_active: true,
});

// Prey/activity events
const events = await flappie.listBundles({ from: "2026-05-01", order: "desc" });
for (const b of events.records) {
  console.log(b.created_at, b.is_prey ? "prey" : "cat", b.image);
}
```

Errors are thrown as `FlappieApiError` with `status` and parsed `body` for inspection.

The 401 → refresh-token flow is automatic. If you persist tokens, wire up `onAuthChange` so refreshed tokens are saved.

Token refresh against an arbitrary backend host:

```ts
new FlappieClient({ baseUrl: "https://my-proxy.example.com", auth });
```

## Library API reference

Every method below is exported on `FlappieClient`. All return promises; arguments and return shapes are fully typed via the bundled `.d.ts` files (your IDE will autocomplete and show TSDoc descriptions on hover). The underlying HTTP endpoints are documented separately in [`CLOUD_API.md`](./CLOUD_API.md) — you only need that doc if you're wrapping a new endpoint or building an alternative client.

### Auth

| Method | Description |
|--------|-------------|
| `login(email, password)` | Exchange credentials for a token pair and persist via `onAuthChange`. |
| `logout()` | Clear the token pair. |
| `tryRefresh()` | Manually refresh the access token. Normally invoked automatically on 401. |
| `getUser()` | Current user profile. |
| `isAuthenticated` (getter) | `true` if an access token is set. |
| `authState` (getter) | Read-only snapshot of `{ email, access_token, refresh_token }`. |

### Devices

| Method | Description |
|--------|-------------|
| `listDevices()` | All cat doors on the account. |
| `getDeviceInformation(id)` | Model, firmware, AI model version. |
| `getDeviceStatus(id)` | Realtime state: `unlocked` \| `locked`, lock-until timestamps. |
| `getDeviceSettings(id)` | Door policy, AI / button preferences, prey-timed-lock config, active plan. |
| `patchDeviceSettings(id, patch)` | Update one or more settings fields; returns the full updated object. |
| `setDoorPolicy(id, "OPEN" \| "CLOSED" \| "OPEN_IN" \| "OPEN_OUT")` | Shortcut for `patchDeviceSettings({ open_status })`. |
| `lock(id)` | `setDoorPolicy(id, "CLOSED")`. |
| `unlock(id)` | `setDoorPolicy(id, "OPEN")`. |
| `updateDeviceName(id, name)` | Rename a device. |

### Time plans (schedule)

| Method | Description |
|--------|-------------|
| `getDeviceTimePlans(deviceId)` | Current schedule entries. |
| `addDeviceTimePlan(deviceId, plan)` | Add a new entry (all fields required — see `TimePlanRequest`). |
| `editDeviceTimePlan(deviceId, tpId, plan)` | Full replace of an existing entry. |
| `deleteDeviceTimePlan(deviceId, tpId)` | Remove an entry. |

### Cats

| Method | Description |
|--------|-------------|
| `listCats()` | Cat profiles on the account. |
| `addCat(body)` | Create a profile (only `name` is required). |
| `editCat(id, body)` | Replace a profile. |
| `deleteCat(id)` | Delete a profile. |
| `catBreeds()` | Lookup table for the `breed` field. |

### Bundles (prey / activity events)

| Method | Description |
|--------|-------------|
| `listBundles({ page?, from?, to?, order? })` | Paginated event list with optional `createdAt` date filter and direction. |
| `getBundle(id)` | One event with fresh signed media URLs. |

### Statistics + dashboard

| Method | Description |
|--------|-------------|
| `huntingStats({ groupBy?, startDate?, endDate? })` | Hunting stats with household / community comparison. |
| `preyStats({ groupBy?, startDate?, endDate? })` | Prey-detection time series. Use `groupBy: "hour"` for intra-day. |
| `dashboard()` | Aggregated home-screen payload (operational status, banners, recent prey). |
| `news()` | In-app news feed. |

### Escape hatch

| Method | Description |
|--------|-------------|
| `request(method, path, { body?, query?, auth? })` | Call any endpoint the library hasn't wrapped. Handles auth + refresh automatically. |

### Errors

All API errors throw `FlappieApiError` with:

- `status: number` — HTTP status code
- `body: unknown` — parsed JSON error body (or raw string fallback)
- `message: string` — human-readable summary, e.g. `"PATCH /api/v1/devices<id>/settings -> 422: ..."`

## Use the CLI

### Account, devices, status

```bash
flappie login -e you@example.com   # prompts for password
flappie whoami
flappie devices                    # list doors with state, ai-mode, lock-status
flappie status                     # full info+status of the (only) device
flappie dashboard                  # recent prey, system-lock state, banner
flappie news                       # news items in the app
flappie logout
```

If you have more than one device, pass an id or a name fragment to any device-specific command:

```bash
flappie status garage
flappie lock garden
```

### Lock / unlock and policy

```bash
flappie settings                   # current door policy + ai/buttons settings
flappie lock                       # close in both directions
flappie unlock                     # open in both directions
flappie policy OPEN_IN             # one-way: only entry (keep cat inside)
flappie policy OPEN_OUT            # one-way: only exit (keep cat outside)
flappie ai on                      # enable prey-detection AI
flappie buttons off                # disable physical buttons on the door
flappie power-off-policy CLOSED    # what the door does when battery dies
flappie set-name "Garden Door"     # rename the device
```

### Time plans (schedule)

```bash
flappie timeplan list
flappie timeplan add \
  --open 07:00 --close 22:00 --policy OPEN \
  --days weekdays --start 2026-05-10 --end 2026-12-31
flappie timeplan edit 495 \
  --open 06:30 --close 23:00 --policy OPEN_IN \
  --days all --start 2026-05-10 --end 2026-12-31
flappie timeplan delete 495
```

`--days` accepts `mon,tue,wed,thu,fri,sat,sun` (commas), or shortcuts `weekdays` / `weekend` / `all`. Numbers `1..7` (ISO, Mon=1) work too.

### Bundles (prey/activity events)

```bash
flappie bundles                                 # latest first, page 1
flappie bundles --page 2
flappie bundles --from 2026-05-01 --to 2026-05-08 --order asc
flappie bundles show 803166                     # full record (image + video URLs)
```

Media URLs are time-limited tokens — fetch them quickly or call `bundles show` again.

### Cats

```bash
flappie cat list
flappie cat breeds                              # the API's breed lookup table
flappie cat add --name Mira --gender FEMALE --birthday 2022-04-01 --breed "Maine Coon" --weight 4.2
flappie cat edit 17 --weight 4.4
flappie cat delete 17
```

### Stats and graphs

```bash
flappie stats hunting -g day -s 2026-05-01      # community comparison
flappie stats prey -g hour -s 2026-05-10
flappie graph day 2026-05-10                    # hourly prey graph
flappie graph period day -s 2026-05-01 -e 2026-05-10
flappie graph hunting-day 2026-05-10            # combined hunting + hourly prey
```

### Raw escape hatch

```bash
flappie raw GET /api/v1/devices
flappie raw PATCH /api/v1/devices<id>/settings -d '{"open_status":"CLOSED"}'
```

## Config

The access token is stored at `~/.config/flappie/config.json` (mode 0600). You can override the file location or point at a different API host via env:

```bash
FLAPPIE_CONFIG=/path/to/file flappie ...
FLAPPIE_API=https://my-proxy.example.com flappie ...
```

## Flappie cloud API (under the hood)

> This section is for contributors and developers building their own client. **Regular users of the library/CLI don't need to read it** — use the [Library API reference](#library-api-reference) instead.

The Flappie mobile app talks to an undocumented HTTP API at `https://app.flappiedoors.com`. This package wraps it, but the raw endpoint surface is also documented here:

- [`CLOUD_API.md`](./CLOUD_API.md) — every known endpoint with a status flag (`✅` wrapped, `🟡` not wrapped yet, `🔒` deliberately not wrapped), request/response shapes, and gotchas.
- [`openapi.yaml`](./openapi.yaml) — the same surface as a machine-readable OpenAPI 3.1 spec. Load it into Swagger UI / Stoplight / your code generator of choice.
- [`RE.md`](./RE.md) — how the API was reverse-engineered from the official Android app. Use this when a new app version changes the surface.

The `DoorPolicy` enum used by `open_status` and the CLI `--policy` flag:

| value      | meaning                              |
|------------|--------------------------------------|
| `OPEN`     | open in both directions (= unlocked) |
| `CLOSED`   | closed in both directions (= locked) |
| `OPEN_IN`  | only inbound (keep cat inside)       |
| `OPEN_OUT` | only outbound (keep cat outside)     |

> Slash quirk: `/settings` and the bare device PATCH expect **no** slash between `/api/v1/devices` and the id, while `/information`, `/timeplans`, `/status` do. The library handles both forms internally; only matters if you write your own client or use `flappie raw`.

## Not yet implemented (PRs welcome)

These are documented in `CLOUD_API.md` and `openapi.yaml` but not (yet) wrapped in the library or CLI. If you're building an alternative client — a web app, a Home Assistant integration, a voice-assistant skill — these are the gaps:

- **Notifications**: `mark <id> read`, `mark-all-read`. Trivial PATCH calls.
- **AI training preference, language, marketing-email opt-in**: all `PATCH /api/v1/users` with different body fields.
- **Avatar upload** (user + cat): multipart file POST.
- **Collections** ("albums" of bundles): list / single / create / edit / favourite-toggle / delete / bulk-delete.
- **Bundle write actions**: mark-as-viewed, single delete, bulk delete.
- **GDPR data export**: `POST /api/v1/users/data-export`.
- **Auth flows beyond login**: register, validate-email, forgot-password (send-code → confirm-code → set-new-password).
- **Flappie TV (community reels)**: list, viewed-tracking, flagging, video reports.
- **Reports**: `GET /api/v1/reports/subjects`, `POST /api/v1/reports`.
- **Device location/zone update**: `PATCH /api/v1/devices<id>` with `zone_info` / `country_code` (only the `name` field is currently exposed via `set-name`).

Deliberately not wrapped:

- `DELETE /api/v1/users` — irreversible account deletion. Foot-gun in a CLI.
- `POST /api/v1/devices/assign` / `DELETE /api/v1/devices/unassign` — device pairing belongs in the onboarding flow, not a maintenance CLI.
- `POST /api/v1/users/fcm-token` — Firebase push tokens are useful only inside an actual push-receiving mobile app.

## Develop / contribute

```bash
git clone https://github.com/ooswald/flappie-api.git
cd flappie-api
npm install            # also builds dist/ via the prepare script
npm test               # unit tests for the pure CLI helpers (node:test)
npm run build          # tsc -> dist/
```

Issues and PRs welcome. Bug reports + feature requests go through the [issue templates](https://github.com/ooswald/flappie-api/issues/new/choose); see `CHANGELOG.md` for version history and `RE.md` for how the API was reverse-engineered (useful if the vendor ships an app update and endpoints drift).

## Notes

- Unaffiliated with Flappie Technologies AG. Use at your own risk.
- Don't aggressively poll — keep intervals at 30s+ to be a polite citizen.
