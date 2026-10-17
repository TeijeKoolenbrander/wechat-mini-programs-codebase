# 群友刻度盘: build and upload commands

Author: release. Date: 2026-10-15; **revised 2026-10-16 for the typed clue (D-2): new preconditions, pre-submit checks, 24 functions, 12+.** Build: `kept-ideas/v1` at commit `84c68819a0e55c013bdeec5c2c00596d98277acb` (D-2, CTO final review and sign-off 2026-10-16; the pre-D-2 build was c49019f). **Nothing here has been run for real.** Run it only after the founder has approved this specific version in writing (constitution Art. 5.2). Submitting for review and releasing are done by the founder in mp.weixin.qq.com; agents never do them.

Placeholders: `<envId>` = the cloud environment ID of the real AppID's environment; `<REAL_APPID>` = `wx` + 16 lowercase hex, recorded in `docs/kedupan/release/APPID.md`. Never write the upload key, the AppSecret or `GROUP_REF_PEPPER` into any file, command history or chat.

## 0. Preconditions (all must be true)
- [ ] Founder approved version `1.0.0` for upload (state the version).
- [ ] HANDOFF sections 0-4 done: real AppID, 认证, privacy guide, 备案 submitted (the 备案号 is needed to publish, not to upload), cloud environment created and functions deployed.
- [ ] Content human review signed (HANDOFF 1), because the build ships the line "题库内容由 AI 辅助编写，并经人工审核".
- [ ] **D-2 typed clue (HANDOFF section 4b, steps H14-H16):** the typed-clue build is rebuilt, QA passed AC 83-101, and the CTO has re-run the tests (2026-10-16, 84c6881); the three new functions are deployed (`agreeRules`, `reportClue`, `admin`; names confirmed against the code) and `setClue` has its openapi permission; **H14** live moderation check done (device item E12); **H15** the 发言规则 wording and the 《用户协议》 are signed off and the agreement text is in the build; **H16** a named person owns the report queue.
- [ ] 适龄提示 submitted as **12+** (not 8+).
- [ ] Launch date known; schedule regenerated if it is not 20261101 (`post-release.md` §9).
- [ ] Release branch, not `main`: `git switch -c release/kedupan-1.0.0 kept-ideas/v1` (merging to `main` is a founder decision).

## 1. Cloud functions (separate upload)
Dedicated environment under the real AppID (recommended; functions keep plain names, collections are still `kedupan_`-prefixed server-side):
```
cd apps/kedupan/cloudfunctions
npm test
npm run pack -- --prefix ""
```
Shared test environment instead (test AppID only): `npm run pack` (names `kedupan_<fn>`).
Output: `apps/kedupan/game/cloudfunctions-deploy/<name>/` (git-ignored) plus `MANIFEST.json` (pre-D-2: 21 functions, 4 timers; D-2 build: **24 functions, 4 timers** (`genDaily`, `finalizeDay`, `sweepRounds`, `cleanup`), adding `agreeRules`, `reportClue`, `admin`; confirmed against the code 2026-10-16). `npm test` here is 223 pass, 0 fail on the D-2 build. `npm test` runs sync first and takes about 80 s. Then the founder uploads each folder from WeChat DevTools (`post-release.md` §2-3): "上传并部署：云端安装依赖", and for the four timer folders also "上传触发器".

## 2. Game build switch (run in `apps/kedupan/game`)
**Why the release switch runs first (do not skip it, do not upload from the dev state).** The committed dev state packs everything, including the server-only answer key (`core/content/anchors.v1.js`) and the 365-day schedule (`core/content/schedule.v1.js`), because the dev mock server needs them. Only the release switch adds these two files (and the mock and stub files) to `packOptions.ignore` (`tools/release-config.js`, `SERVER_ONLY_FILES`; TD-62, TD-68). An upload made from the dev state would ship the answer key and the schedule to every player. The gate that checks this runs only in `npm test` in release mode.

The tests pass in release mode with or without `--appid` (re-checked by QA), so the order below (switch, test, add `--appid`) is kept for safety only; the switch is idempotent.
```
cd apps/kedupan/game
git status                                   # must be clean
node tools/release-config.js --env <envId>   # dedicated env; add --shared-test-env only for the shared test env
npm test                                     # expect: 0 fail. D-2 build (84c6881): 442 tests, 439 pass, 3 skipped (the pre-D-2 build had 363 pass); record the numbers in the upload note. Needs the FINAL 用户协议 text (a DRAFT or 【…】 placeholder makes the switch refuse)
node tools/release-config.js --env <envId> --appid <REAL_APPID>
node tools/release-config.js --status        # expect: release (cloudEnv <envId>)
```
**Verify before any upload (RP-8).** After the switch, `project.config.json` `packOptions.ignore` must contain both server-only files. If either is missing, stop: do not upload.
```
node -e "const i=require('./project.config.json').packOptions.ignore.map(x=>x.value);for(const f of ['core/content/anchors.v1.js','core/content/schedule.v1.js'])console.log(i.includes(f)?'ok     ':'MISSING',f)"
```
Expect two `ok` lines (the list also holds `js/mock-server.js` and `js/stub-render.js`). Put the output in the upload note.
What the switch changes: `js/build-config.js` (`cloudEnv`, `fnPrefix` ('' unless `--shared-test-env`), `stubAds: false`), `project.config.json` (`appid`; `packOptions.ignore` gains `js/mock-server.js`, `js/stub-render.js`, `core/content/anchors.v1.js` and `core/content/schedule.v1.js`). Check `fnPrefix` matches the `--prefix` used in step 1 (both empty for the dedicated environment).

