# kedupan release switch (client)

One script flips the tree between the committed DEV state and a RELEASE state. Never commit the release state.

| | dev (committed) | release |
|---|---|---|
| `js/build-config.js` `cloudEnv` | `''` (in-memory mock server + stub renderer) | the cloud environment id |
| `fnPrefix` | `''` | `'kedupan_'` with `--shared-test-env`, else `''` |
| `stubAds` | `false` | `false` (must stay false) |
| `adUnits` | `''` | untouched by the script: the founder's 流量主 ids, set by hand |
| `project.config.json` `appid` | `wxcd03c1b62d7eb0e0` (shared test AppID) | `--appid <wx...>` if given, else the test AppID (with a warning) |
| `packOptions.ignore` | tests, tools, ..., cloudfunctions-deploy (the server-only `core/content/anchors.v1.js` and `schedule.v1.js` are NOT ignored: the mock needs them in DevTools) | the same plus `js/mock-server.js`, `js/stub-render.js` AND the server-only `core/content/anchors.v1.js`, `core/content/schedule.v1.js` (the answer key and the 365-day schedule never ship) |
| `cloudfunctionRoot` | `cloudfunctions-deploy/` | `cloudfunctions-deploy/` |

## Steps (run in `apps/kedupan/game`)

1. Make sure the working tree is clean.
2. Build the functions: `cd ../cloudfunctions && npm test && npm run pack` (writes `game/cloudfunctions-deploy/kedupan_<name>/`; git-ignored). Upload them from DevTools.
3. Switch to release:
   `node tools/release-config.js --env <envId> [--shared-test-env] [--appid wx<16 hex>]`
   - `--shared-test-env`: the shared test environment, functions are `kedupan_<name>`. Omit it for a dedicated environment with unprefixed names (deploy with `npm run pack -- --prefix ""`).
   - `--appid`: the real AppID, validated as `wx` + 16 lowercase hex characters and written to `project.config.json`. Without it the script keeps the shared test AppID and prints `WARNING: release build still uses the shared test AppID`.
4. Ad units: set `adUnits` in `js/build-config.js` by hand (the script never touches it).
5. Verify: `npm test`. It is mode-aware: the release assertions run, the dev assertions skip, and it must be green. `node tools/release-config.js --status` prints the mode.
6. Open the folder in DevTools, upload as 体验版 (founder step).
7. Switch back: `node tools/release-config.js --dev` (also restores the test AppID), then `git status` must show no change to `js/build-config.js` or `project.config.json`.

Behaviour in a release build: `js/api.js` requires the mock only in mock mode; `js/renderers.js` never requires the stub when `cloudEnv` is set (a screen the real renderer cannot draw draws nothing; if `js/render/index` itself fails to load, boot throws a clear error instead of showing a fake UI). `js/functions.js` (the cloud function name list) ships.

## What the tests enforce

- `tests/mode.js` decides the mode from `cloudEnv`. `devOnly` / `releaseOnly` are skip options for `test(...)`. The gameplay harness boots an explicit dev build (`DEV_BUILD`) unless a test passes its own, so the whole suite runs in both modes.
- `tests/release-gate.test.js` (three-way split): mode-independent checks always run (lazy requires, cloud boot loads neither dev file, `cloudfunctionRoot` and its ignore entry); `releaseOnly`: `cloudEnv` set, `stubAds` false, both dev files in `packOptions.ignore`; `devOnly`: dev defaults and the dev files not ignored.
- `tests/qa-release.test.js` proves it on a temp copy: hand-flipping `cloudEnv` alone fails the gate; the script makes the release suites pass and the simulated pack holds neither dev file; `--appid` validation; `--dev` restores both files byte for byte.

Add a new dev-only file by appending it to `DEV_ONLY_FILES` in `tools/release-config.js` (and to the list in the gate test; a test asserts they match).

## Server-only content (TD-62)

`core/content/anchors.v1.js` (the answer key) and `core/content/schedule.v1.js` (the 365-day schedule) are copied into the cloud functions by `npm run sync`, and must never ship in the game package. `release-config.js` adds both to `packOptions.ignore` in RELEASE mode only. The committed dev state does not ignore them, because WeChat DevTools honours `packOptions.ignore` and the mock server (dev mode) needs both files to boot. Never upload from the dev state: the first thing to do for an upload is step 3 (the switch). `tests/release-gate-pack.test.js` enforces both sides: in dev the files are NOT ignored; in release they are ignored and a grep over the packed files finds no anchor values, easy/split tags, schedule header or adjacent item ids (`qa-release.test.js` runs it on a temp release copy, so a plain `npm test` in dev also proves it).

## 用户协议 (D-2)

`js/terms-text.js` is generated from `docs/kedupan/release/user-agreement.txt` by `node tools/build-terms.js`. While the source starts with the 【草稿…】 line or holds a 【…】 placeholder, `node tools/build-terms.js --release` and `node tools/release-config.js --env ...` refuse (exit 1). Finish and approve the text, regenerate, then switch. Any material change also needs a rules version bump (`js/clue-ui.js` RULES_VERSION and the server).
