# Flappie cloud API — undocumented reference

This is a best-effort reference for the cloud API at `https://app.flappiedoors.com`. The vendor has not published a public API; everything here was observed against the live service. Endpoint names, fields and behaviour can change at any time.

Each endpoint is marked with a CLI status:

- ✅ wired up in `flappie-api`
- 🟡 known endpoint, not (yet) wrapped in the CLI — easy add
- 🔒 known but intentionally not implemented (dangerous, mobile-only, or out of scope)

If you're building an alternative client (web app, Home Assistant integration, voice assistant, …), the 🟡 list is your roadmap.

## Conventions

- Base URL: `https://app.flappiedoors.com`
- All endpoints below `/api/v1/` except the auth/refresh ones, which are also under `/api/v1/users/`.
- Auth: `Authorization: Bearer <access_token>`. Refresh tokens via `POST /api/v1/users/refresh`.
- Request and response bodies are JSON (`Content-Type: application/json`) except where noted.

### URL slash quirk

The backend has an inconsistent slash convention between `/api/v1/devices` and the device id:

- **No slash** for `/settings` and the bare-rename PATCH:
  - `GET /api/v1/devices<id>/settings`
  - `PATCH /api/v1/devices<id>/settings`
  - `PATCH /api/v1/devices<id>` (rename — and probably also info-location)
- **Slash** for everything else:
  - `GET /api/v1/devices/<id>/information`
  - `GET /api/v1/devices/<id>/status`
  - `GET /api/v1/devices/<id>/timeplans`
  - `POST /api/v1/devices/<id>/timeplans`
  - `PUT /api/v1/devices/<id>/timeplans/<tpId>`
  - `DELETE /api/v1/devices/<id>/timeplans/<tpId>`

Do not "fix" this — it matches what the backend actually accepts.

### Common enums

`DoorPolicy` (used as `open_status`, sometimes `power_off_open_status`):

| value      | meaning                              |
|------------|--------------------------------------|
| `OPEN`     | open in both directions (= unlocked) |
| `CLOSED`   | closed in both directions (= locked) |
| `OPEN_IN`  | only inbound (keep cat inside)       |
| `OPEN_OUT` | only outbound (keep cat outside)     |

`Gender` (used on cats): `FEMALE` | `MALE` | `UNKNOWN`.

`Weekday` (used in time plans): integer `1` (Monday) through `7` (Sunday).

## Authentication

| Method | Path | Body | CLI |
|--------|------|------|-----|
| POST | `/api/v1/users/login` | `{ email, password }` | ✅ `flappie login` |
| POST | `/api/v1/users/refresh` | (header `refresh-token: <token>`, no body) | ✅ (auto on 401) |
| POST | `/api/v1/users/validate-email` | `{ email }` | 🟡 |
| POST | `/api/v1/users/reset-password` | `{ email }` | 🟡 |
| POST | `/api/v1/users/reset-password/confirm-code` | `{ email, code }` | 🟡 |
| POST | `/api/v1/users/reset-password/set-new-password` | `{ email, code, password }` | 🟡 |
| POST | `/api/v1/users` | `{ email, password, ... }` (register) | 🟡 |

Login response: `{ access_token, refresh_token, token_type }`.

## User profile

| Method | Path | Body | CLI |
|--------|------|------|-----|
| GET | `/api/v1/users` | — | ✅ `flappie whoami` |
| PUT | `/api/v1/users` | `EditUserRequestBody` | 🟡 |
| DELETE | `/api/v1/users` | — (irreversible) | 🔒 |
| PATCH | `/api/v1/users` | `{ ai_training_preference: bool }` | 🟡 |
| PATCH | `/api/v1/users` | `{ language: ... }` | 🟡 |
| PATCH | `/api/v1/users` | `{ receive_marketing_email: bool }` | 🟡 |
| POST | `/api/v1/users/avatar` | multipart upload | 🟡 |
| POST | `/api/v1/users/data-export` | — (kicks off GDPR export) | 🟡 |
| POST | `/api/v1/users/fcm-token` | `{ token }` | 🔒 (push tokens are mobile-only) |

`PATCH /api/v1/users` is overloaded — the body decides which sub-feature is being changed. Send only the field(s) you actually want to update.

## Devices

