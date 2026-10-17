# 传画接龙: build and upload commands

Author: release. Date: 2026-10-15. **Nothing here has been run for real** (the release switch, the agreement build and the tests were run only on a scratch copy with a stub agreement; results in `release-checklist.md` and `rules-check.md` section 8). Run it only after the founder has approved this specific version in writing (constitution Art. 5.2). Submitting for review and releasing are done by the founder in mp.weixin.qq.com; agents never do them.

Placeholders: `<envId>` = the cloud environment ID of the real AppID's environment (`chuanhua-prod-xxxx`); `<REAL_APPID>` = `wx` + 16 lowercase hex, recorded in `docs/chuanhua/release/APPID.md`. Never write the upload key, the AppSecret or `GROUP_REF_PEPPER` into any file, command history or chat.

**Differences from the sister packs, all verified in the code** (details: `rules-check.md` section 11): `tools/release-config.js` now has `--appid`, `--ad-rewarded`, `--ad-interstitial` and `--prefixed-functions` (A1-A3 closed; `--shared-test-env` is a deprecated alias, and release is always `chuanhua_`-prefixed); `npm run pack` (not `stage`) writes the deploy folders; there is no launch-date setting.

## 0. Preconditions (all must be true)
- [ ] Founder approved version `1.0.0` for upload, in writing: "I approve uploading chuanhua version 1.0.0".
- [ ] HANDOFF sections 0-7 done or knowingly accepted: real AppID in `APPID.md`; **用户协议 final** (section 1 below); **H13 signed** (the 人工审核 placeholder is filled only after it); privacy guide entered; 备案 submitted (the 备案号 is needed to publish, not to upload); cloud environment created and functions deployed; **V16 proven (D1) or the async fallback accepted in writing**; device pass done or its open items accepted.
- [ ] 适龄提示 submitted (12+ recommended).
- [x] QA final re-check closed: QA rev. 3 gate passed: 0 FAIL, 148 PASS, 7 DEVICE (AC 32, 36, 50, 68, 99, 148, 155), 8 REMOVED-verified; QA-R3-1 fixed after the gate (TD-148) (`docs/chuanhua/qa/ac-matrix.md`). CTO final review and sign-off DONE 2026-10-15 (build `a8a86d3e534015a364d5263d21be20685318bef7`).
- [ ] Release branch, not `main`: `git switch -c release/chuanhua-1.0.0 kept-ideas/v1` (merging to `main` is a founder decision).
- [ ] Working tree clean: `git status` shows nothing under `apps/chuanhua` or `docs/chuanhua` (the untracked `project.config.json` files of other apps are not part of this game).

## 1. Finalise the 用户协议 (founder or counsel decides the text; then the CTO runs the build)
The agreement is a legal text; the release engineer does not edit its wording.
1. Founder / counsel replaces every 【…】 placeholder in `docs/chuanhua/release/user-agreement.txt` (list in `rules-check.md` section 10: 【生效日期】 x2, 【运营主体名称】 x2, 【联系邮箱】 x2, 【运营主体注册地址】, 【运营主体所在地】, and the §一.12 【H13 审核完成后填入：并经人工逐条审核修改】 **only after H13 is signed**). Keep the style marker 【重要】 as it is: it is not a placeholder.
2. Delete the first line (the 【草稿：未经运营主体审定…】 notice) after approving the text. Keep `user-agreement.md` in step (its change notes; QA-R2-7).
3. If the wording changed rights, duties, retention, the violation ladder or the dispute clause: bump `rulesVersion` in `apps/chuanhua/game/core/config.js` **and redeploy the cloud functions** (they copy `core/`). Otherwise no bump.
4. In `apps/chuanhua/game`:
```
node tools/build-terms.js --release     # exit 1 and nothing written while the draft line or any 【…】 remains; else "wrote js/terms-text.js: N paragraphs (release checks passed)"
node tools/build-terms.js --check       # exit 0: js/terms-text.js equals what the source gives
```
5. Commit the final `user-agreement.txt`, `user-agreement.md` and regenerated `js/terms-text.js` on the release branch (text only; `terms.test.js` fails on drift).

## 2. Cloud functions (separate upload, no key needed)
```
cd apps/chuanhua/cloudfunctions
npm test            # expect 0 fail (rev. 2.1 build a8a86d3: 402 tests, 402 pass, 0 skipped, 0 todo, a few minutes)
npm run check       # no drift of the copies, the generated deploy files or database/rules.json
npm run pack        # writes ../game/cloudfunctions-deploy/chuanhua_<name>/ for the 33 functions + MANIFEST.json (git-ignored)
```
`pack` names the folders `chuanhua_<name>` (default prefix; `--prefix` exists but **do not use it**: README, timers, push route, admin commands and the client prefix all assume `chuanhua_`). The founder deploys each folder from WeChat DevTools (`post-release.md` section 3): right-click -> 上传并部署：云端安装依赖.

