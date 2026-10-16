# dianjiangtai release switch (client)

One script flips the tree between the committed DEV state and a RELEASE state. Never commit the release state.

| | dev (committed) | release |
|---|---|---|
| `js/build-config.js` `cloudEnv` | `''` (mock server, no backend) | the cloud environment id (`--env`) |
| `fnPrefix` | `cloudEnv ? 'dianjiangtai_' : ''` | **always `'dianjiangtai_'`** (see "Deploy names") |
| `stubAds` | `true` (dev only: the "广告位（测试）" overlay; main.js also ignores it when `cloudEnv` is set) | `false` (the gate fails otherwise) |
| `adUnits` (`rewarded`, `interstitial`) | `''` | `--ad-rewarded`, `--ad-interstitial` (else `''`) |
| `project.config.json` `appid` | `wxcd03c1b62d7eb0e0` (shared test AppID) | `--appid` (else the test AppID stays, with a warning) |
| `packOptions.ignore` | tests, tools, cloudfunctions-deploy, RELEASE.md, ... | the same plus `js/mock-server.js`, `js/stub-render.js` |
| `cloudfunctionRoot` | `cloudfunctions-deploy/` | `cloudfunctions-deploy/` |

`--dev` restores all of it byte for byte (line endings included).

The real release AppID is **`--appid wx172906d7bfd6036f`** (recorded in `docs/dianjiangtai/release/APPID.md`). The test AppID stays the committed value.

## Deploy names: one supported route

`npm run pack` (alias `npm run stage`, in `apps/dianjiangtai/cloudfunctions`) writes `game/cloudfunctions-deploy/dianjiangtai_<name>/` for every function plus a `MANIFEST.json` (git-ignored, in `packOptions.ignore`). Deploy them under those names. The client calls `fnPrefix + name` through the single name table in `js/api.js`, and the release switch sets `fnPrefix = 'dianjiangtai_'` whenever `--env` is given. `--prefixed-functions` (and the old alias `--shared-test-env`) are accepted and are no-ops because the prefix is always on.

## Steps (run in `apps/dianjiangtai/game`)

1. Clean working tree. Launch date and secrets are cloud-side (`cloudfunctions/README.md`).
2. Build the functions: `cd ../cloudfunctions && npm test && npm run pack`. Upload them from DevTools (cloudfunctions README, "Deploy").
3. Switch to release:
   `node tools/release-config.js --env <envId> --appid wx172906d7bfd6036f [--ad-rewarded <adunit-...>] [--ad-interstitial <adunit-...>]`
   - `--appid` must be `wx` + 16 lowercase hex. Without it the shared test AppID stays and the script warns.
   - Ad unit ids not passed stay `''`: with `stubAds=false` (always in a release) rewarded and interstitial then behave as no-fill (D6, H4: the free path once per run, no overlay, no test ad). Pass the ids for the build that goes to players so ads can actually run. The banner id is not in the client: it is `ads.banner.adUnitId` in the server-side `app_config/live` document.
4. Verify: `npm test`. It is mode-aware (`tests/mode.js`): the release assertions run, the dev assertions skip, and it must be green. `node tools/release-config.js --status` prints the mode.
5. Open the folder in DevTools, upload as 体验版 (founder step).
6. Switch back: `node tools/release-config.js --dev`, then `git status` must show no change.

## What the tests enforce

- `tests/mode.js` decides the mode from `cloudEnv`. `devOnly` / `releaseOnly` are skip options for `test(...)`; `checkAppId` is the mode-aware AppID assertion. The harness boots an explicit dev build through the `wx.__dianjiangtaiTest` seam (read only by `js/main.js`), so the gameplay suite runs in both modes.
- `tests/release-gate.test.js`: in release, `stubAds` is false, `fnPrefix` is `dianjiangtai_` and both dev files are in `packOptions.ignore`; in every mode the mock and the stub are only required lazily, a cloud-mode boot never loads either (and only calls `dianjiangtai_*`), and a package with the files hidden still boots and starts the daily.
- `tests/qa-release.test.js` proves it on a temp copy: hand-flipping `cloudEnv` alone fails the gate; the script makes it pass; `--appid` and the ad flags are written and validated; `--dev` restores both files byte for byte; a DevTools-style `project.private.config.json` and a reformatted `project.config.json` do not matter.

A new dev-only file under `js/` goes into `DEV_ONLY_FILES` in `tools/release-config.js` and the gate test list.
