# 点将台: build and upload commands

Author: release. Date: 2026-10-15. Build: `kept-ideas/v1` @ 3df1b89333d8d05b1d008ce57bfd29b2d1f46452 (the code is identical to 6582873; QA re-check passed: 0 FAIL, 2 device items, AC 16 and AC 75). **Nothing here has been run against the real AppID or the real cloud environment.** The sequence below was rehearsed on a scratch copy of the repo outside the working tree (temp environment id `dianjiangtai-prod-test`, the real AppID string, no upload): see `rules-check.md` section 3. Run it for real only after the founder has approved this specific version in writing (constitution Art. 5.2). Submitting for review and releasing are done by the founder in mp.weixin.qq.com; agents never do them.

Placeholders: `<envId>` = the cloud environment ID of the real AppID's environment (`dianjiangtai-prod-xxxx`, `post-release.md` section 1); the real AppID is **`wx172906d7bfd6036f`** (`APPID.md`). Never write the upload key, the AppSecret or `GROUP_REF_PEPPER` into any file, command history or chat.

> **Which AppID where.** Development, QA and the test harness use the shared test AppID **`wxcd03c1b62d7eb0e0`** (committed in `apps/dianjiangtai/game/project.config.json`). Only the release build uses **`wx172906d7bfd6036f`**, and only through `--appid` on the release switch. The release state is never committed; `--dev` puts the test AppID back.

## 0. Preconditions (all must be true)
- [ ] Founder approved version `1.0.0` for upload, in writing, naming the version: "I approve uploading dianjiangtai version 1.0.0".
- [ ] HANDOFF sections 0-4 done: real AppID confirmed, 适龄提示 submitted, privacy guide entered and popup on, 备案 submitted (the 备案号 is needed to publish, not to upload), cloud environment created, functions deployed, **seed bank imported (>= 60 days, contentVersion 2, configVersion 3; a bank generated before this build is unusable)**, console hardening (H6a) done.
- [ ] **Ad units (not a precondition):** 流量主 needs cumulative UV > 500, which needs a live game, so the first upload has no ids. That is fine (TD-11): with no ad unit ids the release build runs no-fill, showing "暂无广告，本次免费" once per run and never the "广告位（测试）" overlay, because `stubAds` is `true` in the committed dev state and the release switch forces it to `false`. Real ads need both `--ad-rewarded` and `--ad-interstitial` on a later build (`post-release.md` section 7).
- [ ] Device pass (HANDOFF section 5) completed, or its open items accepted by the founder in writing.
- [ ] Release branch, not `main`: `git switch -c release/dianjiangtai-1.0.0 kept-ideas/v1` (merging to `main` is a founder decision, Art. 5.5).
- [ ] Open **`apps/dianjiangtai/game`** in DevTools, never `apps/dianjiangtai` (`APPID.md`, stray root `project.config.json`).

## 1. Cloud functions (separate upload)
Dedicated environment under the real AppID. Every function is deployed as `dianjiangtai_<name>`: that is the only supported route, and the client calls `dianjiangtai_*` in release mode.
```
cd apps/dianjiangtai/cloudfunctions
npm test
npm run pack
```
Output: `apps/dianjiangtai/game/cloudfunctions-deploy/dianjiangtai_<name>/` (git-ignored, in `packOptions.ignore`) plus `MANIFEST.json`: **14 functions, 2 timers** (`dianjiangtai_genDaily`, `dianjiangtai_cleanup`). `npm test` runs `sync` first and takes about 2 minutes: 182 tests, 182 pass, 0 fail at 3df1b89. Then the founder uploads each folder from WeChat DevTools (`post-release.md` section 3): "上传并部署：云端安装依赖", and for the two timer folders also "上传触发器". `dianjiangtai_submitRun` also carries the `subscribeMessage.send` cloud-call permission in its `config.json` (approve it in the console).

## 2. Game build switch (run in `apps/dianjiangtai/game`)
**Why the switch runs first (do not skip it, do not upload from the dev state).** The committed dev state ships the in-memory mock server (`js/mock-server.js`) and the stub renderer (`js/stub-render.js`) and has `cloudEnv ''`, so the game would run without a backend and call un-prefixed function names. Only the release switch sets `cloudEnv`, `fnPrefix = 'dianjiangtai_'` and the AppID and adds the two dev-only files to `packOptions.ignore` (`tools/release-config.js`; `tests/release-gate.test.js` checks it in release mode).

```
cd apps/dianjiangtai/game
git status                                   # must be clean
node tools/release-config.js --env <envId> --appid wx172906d7bfd6036f [--ad-rewarded adunit-... --ad-interstitial adunit-...]
npm test                                     # release mode, mode-aware: expect 0 fail
node tools/release-config.js --status        # expect: release (cloudEnv <envId>)
```
Expected `npm test` figures (379 tests at 3df1b89, about 65 s): **dev state 378 pass, 0 fail, 1 skipped; release state 377 pass, 0 fail, 2 skipped** (re-run by release: dev in the real tree, release on a scratch copy with and without the ad flags; the skipped tests are the dev-only ones). The AppID tests are mode-aware, so `--appid` can be given from the start (unlike the sister games).