## 3. Game build switch (run in `apps/chuanhua/game`)
Order matters: three tests assert the test AppID even in release mode (`wechat-compat.test.js`), so **test first, change the AppID second**.
```
cd apps/chuanhua/game
git status                                                          # must be clean
node tools/build-terms.js --release                                 # section 1, step 4
node tools/release-config.js --env <envId> --appid <REAL_APPID> --ad-rewarded <adunit-...> --ad-interstitial <adunit-...> --prefixed-functions   # cloudEnv, fnPrefix='chuanhua_', stubAds=false, real AppID, ad units; ignores mock, stub and the server-only prompt bank
node tools/release-config.js --status                               # expect: release (cloudEnv <envId>)
npm test                                                            # expect (scratch measure, release mode, build a8a86d3): 542 tests, 529 pass, 0 fail, 13 skipped, 0 todo; the count changes slightly with the final agreement text and later fixes
```
The switch refuses release mode while `js/terms-text.js` carries the draft marker or a 【…】 placeholder, and refuses a malformed `--appid` (`wx` + 16 lowercase hex) or ad id (`adunit-...`) without changing anything. It writes the real AppID and the ad ids itself; nothing is edited by hand. Check the result (never commit it):
```
node -e "const c=require('./project.config.json');console.log(c.appid,c.cloudfunctionRoot)"
node -e "const c=require('./project.config.json');console.log(c.packOptions.ignore.map(i=>i.value).join(','))"
```
Expect the real AppID, `cloudfunctions-deploy/` and an ignore list containing `js/mock-server.js`, `js/stub-render.js`, `core/prompts.js`, `core/content/prompts.v1.js`, `core/content/prompts.v2.js`. **If any of those is missing, or the AppID is still `wxcd03c1b62d7eb0e0`: stop, do not upload.**

What the switch changes, and nothing else: `js/build-config.js` (`cloudEnv`, `fnPrefix`, `stubAds`, `adUnits.rewarded`, `adUnits.interstitial`) and `project.config.json` (`appid`, `packOptions.ignore`). `--dev` restores both byte for byte (test AppID `wxcd03c1b62d7eb0e0` and empty ad units included).

Ad units, only when the 流量主 units exist (otherwise leave `--ad-rewarded` / `--ad-interstitial` out; the game degrades as designed): the switch puts the rewarded and interstitial ids into the `adUnits` line of `js/build-config.js` (ad unit ids are not secrets) and `--dev` empties them again. The **banner** id goes in `chuanhua_app_config` (`live.ads.banner.adUnitId`), though the client also falls back to `adUnits.banner`. Bump `appVersion` (`1.0.0`) in the same file for later releases.

Size check (expect 81 files, 831,193 bytes = 0.793 MiB of 4 MiB; `rules-check.md` section 8). DevTools shows the size at upload.

## 4. Upload
**Option A, WeChat DevTools (default; the founder does it).** Open `apps/chuanhua/game` as a 小游戏 project (the AppID shown must be the real one), cloud environment = `<envId>`, 上传, version `1.0.0`, remark:
```
首个版本：群里开一局，3到10位群友同时在线，每人选一个题目，轮流画画、猜一句，传完一起揭晓；也可用慢慢传分几天传完。所有图片和文字先审核再展示，可举报。
```
This creates a 开发版本 (development version) in the console.

**Option B, miniprogram-ci (only if the founder asks the release engineer to upload; the key comes from the environment only).** Prerequisites (founder): in MP 开发管理 -> 开发设置 -> 小程序代码上传 generate the upload key, save it **outside the repo**, set `MP_UPLOAD_KEY_PATH` to its path, and add the uploading machine's public IP to the **IP 白名单** (**the upload fails otherwise; a home or CI IP changes: re-whitelist, or turn the whitelist off, the founder's choice**). Never paste the key.
```
cd apps/chuanhua/game
npm install --no-save miniprogram-ci            # nothing is committed; remove node_modules afterwards
node -e "
const ci = require('miniprogram-ci');
const project = new ci.Project({
  appid: '<REAL_APPID>',
  type: 'miniGame',
  projectPath: process.cwd(),
  privateKeyPath: process.env.MP_UPLOAD_KEY_PATH,   // never print this
  ignores: ['node_modules/**/*'],
});
ci.upload({ project, version: '1.0.0', desc: '首个版本', setting: { es6: true, minify: false } })
  .then(r => console.log('uploaded', r.subPackageInfo || ''))
  .catch(e => { console.error(e.message); process.exit(1); });
"
rm -rf node_modules
```
(`type: 'miniGame'` is miniprogram-ci's 小游戏 mode [VERIFY against the installed version's README before the first run]. `packOptions.ignore` is honoured by the upload.)

## 5. After the upload
```
node tools/release-config.js --dev          # restores cloudEnv '', the test AppID, empty ad units and the dev ignore list byte for byte
git status                                  # js/build-config.js and project.config.json must show no change; js/terms-text.js shows the final agreement, which is committed
```
Never commit the release state. Report to the founder: version uploaded (1.0.0), time, and the reminder that **the founder** now sets the 体验版, runs the device pass on it, submits for review (适龄提示 and the privacy guide are already done) and publishes after the 备案号 is issued.

## 6. Founder: submit for review (console, never by an agent)
版本管理 -> 开发版本 -> 提交审核: choose the 开发引擎 (native JavaScript on Canvas) [VERIFY option name], confirm the privacy guide and 适龄提示, paste the 版本更新说明 (the remark above), optional 宣传图 (`screenshots/02, 04, 07, 08, 03`), the 开发者信息 the form requires, submit. Review takes about 1 natural day. After approval **and the 备案号**, you click 发布.

## 7. Rollback / re-upload
Each upload replaces the development version; the previous 体验版 stays until replaced. A bad published version is rolled back by the founder in the console (版本管理 -> 回退). A content emergency is handled without a release: `chuanhua_admin` `setUgc {viewEnabled:false}` (every content view shows a placeholder within 10 s), `removeChain` / `removeRoom`, `setModeration` (`post-release.md` section 8). A bad prompt is retired only by a code release (`retired: true`).
