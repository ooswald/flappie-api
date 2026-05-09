# flappie-cli

CLI to control Flappie cat doors via the cloud API at `app.flappiedoors.com`.

> Reverse-engineered from the official Flappie Android app (com.flappiedoors v1.0.11). The vendor has not yet published a public API. There is **no documented local control** - the cat door talks to the cloud, the CLI does too. When Flappie publishes an official API, switch to it.

## Install

```bash
cd ~/src/flappie-cli
npm install
ln -sf "$(pwd)/bin/flappie.js" ~/.local/bin/flappie  # if ~/.local/bin is on PATH
```

## Use

```bash
flappie login -e you@example.com   # prompts for password
flappie devices                    # list doors with current policy
flappie status                     # full payload of the (only) device
flappie open                       # force always-open
flappie close                      # force always-locked
flappie auto                       # back to AI prey-detection mode
flappie policy <policy> [device]   # arbitrary policy value
flappie cats                       # list cats
flappie whoami                     # show logged-in user info
flappie raw GET /api/v1/dashboard  # arbitrary endpoint
flappie logout
```

If you have multiple devices, pass an id, serial, or name fragment:

```bash
flappie open hallway
```

## Config

Token is stored at `~/.config/flappie/config.json` (mode 0600). Override via:

```bash
FLAPPIE_CONFIG=/path/to/file flappie ...
FLAPPIE_API=https://testapi.flappiedoors.com flappie ...
```

## Endpoints (from RE)

```
POST   /api/v1/users/login                   -> { access_token, refresh_token }
POST   /api/v1/users/refresh
GET    /api/v1/users
GET    /api/v1/devices
GET    /api/v1/devices/<id>
PATCH  /api/v1/devices/<id>                  body: { door_policy: "..." }
GET    /api/v1/cats
GET    /api/v1/dashboard
```

Door policy values seen in app code:

- `prey_detection`           (default AI mode)
- `always_open`              (CLI shorthand `flappie open`)
- `always_locked`            (CLI shorthand `flappie close`)
- `prey_detection_system_lock`
- `prey_detection_user_preference`

If your tenant uses different value names, run `flappie status` once and copy the `door_policy` field as-is.

## Cloud-only, no LAN

Flappie's local IP (e.g. `10.48.0.74`) does not expose any HTTP service. All control happens via the cloud. The device only talks home; the app does too. We do the same.

## Notes

- This CLI is unaffiliated with Flappie Technologies AG.
- Rate-limit yourself; aggressive polling will get the account flagged.
- Tested against API version v1 as of app build 1.0.11.