**Verify before any upload.** After the switch `project.config.json` must name the real AppID, point `cloudfunctionRoot` at `cloudfunctions-deploy/`, and ignore both dev-only files:
```
node -e "const c=require('./project.config.json');const i=c.packOptions.ignore.map(x=>x.value);console.log('appid',c.appid);for(const f of ['js/mock-server.js','js/stub-render.js','cloudfunctions-deploy','tests','tools'])console.log(i.includes(f)?'ok     ':'MISSING',f)"
node ../../../docs/dianjiangtai/release/tools/package-size.js .
```
Expect `appid wx172906d7bfd6036f`, five `ok` lines, and the size script to print `files 62 bytes 609642` (609,688 with two ad unit ids; 0.581 MiB of 4 MiB, 14.5%, no subpackage; includes the four WAV cues and `share-fallback.png`) and "no dev-only, seed-bank or secret-like files in the package" with exit code 0. Put the output in the upload note. If either dev file is missing from the ignore list or the AppID is still `wxcd03c1b62d7eb0e0`: stop, do not upload.

What the switch changes, and nothing else: `js/build-config.js` (`cloudEnv`, `fnPrefix`, `stubAds: false`, `adUnits`), `project.config.json` (`appid`; `packOptions.ignore` gains `js/mock-server.js` and `js/stub-render.js`; `cloudfunctionRoot`). The banner unit id is not in the client: it is `ads.banner.adUnitId` in the `app_config` record (`post-release.md` section 4). `appVersion` in `js/build-config.js` is `1.0.0`; bump it for later releases (a code edit on the release branch).

## 3. Upload
**Option A, WeChat DevTools (default; the founder does it).** Open `apps/dianjiangtai/game` as a 小游戏 project (the AppID shown must be `wx172906d7bfd6036f`), cloud environment = `<envId>`, 上传, version `1.0.0`, remark "首个版本：每日军令、自由点将、十二战战报与复盘、周日识人、连续出征与往期、群榜与好友榜、同签挑战。". This creates a 开发版本 (development version) in the console.

**Option B, miniprogram-ci (if the founder asks the release engineer to upload; key from the environment only).**
Prerequisites: in MP 开发管理 -> 开发设置 -> 小程序代码上传: generate the upload key (founder), save it **outside the repo**, set `MP_UPLOAD_KEY_PATH` to its path, and add the uploading machine's public IP to the **IP 白名单** (the upload fails otherwise; the IP of a home machine or CI runner changes: re-whitelist, or turn the whitelist off, the founder's choice). Never ask for the key in chat, never print it, never commit it.
```
cd apps/dianjiangtai/game
npm install --no-save miniprogram-ci            # nothing is committed (node_modules is git-ignored)
node -e "
const ci = require('miniprogram-ci');
const project = new ci.Project({
  appid: 'wx172906d7bfd6036f',
  type: 'miniGame',
  projectPath: process.cwd(),
  privateKeyPath: process.env.MP_UPLOAD_KEY_PATH,   // never print this
  ignores: ['node_modules/**/*'],
});
ci.upload({ project, version: '1.0.0', desc: '首个版本', setting: { es6: true, minify: false } })
  .then(r => console.log('uploaded', r.subPackageInfo || ''))
  .catch(e => { console.error(e.message); process.exit(1); });
"
rm -rf node_modules                              # the game has no runtime dependency; remove what was installed
```
(`type: 'miniGame'` is miniprogram-ci's 小游戏 mode [VERIFY against the installed version's README before the first run]. `project.config.json` `packOptions.ignore` is honoured by the upload [VERIFY by comparing the package size DevTools reports with section 2].)

## 4. After the upload
```
node tools/release-config.js --dev          # restores the test AppID, cloudEnv '' and the dev files byte for byte
git status                                  # js/build-config.js and project.config.json must show no change
```
Never commit the release state. Report to the founder: version number uploaded (1.0.0), time, the package size line, and the reminder that **the founder** now sets the 体验版, runs the device pass on it (items marked "real AppID"), submits for review (适龄提示 and the privacy guide are already done) and publishes after the 备案号 is issued. The release engineer never submits or publishes.

## 5. Rollback / re-upload
Each upload replaces the development version; the previous 体验版 stays until replaced. A bad published version is rolled back by the founder in the console (版本管理 -> 回退). A bad daily seed is fixed in the database (`post-release.md` section 8), not by a release.

## 6. CI (not set up; for when it is asked)
No pipeline was asked for in this pack. If asked later: a workflow that on every push runs `npm test` in `apps/dianjiangtai/cloudfunctions` and `apps/dianjiangtai/game` plus `docs/dianjiangtai/release/tools/package-size.js` on a release-switched copy, and uploads only on a manual trigger with the key stored as a CI secret (and the runner's IP whitelisted).
