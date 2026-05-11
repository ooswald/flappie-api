# Changelog

All notable changes to this project will be documented here. The format roughly follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-05-10

First public release on npm.

### Added

- `FlappieClient` typed library and `flappie` CLI from a single TypeScript source.
- Authentication: `login`, `logout`, automatic refresh-token flow on 401.
- Devices: `listDevices`, `getDeviceInformation`, `getDeviceStatus`, `getDeviceSettings`, `patchDeviceSettings`, `updateDeviceName`.
- Convenience door-policy helpers: `lock`, `unlock`, `setDoorPolicy`.
- Time plans: full CRUD (`getDeviceTimePlans`, `addDeviceTimePlan`, `editDeviceTimePlan`, `deleteDeviceTimePlan`).
- Cats: list, add, edit, delete, breed-types lookup.
- Bundles (prey/activity events): paginated list with date filters + single fetch.
- Statistics + dashboard.
- CLI commands for all of the above plus `raw <method> <path>` for unwrapped endpoints.
- `CLOUD_API.md` and `openapi.yaml` reference docs.
- `RE.md` reverse-engineering playbook for when the vendor's mobile app updates.
- Unit tests for pure CLI helpers (`parseBool`, `normalizePolicy`, `parseWeekdays`, `summarizeSettings`).

[0.4.0]: https://github.com/ooswald/flappie-api/releases/tag/v0.4.0
