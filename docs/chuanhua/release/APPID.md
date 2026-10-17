# 传画接龙 AppIDs

- Shared test AppID (development; committed in `apps/chuanhua/game/project.config.json`, founder instruction, CLAUDE.md): `wxcd03c1b62d7eb0e0`. Tests assert it in dev mode; in release mode they accept any valid `wx` + 16 hex AppID (`wechat-compat.test.js`, `checkAppId` in `tests/mode.js`).
- Real registered AppID for the release build: **NOT YET REGISTERED**. The founder registers it in HANDOFF section 0 and tells the CTO. Record it here.

  `REAL_APPID = wx________________`   (fill in after registration)

  `ACCEPTED_NAME = ________________`  (名称 accepted at registration; must equal the in-game title and the 备案 name; the title string is `传画接龙`)

  `CLOUD_ENV_ID = chuanhua-prod-________`  (after HANDOFF section 5)

- **How the real AppID gets into the build (read this):** `tools/release-config.js` has an `--appid <REAL_APPID>` switch (TD-149, rules-check A1 closed; the same switch as bibiyi and 点将台). The CTO runs, on the release branch in `apps/chuanhua/game`: `node tools/release-config.js --env <envId> --appid <REAL_APPID> --prefixed-functions` (add `--ad-rewarded <adunit-...> --ad-interstitial <adunit-...>` once the 流量主 units exist). The switch validates the value (`wx` + 16 lowercase hex; a malformed one changes nothing), writes it into `project.config.json` in release mode only, and prints a warning while the test AppID is still set. Nothing is edited by hand. Run `npm test` after it (the AppID assertions are mode-aware); after the upload `node tools/release-config.js --dev` restores the shared test AppID byte for byte (`build-upload.md` sections 3 and 5). The release state is never committed.
- An AppID is public, not a secret. The AppSecret, the upload key (`MP_UPLOAD_KEY_PATH`) and `GROUP_REF_PEPPER` never go in the repo, in chat or in a doc.
