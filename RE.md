# Reverse-engineering the Flappie API

How the API surface in `API.md` and `openapi.yaml` was recovered from the official Android app. Use this when the vendor ships an app update so we can rerun the same flow instead of starting over.

The whole pipeline runs on a Linux box. iPhone-only? See "Without an Android device" below — we didn't have one either.

All paths below are relative to the repo root unless noted.

## TL;DR

```bash
# 1. download the latest .xapk (mobile-format APK bundle) of the Android app
# 2. unzip it, then unzip the arm64 split from inside it
# 3. point blutter at the arm64-v8a/ folder
# 4. parse blutter's asm/flappie/api/api_service.dart for endpoints
# 5. spot-check live against the real API
```

## Prerequisites

- Docker (blutter needs gcc ≥ 13, easiest via the `debian:trixie` image)
- `unzip`
- A clone of [worawit/blutter](https://github.com/worawit/blutter) plus a thin docker wrapper script. The wrapper is shown at the end of this doc — set `BLUTTER` below to its path.

## 1. Get the APK

Flappie is published only on the Play Store. If you don't have an Android device:

- Open `https://play.google.com/store/apps/details?id=com.flappiedoors` in any browser.
- Use a third-party APK mirror (e.g. apkcombo.com) and copy the `.xapk` download link to your Linux box. `.xapk` is a zip-of-apks (the Play Store's split-APK format).
- `curl -L -o Flappie.xapk '<download URL>'`

Note the app build number (the latest snapshot was **1.0.11**) so we know what we're diffing against next time.

## 2. Unpack the bundle

From the repo root:

```bash
mkdir -p xapk-extract && unzip -q -d xapk-extract Flappie.xapk

ls xapk-extract/
# com.flappiedoors.apk           <-- main APK (Java/Kotlin glue, classes.dex)
# config.arm64_v8a.apk           <-- native libs split for 64-bit ARM
# config.armeabi_v7a.apk         <-- 32-bit ARM split (ignore)
# config.en.apk / config.fr.apk  <-- locale resources
# config.xxhdpi.apk              <-- screen-density resources
# manifest.json
```

Extract only the arm64 split — that's where the Flutter engine and Dart AOT snapshot live:

```bash
mkdir -p arm64-extract && unzip -q -d arm64-extract xapk-extract/config.arm64_v8a.apk
ls arm64-extract/lib/arm64-v8a/
# libapp.so          <-- Dart AOT snapshot - THE TARGET
# libflutter.so      <-- Flutter engine (blutter detects the Dart version from this)
# libsentry.so / libsentry-android.so / libdartjni.so / libdatastore_shared_counter.so
```

Optional, mostly not needed but handy for context:

```bash
mkdir -p main-extract && unzip -q -d main-extract xapk-extract/com.flappiedoors.apk
# classes.dex etc. - decompile with jadx if you ever need the Java side:
#   jadx -d ./decompiled --no-imports xapk-extract/com.flappiedoors.apk
```

`xapk-extract/`, `arm64-extract/`, `main-extract/`, `decompiled/` and the `.xapk` file itself are all gitignored.

## 3. Run blutter

Blutter compiles a Dart VM that matches the app's Flutter version, then walks the AOT snapshot to recover class names, method names, string constants and disassembly with symbols.

Set `BLUTTER` to the wrapper script path (see appendix), then:

```bash
"$BLUTTER" "$PWD/arm64-extract/lib/arm64-v8a" "$PWD/blutter-out"
```

First run takes ~15 min (Dart SDK fetch + VM build). Subsequent runs reuse the build. If the app upgrades to a newer Flutter, blutter will pick up the new Dart version, fetch and build that instead — same command.

Output (in `blutter-out/`, gitignored):

- `asm/<package>/<file>.dart` — disassembly with symbols, organised the way the original Flutter project's package tree was. **`asm/flappie/api/api_service.dart` is the goldmine.**
- `pp.txt` — every Dart object pool entry (every string literal, type, etc.)
- `objs.txt` — nested object dump
- `blutter_frida.js` — Frida hook template (we don't need it for static recovery)

## 4. Recover the endpoint surface

Each method in `asm/flappie/api/api_service.dart` looks like this:

```
_ patchDeviceSettings(/* No info */) async {
  // ** addr: 0x827db8, size: 0x138
  …
  // 0x827e20: r16 = "/api/v1/devices"           ; pp+0x9e08
  …
  // 0x827e34: r16 = "/settings"                 ; pp+0x9e10
  …
  // 0x827e88: r2 = "PATCH"                      ; pp+0xc078
  …
  // 0x827ea4: r0 = body=()                      ; Request::body=
  // 0x827eb0: r0 = _sendAuthRequest()
}
```

The HTTP method, URL fragments, and request-body class come straight out of the disassembly. We can extract a one-line summary per method with awk:

```bash
awk '
/^  _ ([a-zA-Z_]+)\(\/\* No info \*\/\) async \{/ {
  if (in_func) print name "|" methods "|" paths "|" body
  match($0, /_ ([a-zA-Z_]+)\(/, m); name=m[1]; methods=""; paths=""; body=""
  in_func = 1; next
}
in_func {
  if (match($0, /r[0-9]+ = "(GET|POST|PUT|PATCH|DELETE)"/, mm)) methods = methods " " mm[1]
  if (match($0, /r[0-9]+ = "(\/[A-Za-z0-9_/?=&-]+)"/, mp)) paths = paths " " mp[1]
  if (!body && match($0, /\] ([A-Za-z]+::toJson)/, mb)) body = mb[1]
}
END { if (in_func) print name "|" methods "|" paths "|" body }
' blutter-out/asm/flappie/api/api_service.dart | sort -u
```

Output looks like:

```
addCat                | POST  | /api/v1/cats                          | AddCatRequestBody::toJson
addDeviceTimePlan     | POST  | /api/v1/devices/ /timeplans           | AddDeviceTimePlanRequestBody::toJson
patchDeviceSettings   | PATCH | /api/v1/devices /settings             |
updateDeviceName      | PATCH | /api/v1/devices                       |
…
```

Each row is method, HTTP verb, URL fragments (concatenated by Dart at runtime), and the body class if any.

### The slash quirk

Look at the `paths` column carefully:

- `addDeviceTimePlan` → `/api/v1/devices/` + id + `/timeplans` (slash before id)
- `patchDeviceSettings` → `/api/v1/devices` + id + `/settings` (**no** slash before id)
- `updateDeviceName` → `/api/v1/devices` + id (no slash, no suffix)

This is real — the backend genuinely differs route-by-route. If you "fix" the URL to put a slash in, you'll get 404s. The Dart code emits the URL exactly as the backend route is defined. Always copy the slashes verbatim from the disassembly.

When you hit a 404, this is the first thing to check.

### Body field names

For each `XxxRequestBody::toJson` reference, find the model:

```bash
ls blutter-out/asm/flappie/api/models/
# activity ai_training authentication bundles cat collection ...
grep -oE '"[a-z_]+"' blutter-out/asm/flappie/api/models/device/add_device_time_plan.dart | sort -u
# "close_time" "end_date" "is_active" "open_status" "open_time" "start_date" "weekdays"
```

For enums, look for ALL-CAPS string literals:

```bash
grep -oE '"[A-Z_]+"' blutter-out/asm/flappie/api/models/device/door_policy.dart | sort -u
# "CLOSED" "OPEN" "OPEN_IN" "OPEN_OUT"
```

`weekday.dart` is special — the integer mapping (Mon=1…Sun=7) lives in the disassembly of `mapWeekdayToApiWeekday`, not as string literals.

### Endpoints constructed at runtime?

Some endpoint paths are concatenations across multiple Dart functions, so they don't show up next to a single method. Two ways to find them:

1. Grep the entire pool: `grep '/api/v1/' blutter-out/pp.txt | sort -u` — every URL literal in the binary lands here.
2. If a method calls `patchDeviceSettings` (or similar) but with a body field we don't yet know, look at *callers* in `asm/flappie/views/settings/.../*_cubit.dart` — they show what fields actually get passed.

Example: `setPowerOnDoorPolicy` in `device_settings_cubit.dart` calls `patchDeviceSettings` with `{ open_status: <DoorPolicy> }`. That's how we knew `open_status` was the real lock/unlock field even though the body type is `dynamic` in the API service.

## 5. Spot-check live

For each newly-discovered endpoint:

```bash
node dist/cli.js raw GET '/api/v1/<path>'
node dist/cli.js raw PATCH '/api/v1/<path>' -d '{"<field>":"<value>"}'
```

422 errors are friendly — pydantic on the backend will tell you exactly which fields are missing and what types they want. The CLI's `flappie raw` dumps the full error body.

## 6. Update API.md, openapi.yaml, the typed client

When the surface changes:

1. Diff the awk output above against the previous snapshot. New rows = new endpoints; removed rows = retired endpoints; changed `paths` = slash quirks shifting.
2. Regenerate the per-method body field lists for any new model files.
3. Edit `src/types.ts` first (single source of truth for shapes), then surface the new methods in `src/client.ts`, then add CLI bindings in `src/cli.ts` if useful.
4. Mirror the changes in `API.md` (human-readable) and `openapi.yaml` (machine-readable).
5. Run `npm run build` and spot-test the live calls.

## Without an Android device — why blutter?

The first instinct is "capture HTTPS from the official app and read the requests". This **does not work** for Flappie:

- Flappie's mobile app is built with **Flutter**. Flutter uses Dart's `dart:io` `HttpClient`, which **ignores the system HTTPS proxy** on both iOS and Android. So Charles, Proxyman, mitmproxy alone get you nothing.
- The fix is `reFlutter`, which patches `libflutter.so` to honour the proxy and bypass cert pinning — but reFlutter only works on Android, and you need a real device or emulator running it.
- We didn't have a host that supported Android emulation, so going via static analysis was the practical choice.

`blutter` sidesteps device requirements entirely — it reads the static AOT snapshot. No device, no traffic capture, no certificates. The trade-off is that it can't show you the *bodies* sent on a specific call; you have to read the Dart source to figure those out. In practice that turned out to be straightforward (see step 4).

If a future app version uses obfuscation that defeats blutter, fall back to: real Android phone (your own or borrowed) + reFlutter + mitmproxy. Blutter's `blutter_frida.js` is a head-start for the Frida side of that flow.

## Appendix — blutter docker wrapper

Drop this next to a clone of [worawit/blutter](https://github.com/worawit/blutter) and `chmod +x` it. Pin `BLUTTER` to its path before running step 3.

```bash
#!/bin/bash
# Run blutter against an arm64-v8a lib dir inside Debian trixie.
# Usage: ./run-in-docker.sh <abs-path-to-arm64-v8a-dir> <abs-path-to-output-dir>
set -euo pipefail

LIB_DIR="${1:?need arm64-v8a dir}"
OUT_DIR="${2:?need output dir}"
mkdir -p "$OUT_DIR"

docker run --rm \
  -v "$(cd "$(dirname "$0")" && pwd)":/blutter \
  -v "$LIB_DIR":/lib-in:ro \
  -v "$OUT_DIR":/out \
  -w /blutter \
  debian:trixie \
  bash -c '
    set -e
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y --no-install-recommends \
      python3-pyelftools python3-requests git cmake ninja-build \
      build-essential pkg-config libicu-dev libcapstone-dev ca-certificates \
      >/dev/null
    python3 blutter.py /lib-in /out
  '
```
