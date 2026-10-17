# chuanhua release switch (client)

One script flips the tree between the committed DEV state and a RELEASE state. Never commit the release state.

| | dev (committed) | release |
|---|---|---|
| `js/build-config.js` `cloudEnv` | `''` (mock server, stub renderer fallback) | the cloud environment id |
| `fnPrefix` | `cloudEnv ? 'chuanhua_' : ''` | always `'chuanhua_'` (`npm run pack` names every function `chuanhua_<name>`) |
| `stubAds` | `!cloudEnv` (true) | `false` |
| `envKind` | derived: `'dev'` | derived: `'prod'` |
| `packOptions.ignore` | tests, tools, ... | the same plus `js/mock-server.js`, `js/stub-render.js` and the server-only prompt bank |
| `adUnits.rewarded` / `adUnits.interstitial` | `''` | the 流量主 ids from `--ad-rewarded` / `--ad-interstitial` (else `''`, ads fail gracefully); the banner id is remote (`app_config`) |
| `appid` in `apps/chuanhua/game/project.config.json` | `wxcd03c1b62d7eb0e0` (shared test AppID) | the real AppID from `--appid` (else the test AppID stays and a warning is printed) |

`js/app.js` also forces `envKind: 'prod'` and `stubAds: false` whenever `cloudEnv` is set, so the combination "cloud env with test ads" cannot exist even if one line is edited by hand. `js/api.js` requires the mock only in mock mode; `js/renderers.js` requires the stub only as a dev fallback and never when `cloudEnv` is set (a screen the real renderer cannot draw draws nothing; if `js/render/index` itself fails to load, boot throws).

## Steps (run in `apps/chuanhua/game`)

1. Working tree clean.
2. Finish the user agreement: replace every `【…】` placeholder in `docs/chuanhua/release/user-agreement.txt`, delete the leading `【草稿…】` line (after the operator has approved the text), then
   `node tools/build-terms.js --release`
   This fails loudly (exit 1, writes nothing) while the draft marker or any placeholder remains. Without `--release` it writes the draft into `js/terms-text.js` (what the dev tree has).
3. `node tools/release-config.js --env <envId> --appid <wx...> --ad-rewarded <adunit-...> --ad-interstitial <adunit-...> --prefixed-functions`
   `--appid` must be `wx` + 16 lowercase hex and the ad ids `adunit-...`; a bad value is refused and changes nothing. `--prefixed-functions` only says explicitly what release always does (`--shared-test-env` is a deprecated alias). Nothing is edited by hand: the switch writes `apps/chuanhua/game/project.config.json` (`appid`, `packOptions.ignore`) and `js/build-config.js` (`cloudEnv`, `fnPrefix`, `stubAds`, `adUnits`).
   Release mode is refused while `js/terms-text.js` still has the draft marker or a `【…】` placeholder.
4. `npm test`: mode-aware, must be green (release assertions run, dev assertions skip). `node tools/release-config.js --status` shows the mode.
5. Upload as 体验版 (founder step).
6. `node tools/release-config.js --dev`, then `git status` must show no change to `js/build-config.js` or `apps/chuanhua/game/project.config.json` (`--dev` restores the test AppID and empty ad units byte for byte). `js/terms-text.js` is committed in whatever state the source is.

## rulesVersion and the agreement

The 接龙公约 and the 用户协议 are agreed to once per `rulesVersion` (`core/config.js`, mirrored by the server). **Every material change to the agreement or the 公约 requires a `rulesVersion` bump** in `core/config.js` (and the cloud functions are redeployed with it). Bumping it makes the server report `rulesRequiredVersion` higher than the player's agreed version, and the client then shows the 公约 again before the next 开接龙 / 接一棒 (agreement text section 十三 promises exactly this). A material change is anything that changes rights, duties, data handling, retention, the violation ladder or the dispute clause; a typo fix or a contact detail is not. After editing the source text, run `node tools/build-terms.js` (the test `terms.test.js` fails if `js/terms-text.js` is out of date).

## What the tests enforce

- `tests/mode.js` decides the mode from `cloudEnv`; `devOnly` / `releaseOnly` skip options. The harness boots an explicit dev build, so the whole suite runs in both modes.
- `tests/release-gate.test.js`: in release, `stubAds` false, both dev files in `packOptions.ignore`, the agreement final; in every mode the mock and the stub are only required lazily and a cloud-mode boot never loads either file.
- `tests/qa-release.test.js` proves it on a temp copy: hand-flipping `cloudEnv` alone fails the gate, the script makes it pass, `--dev` restores both files byte for byte, `tests/release-flags.test.js` covers `--appid`, the ad ids and the prefix, release is refused with a draft agreement.
- `tests/terms.test.js`: the generated module is up to date, the `terms` screen flows, release refusal.

Add a new dev-only file by appending it to `DEV_ONLY_FILES` in `tools/release-config.js`.
