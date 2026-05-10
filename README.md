# flappie-cli

CLI for Flappie cat doors via the cloud API at `app.flappiedoors.com`.

> Reverse-engineered from the official Flappie Android app v1.0.11 (Flutter, AOT-compiled). The vendor has not yet published a public API. There is **no documented local control** - the cat door talks only to the cloud, the CLI does too. When Flappie publishes an official API, swap the endpoints.

## Status

**v0.2 - reads + writes.** Action endpoints recovered by static analysis of the Dart AOT snapshot via [blutter](https://github.com/worawit/blutter). Lock/unlock works through `PATCH /api/v1/devices/<id>/settings`; the `open_status` field accepts an enum (`OPEN`, `CLOSED`, `OPEN_IN`, `OPEN_OUT`).

## Install

```bash
cd ~/src/flappie-cli
npm install
ln -sf "$(pwd)/bin/flappie.js" ~/.local/bin/flappie
```

## Use

```bash
flappie login -e you@example.com   # prompts for password
flappie devices                    # list doors with state, ai-mode, lock-status
flappie status                     # full info+status of the (only) device
flappie dashboard                  # recent prey, system-lock state, banner
flappie cats                       # cat profiles
flappie stats hunting              # hunting stats grouped by day
flappie stats prey -g hour -s 2026-05-01
flappie news                       # news items in the app
flappie whoami                     # current user

flappie settings                   # current door policy + ai/buttons settings
flappie lock                       # close in both directions
flappie unlock                     # open in both directions
flappie policy OPEN_IN             # one-way: only entry (keep cat inside)
flappie policy OPEN_OUT            # one-way: only exit (keep cat outside)
flappie ai on                      # enable prey-detection AI
flappie buttons off                # disable physical buttons on the door
flappie power-off-policy CLOSED    # what the door does when battery dies
flappie set-name "Garden Door"     # rename the device
flappie timeplans                  # list configured time plans

flappie raw GET /api/v1/devices    # arbitrary endpoint
flappie raw PATCH /api/v1/devices/<id>/settings -d '{"open_status":"CLOSED"}'
flappie logout
```

If you have multiple devices, pass id or name fragment:

```bash
flappie status garage
```

## Config

Token is stored at `~/.config/flappie/config.json` (mode 0600). Override via env:

```bash
FLAPPIE_CONFIG=/path/to/file flappie ...
FLAPPIE_API=https://testapi.flappiedoors.com flappie ...
```

## Discovered endpoints

```
POST   /api/v1/users/login                       { email, password } -> { access_token, refresh_token, token_type }
POST   /api/v1/users/refresh                     { refresh_token } -> { access_token, refresh_token? }
GET    /api/v1/users                             current user
GET    /api/v1/devices                           list of { id, name, model, firmware_version, software_version, ... }
GET    /api/v1/devices/<id>/information          { id, name, model, firmware_version, software_version, ai_model, ... }
GET    /api/v1/devices/<id>/status               { state: "unlocked" | "locked", reason, lock_started_at, lock_until }
GET    /api/v1/dashboard                         { blocked_prey, latest_prey_detection, operational_status[], banner, is_timeplan_active }
GET    /api/v1/cats                              cat profiles
GET    /api/v1/news/                             news items
GET    /api/v1/statistics/hunting?group_by_period=...&start_date=...
GET    /api/v1/statistics/prey?group_by_period=...&start_date=...
GET    /api/v1/devices/<id>/settings             { open_status, power_off_open_status, buttons_enabled, prey_detection_user_preference, ... }
GET    /api/v1/devices/<id>/timeplans            list of time plans

PATCH  /api/v1/devices/<id>/settings             body: any subset of { open_status, power_off_open_status, buttons_enabled, prey_detection_user_preference }
PATCH  /api/v1/devices/<id>/information          { name }
POST   /api/v1/devices/<id>/timeplans            add a time plan
PUT    /api/v1/devices/<id>/timeplans/<tpId>     edit a time plan
DELETE /api/v1/devices/<id>/timeplans/<tpId>     remove a time plan
PATCH  /api/v1/news/<id>/read                    mark notification read
PATCH  /api/v1/news/read-all                     mark all read
POST   /api/v1/users/fcm-token                   register FCM token (push)
PATCH  /api/v1/users                             update profile (incl. ai-training preference)
POST   /api/v1/cats                              add cat
PUT    /api/v1/cats/<id>                         edit cat
DELETE /api/v1/cats/<id>                         delete cat
```

`open_status` and `power_off_open_status` accept the `DoorPolicy` enum:

| value      | meaning                              |
|------------|--------------------------------------|
| `OPEN`     | open in both directions (= unlocked) |
| `CLOSED`   | closed in both directions (= locked) |
| `OPEN_IN`  | only inbound (keep cat inside)       |
| `OPEN_OUT` | only outbound (keep cat outside)     |

The `dashboard.operational_status[]` entry per device contains:

- `prey_detection_user_preference: bool` - user wants AI prey detection on
- `prey_detection_system_lock: bool` - system has currently locked the door because of detected prey
- `signal_quality: int`
- `status: int` (1 = ok)

## Architecture notes

- App is **Flutter** (Dart compiled to AOT in `libapp.so`)
- Cloud API at `app.flappiedoors.com`, also `testapi.flappiedoors.com`
- Auth: email + password -> short-lived access token + long refresh token (Bearer)
- The door device itself is on Wi-Fi (e.g. `10.48.0.74`) but exposes **no HTTP service on LAN** - control flows only via the cloud
- Firebase project `flappie-technologies.appspot.com` (FCM push, analytics, remote config)
- Sentry error reporting at `o4509678414331904.ingest.de.sentry.io`

## Roadmap

- v0.1: read-only - state, dashboard, stats, cats
- v0.2 (current): write commands - lock/unlock, door policy, ai toggle, buttons, rename, time plans (read)
- v0.3: time plan CRUD with a sane interactive editor; webhook / cron-friendly poll mode for home-automation

## Notes

- Unaffiliated with Flappie Technologies AG.
- Don't aggressively poll - keep intervals at 30s+ to avoid getting flagged.
- Tested against API v1 as of app build 1.0.11.