Then, by hand, only when the 流量主 units exist (otherwise leave them empty; the game degrades as designed): in `js/build-config.js` set `adUnits: { rewarded: '<unit id>', interstitial: '<unit id>' }` (the banner unit id goes in `app_config`, not here). Bump `appVersion` for any later release.

Verification: the release package of the D-2 build is **832,349 bytes (0.79 MiB; 83 files, measured 2026-10-16 at 84c6881)** against the 4 MB limit (`rules-check.md` §3; the pre-D-2 package was 695,868 bytes). Method: after the switch, sum every file under `apps/kedupan/game` that `packOptions.ignore` does not match (`project.private.config.json` excluded); DevTools shows the size at upload.

**`--allow-draft-terms` is test-only and is not a release option.** `tools/release-config.js` honours it only with `NODE_ENV=test` (it exists so the automated tests can exercise the switch with the draft 《用户协议》). Never use it for an upload: a release build must carry the founder-approved text (H15).

## 3. Upload
**Option A, WeChat DevTools (default; the founder does it).** Open `apps/kedupan/game` as a 小游戏 project (AppID shown = the real one), cloud environment = `<envId>`, 上传, version `1.0.0`, remark "首个版本：每日五张刻度卡、与全国和本群好友对比默契分、出题让群友猜（可自己写提示，先审后发，可举报）、往期刻度练习。". This creates a 开发版本 (development version) in the console.

**Option B, miniprogram-ci (if the founder asks the release engineer to upload; key from the environment only).**
Prerequisites: in MP 开发管理 -> 开发设置 -> 小程序代码上传: generate the upload key (founder), save it **outside the repo**, set `MP_UPLOAD_KEY_PATH` to its path, and add the uploading machine's public IP to the **IP 白名单** (upload fails otherwise; the IP of a home or CI runner changes: re-whitelist or turn the whitelist off per the founder's choice).
```
cd apps/kedupan/game
npm install --no-save miniprogram-ci            # in a temp dir or with --no-save; nothing is committed
node -e "
const ci = require('miniprogram-ci');
const project = new ci.Project({
  appid: '<REAL_APPID>',
  type: 'miniGame',
  projectPath: process.cwd(),
  privateKeyPath: process.env.MP_UPLOAD_KEY_PATH,   // never print this
  ignores: ['node_modules/**/*'],
});
ci.upload({ project, version: '1.0.0', desc: '首个版本：每日五张刻度卡、出题让群友猜（可自己写提示，先审后发，可举报）。', setting: { es6: true, minify: false } })
  .then(r => console.log('uploaded', r.subPackageInfo || ''))
  .catch(e => { console.error(e.message); process.exit(1); });
"
```
(`type: 'miniGame'` is miniprogram-ci's 小游戏 mode [VERIFY against the installed version's README before the first run]. `project.config.json` `packOptions.ignore` is honoured by the upload.)

### 3b. Pre-submit checks for the founder's console step (D-2)
Run these on the 体验版 before pressing 提交审核; the release engineer lists them in the upload note, the founder confirms them.
1. **适龄提示 = 12+.** Set it in 设置 -> 基础设置 -> 基本信息 -> 适龄提示 and check that the launch splash shows the 12+ icon beside 健康游戏忠告. **Not 8+:** 8+ excludes free text exchange with non-friends (`rules-check.md` 1.14).
2. **隐私保护指引 entered with items 9-13** (typed clue, 内容审核记录, 微信内容安全检测, 举报, 违规与限制和发言规则记录) and the old sentence 「游戏内没有任何输入文字的地方」 absent. Screenshot to the CTO.
3. **《用户协议》 and 发言规则:** 设置 shows the final wording (12 characters; strikes 1 warning / 2 -> 24 h / 3 -> 7 d / 4 or more -> 30 d; 180 days; no `【…】` placeholder and no DRAFT line left in the agreement text; the contact email equals the one in the privacy guide).
4. **Cloud console, `setClue`:** env `MODERATION_MODE=live` and `ENV_KIND=prod` (a mock in prod makes every typed clue fail with `SERVER_CONFIG`); openapi permission for `wxa.game.contentSpam.msgSecCheck` (and `security.msgSecCheck` as the fallback) is on; `app_config.live.ugc` = `{createEnabled: true, viewEnabled: true}` and `moderation.textApi` = `game`.
5. **Live smoke test on the 体验版 (device items E12 and E13):** a normal clue (for example 冬天的被窝) is accepted and shared; an obviously abusive test clue is refused with 「这个提示没通过审核，换个说法吧」 and nothing reaches the guesser; 举报 from a second account hides the clue at once; `listReports` shows the report. Use your own accounts; do not test with real offensive text beyond one short test clue.
6. **备案 text** in the console equals `beian.md` §3 (typed clue stated); the 备案 screenshots come from this build.
7. **Kill switch rehearsal:** `setUgc {createEnabled:false}` shows presets only; set it back to true.

## 4. After the upload
```
node tools/release-config.js --dev          # restores the test AppID and the dev files byte for byte
git status                                  # js/build-config.js and project.config.json must show no change
```
Never commit the release state. Report to the founder: version number uploaded (1.0.0), time, and the reminder that **the founder** now sets the 体验版, runs the device pass on it, submits for review (适龄提示 12+ and the 隐私指引 are already done, section 3b) and publishes after the 备案号 is issued.

## 5. Rollback / re-upload
Each upload replaces the development version; the previous 体验版 stays until replaced. A bad published version is rolled back by the founder in the console (版本管理 -> 回退). A bad daily card is fixed in the database (`cloudfunctions/README.md`, "Replacing a bad card"), not by a release.