| Method | Path | Body | CLI |
|--------|------|------|-----|
| GET | `/api/v1/devices` | — | ✅ `flappie devices` |
| GET | `/api/v1/devices/<id>/information` | — | ✅ part of `flappie status` |
| GET | `/api/v1/devices/<id>/status` | — | ✅ part of `flappie status` |
| GET | `/api/v1/devices<id>/settings` | — (note: no slash before id) | ✅ `flappie settings` |
| PATCH | `/api/v1/devices<id>/settings` | any subset of `{ open_status, power_off_open_status, buttons_enabled, prey_detection_user_preference, prey_timed_lock_enabled, prey_timed_lock_duration_seconds, rfid }` | ✅ `flappie lock`, `unlock`, `policy`, `ai`, `buttons`, `power-off-policy` |
| PATCH | `/api/v1/devices<id>` | `{ name }` | ✅ `flappie set-name` |
| PATCH | `/api/v1/devices<id>` | `{ zone_info, country_code, ... }` (location) | 🟡 |
| POST | `/api/v1/devices/assign` | `{ id }` (claim a device) | 🔒 (foot-gun) |
| DELETE | `/api/v1/devices/unassign` | `{ id }` | 🔒 (foot-gun) |

Settings response shape (live):

```json
{
  "id": 744,
  "catflap_id": "<device-id>",
  "open_status": "OPEN",
  "power_off_open_status": false,
  "buttons_enabled": false,
  "rfid": false,
  "prey_detection": false,
  "prey_detection_user_preference": true,
  "prey_detection_system_lock": true,
  "prey_timed_lock_enabled": false,
  "prey_timed_lock_duration_seconds": 900,
  "zone_info": "Europe/Zurich",
  "active_plan": null,
  "created_at": "...",
  "updated_at": "..."
}
```

`PATCH /settings` returns the updated settings object (use it in lieu of a follow-up GET).

## Time plans

Schedules that drive the door automatically. Plans are per-device.

| Method | Path | Body | CLI |
|--------|------|------|-----|
| GET | `/api/v1/devices/<id>/timeplans` | — | ✅ `flappie timeplan list` |
| POST | `/api/v1/devices/<id>/timeplans` | `TimePlan` (see below) | ✅ `flappie timeplan add` |
| PUT | `/api/v1/devices/<id>/timeplans/<tpId>` | `TimePlan` (full replace) | ✅ `flappie timeplan edit` |
| DELETE | `/api/v1/devices/<id>/timeplans/<tpId>` | — | ✅ `flappie timeplan delete` |

`TimePlan` body — all fields required:

```json
{
  "open_time": "07:00",
  "close_time": "22:00",
  "open_status": "OPEN",
  "weekdays": [1, 2, 3, 4, 5],
  "start_date": "2026-05-10",
  "end_date": "2026-12-31",
  "is_active": true
}
```

The server stores times as `HH:MM:SS`; you can send `HH:MM` and the server normalizes.

## Cats

| Method | Path | Body | CLI |
|--------|------|------|-----|
| GET | `/api/v1/cats` | — | ✅ `flappie cats`, `flappie cat list` |
| POST | `/api/v1/cats` | `{ name, birthday?, gender?, breed?, weight? }` | ✅ `flappie cat add` |
| PUT | `/api/v1/cats/<id>` | same as add | ✅ `flappie cat edit` |
| DELETE | `/api/v1/cats/<id>` | — | ✅ `flappie cat delete` |
| POST | `/api/v1/cats/<id>/avatar` | multipart upload | 🟡 |
| GET | `/api/v1/cats/breed-types` | — | ✅ `flappie cat breeds` |

`gender` is `"FEMALE" | "MALE" | "UNKNOWN"`. `breed` is the `key` from the breed-types list (English); the API also returns a localized `value`.

## Bundles (prey/activity detections)

A bundle is a single visit/event detected by the door, with photos and an optional video.

| Method | Path | Query | CLI |
|--------|------|-------|-----|
| GET | `/api/v1/bundles` | `page`, `order_by=createdAt`, `order_direction=asc\|desc`, `fromCreatedAt`, `toCreatedAt` | ✅ `flappie bundles list` |
| GET | `/api/v1/bundles/<id>` | — | ✅ `flappie bundles show` |
| PATCH | `/api/v1/bundles/<id>/mark-as-view` | — | 🟡 |
| DELETE | `/api/v1/bundles/<id>` | — | 🟡 |
| DELETE | `/api/v1/bundles` | bulk body | 🟡 |

