# Changelog

All notable changes to this project will be documented here. The format roughly follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.5.1] - 2026-05-11

### Fixed

- **Auto-refresh of the access token now actually works.** The refresh endpoint reads the refresh JWT from a `refresh-token` HTTP header, not a JSON body — sending it as a body returned a pydantic 422 silently swallowed by `tryRefresh()`, which then propagated as an unauthenticated state to the caller. With this fix the CLI / library stays signed in for as long as the refresh token is valid (currently ~30 days), instead of forcing a manual `flappie login` after the ~12-hour access-token expiry.

### Changed

- `CLOUD_API.md` and `openapi.yaml` updated to document the refresh endpoint's actual header-based contract.

## [0.5.0] - 2026-05-11

Docs-and-DX release: same wire surface as 0.4.0, but the package is meaningfully easier to discover and use.

### Added

- TSDoc on every public `FlappieClient` method — IDE hover and autocomplete now describe what each one does, with usage examples on the load-bearing ones (`patchDeviceSettings`, `listBundles`, `login`).
- README "Library API reference" section: every method grouped by domain (auth / devices / time plans / cats / bundles / stats / errors) with one-line descriptions.
- `CHANGELOG.md` and `RE.md` ship in the npm tarball.
- GitHub repo health: CI workflow (Node 22, `npm ci && build && test`), issue templates (bug / feature) with contact links, PR template.

### Changed

- README leads with `npm install -g flappie-api` (CLI) and `npm install flappie-api` (library). The clone-and-build path moved to a "Develop / contribute" section near the bottom.
- README's old "API reference" section renamed to "Flappie cloud API (under the hood)" with an explicit "regular users don't need this" callout — separates the *library* surface (what consumers want) from the *cloud HTTP API* (what contributors / alternative-client builders want).
- `API.md` renamed to `CLOUD_API.md` so the filename itself signals which API it documents.
- npm-page badges (version, types, license, CI) added to the README.

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

[0.5.1]: https://github.com/ooswald/flappie-api/releases/tag/v0.5.1
[0.5.0]: https://github.com/ooswald/flappie-api/releases/tag/v0.5.0
[0.4.0]: https://github.com/ooswald/flappie-api/releases/tag/v0.4.0
