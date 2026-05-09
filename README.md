# flappie-cli

Read-only CLI for Flappie cat doors via the cloud API at `app.flappiedoors.com`.

> Reverse-engineered from the official Flappie Android app v1.0.11 (Flutter, AOT-compiled). The vendor has not yet published a public API. There is **no documented local control** - the cat door talks only to the cloud, the CLI does too. When Flappie publishes an official API, swap the endpoints.

## Status

**Read-only as of v0.1.** Lock/unlock/policy actions exist in the app but the action endpoints are constructed at runtime in the Dart binary and aren't extractable via static string analysis. To add write commands we need to capture live HTTPS traffic from the official app (Android emulator + mitmproxy + reFlutter, or charles-proxy on iOS with the unpinned profile). Reading state, stats, dashboard, cats - all works.

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
flappie raw GET /api/v1/devices    # arbitrary endpoint
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

# write/control endpoints not yet captured:
POST/PATCH ?  /api/v1/devices/<id>/...           door lock/unlock, prey-detection toggle, time-plans
```

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

- v0.1 (current): read-only - state, dashboard, stats, cats
- v0.2: write commands once the action endpoints are captured (lock, unlock, time plans, prey-detection toggle)
- v0.3: webhook / cron-friendly poll mode for home-automation integration

## Notes

- Unaffiliated with Flappie Technologies AG.
- Don't aggressively poll - keep intervals at 30s+ to avoid getting flagged.
- Tested against API v1 as of app build 1.0.11.