List response shape:

```json
{
  "total": 7,
  "page": 1,
  "page_size": 10,
  "total_pages": 1,
  "prev_page": null,
  "next_page": null,
  "records": [
    {
      "id": 803166,
      "catflap_id": "<device-id>",
      "is_viewed": false,
      "is_favorite": false,
      "is_prey": false,
      "is_saved": false,
      "image": "https://flappie.b-cdn.net/.../screenshot_2.png?token=...&expires=...",
      "image_files": [{ "id": ..., "url": "..." }, ...],
      "video_file": { "id": ..., "url": "..." },
      "expired_at": "...",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

Media URLs are time-limited (see `expires=`); fetch what you need quickly or call `GET /<id>` again to get fresh tokens.

## Collections

User-curated groupings of bundles ("favourites" / "albums").

| Method | Path | Body | CLI |
|--------|------|------|-----|
| GET | `/api/v1/collections` | — (paginated) | 🟡 |
| GET | `/api/v1/collections/<id>` | — | 🟡 |
| POST | `/api/v1/collections` | `AddCollectionRequestBody` | 🟡 |
| PUT | `/api/v1/collections/<id>` | `EditCollectionRequestBody` | 🟡 |
| PATCH | `/api/v1/collections/<id>` | toggle favourite | 🟡 |
| DELETE | `/api/v1/collections/<id>` | — | 🟡 |
| POST | `/api/v1/collections/bulk-delete` | `{ ids: [...] }` | 🟡 |

## News / Notifications

| Method | Path | Body | CLI |
|--------|------|------|-----|
| GET | `/api/v1/news/` | — | ✅ `flappie news` |
| PATCH | `/api/v1/news/<id>/read` | — | 🟡 |
| PATCH | `/api/v1/news/read-all` | — | 🟡 |

## Statistics

All stats endpoints accept `group_by_period` and ISO date ranges. The Flutter app uses three named flavours; under the hood they are all the same two endpoints with different `group_by_period` values.

| Method | Path | Query | CLI |
|--------|------|-------|-----|
| GET | `/api/v1/statistics/hunting` | `group_by_period=hour\|day\|week\|month`, `start_date`, `end_date?` | ✅ `flappie stats hunting` |
| GET | `/api/v1/statistics/prey` | same | ✅ `flappie stats prey`, `flappie graph day/period/hunting-day` |

Hunting-stats response includes household / community comparison fields (`flappieverse_avg`, `household_avg`, `hunt_comparison`, `hunt_percentage_diff`, `top_n`).

Period/day-graph responses are arrays of `{ date, event_count, mean_event_count }`.

## Dashboard

| Method | Path | CLI |
|--------|------|-----|
| GET | `/api/v1/dashboard` | ✅ `flappie dashboard` |

`operational_status[]` per device contains:

- `prey_detection_user_preference: bool`
- `prey_detection_system_lock: bool` (system has currently locked the door because of a detected prey)
- `signal_quality: int`
- `status: int` (1 = ok)

## Flappie TV (reels) and reports

The mobile app has a TikTok-style feed of community videos and a reporting flow. None of this is wired up in the CLI but the endpoints exist.

| Method | Path | Body | CLI |
|--------|------|------|-----|
| GET | `/api/v1/flappie-tv` (paginated) | — | 🟡 |
| POST | `/api/v1/flappie-tv` | `{ viewed_reel_ids: [...] }` | 🟡 |
| POST | `/api/v1/flappie-tv/<id>/flag` | flag a reel | 🟡 |
| GET | `/api/v1/reports/subjects` | — | 🟡 |
| POST | `/api/v1/reports` | `CreateReportRequestBody` | 🟡 |
| POST | `/api/v1/video-reports/` | `VideoReportRequestBody` | 🟡 |

## What's intentionally missing

- `DELETE /api/v1/users` — irrecoverable; not exposing a one-shot delete-account command.
- `POST /api/v1/devices/assign`, `DELETE /api/v1/devices/unassign` — claiming/releasing a physical device pairing belongs in the onboarding flow, not a maintenance CLI.
- `POST /api/v1/users/fcm-token` — Firebase Cloud Messaging tokens are useful only inside a real push-receiving app.

If you're building an alternative client these are still part of the API surface; just be deliberate about exposing them.
