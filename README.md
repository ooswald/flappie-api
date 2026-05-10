# flappie-cli

A small CLI for [Flappie](https://flappiedoors.com) cat doors. It talks to the cloud API at `app.flappiedoors.com` — the same one the mobile app uses — and lets you script lock / unlock, policy changes, stats and dashboard reads from a terminal or a home-automation system.

> The vendor has not published an official public API. Endpoint names, fields, and behaviour can change at any time. Pin a release if you need stability.
>
> There is no documented local control: the door talks only to the cloud, and so does this CLI. Anything you can do via the official app should be doable here, plus a few raw escape hatches.

## Status

**v0.2 — reads + writes.** Login, device + cat listings, dashboard, stats, news, lock / unlock, door policy, AI toggle, buttons, rename, time-plan listing.

## Install

```bash
git clone <this-repo> flappie-cli
cd flappie-cli
npm install
ln -sf "$(pwd)/bin/flappie.js" ~/.local/bin/flappie
```

Requires Node.js 18+ (for global `fetch`).

## Use

```bash
flappie login -e you@example.com   # prompts for password
flappie devices                    # list doors with state, ai-mode, lock-status
flappie status                     # full info+status of the (only) device
flappie dashboard                  # recent prey, system-lock state, banner
flappie cats                       # cat profiles
flappie stats hunting              # hunting stats grouped by day
flappie stats prey -g hour -s 2025-01-01
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
flappie raw PATCH /api/v1/devices<id>/settings -d '{"open_status":"CLOSED"}'
flappie logout
```

If you have more than one device, pass an id or a name fragment to any device-specific command:

```bash
flappie status garage
flappie lock garden
```

## Config

The access token is stored at `~/.config/flappie/config.json` (mode 0600). You can override the file location or point at a different API host via env:

```bash
FLAPPIE_CONFIG=/path/to/file flappie ...
FLAPPIE_API=https://my-proxy.example.com flappie ...
```

## Endpoints

```
POST   /api/v1/users/login                  { email, password } -> { access_token, refresh_token, token_type }
POST   /api/v1/users/refresh                { refresh_token } -> { access_token, refresh_token? }
GET    /api/v1/users                        current user
GET    /api/v1/devices                      list of { id, name, model, firmware_version, software_version, ... }
GET    /api/v1/devices/<id>/information     { id, name, model, firmware_version, software_version, ai_model, ... }
GET    /api/v1/devices/<id>/status          { state: "unlocked" | "locked", reason, lock_started_at, lock_until }
GET    /api/v1/devices<id>/settings         { open_status, power_off_open_status, buttons_enabled, prey_detection_user_preference, ... }
GET    /api/v1/devices/<id>/timeplans       list of time plans
GET    /api/v1/dashboard                    { blocked_prey, latest_prey_detection, operational_status[], banner, is_timeplan_active }
GET    /api/v1/cats                         cat profiles
GET    /api/v1/news/                        news items
GET    /api/v1/statistics/hunting?group_by_period=...&start_date=...
GET    /api/v1/statistics/prey?group_by_period=...&start_date=...

PATCH  /api/v1/devices<id>/settings         body: any subset of { open_status, power_off_open_status, buttons_enabled, prey_detection_user_preference }
PATCH  /api/v1/devices<id>                  { name }
POST   /api/v1/devices/<id>/timeplans       add a time plan
PUT    /api/v1/devices/<id>/timeplans/<tpId>  edit a time plan
DELETE /api/v1/devices/<id>/timeplans/<tpId>  remove a time plan
PATCH  /api/v1/news/<id>/read               mark notification read
PATCH  /api/v1/news/read-all                mark all read
POST   /api/v1/cats                         add cat
PUT    /api/v1/cats/<id>                    edit cat
DELETE /api/v1/cats/<id>                    delete cat
```

> Note the slash quirk: `/settings` and the bare rename PATCH expect **no** slash between `/api/v1/devices` and the id, while `/information`, `/timeplans`, `/status` do. Use the helper commands and you don't have to think about it.

`open_status` and `power_off_open_status` accept the `DoorPolicy` enum:

| value      | meaning                              |
|------------|--------------------------------------|
| `OPEN`     | open in both directions (= unlocked) |
| `CLOSED`   | closed in both directions (= locked) |
| `OPEN_IN`  | only inbound (keep cat inside)       |
| `OPEN_OUT` | only outbound (keep cat outside)     |

The `dashboard.operational_status[]` entry per device contains:

- `prey_detection_user_preference: bool` — user wants AI prey detection on
- `prey_detection_system_lock: bool` — system has currently locked the door because of detected prey
- `signal_quality: int`
- `status: int` (1 = ok)

## Roadmap

- v0.1: read-only — state, dashboard, stats, cats
- v0.2 (current): write commands — lock / unlock, door policy, ai toggle, buttons, rename, time plans (read)
- v0.3: time-plan CRUD with a sane interactive editor; webhook / cron-friendly poll mode for home-automation

## Notes

- Unaffiliated with Flappie Technologies AG. Use at your own risk.
- Don't aggressively poll — keep intervals at 30s+ to be a polite citizen.
