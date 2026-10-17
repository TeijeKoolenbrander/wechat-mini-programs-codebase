'use strict';
// QA rev. 2 (independent): every number and rule the 用户协议 rev. 3 DRAFT promises is checked against the build (core/config.js, core/allowance.js, core/strikes.js, the cloud
// functions' behaviour) and against the text the player actually reads in game (js/terms-text.js). The agreement says it was "checked against" the build; QA does not take that
// on trust. A test marked `todo` is an OPEN BUG (docs/chuanhua/qa/bugs.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG } = require('../core/config');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const TXT = fs.readFileSync(path.join(ROOT, 'docs', 'chuanhua', 'release', 'user-agreement.txt'), 'utf8').replace(/\s+/g, ' ');
const SHIPPED = (() => {
  const m = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(path.join(__dirname, '..', 'js', 'terms-text.js'), 'utf8'))(m, m.exports);
  return m.exports.paragraphs.map((p) => p.text).join(' ').replace(/\s+/g, ' ');
})();

const R = CONFIG.room;
const A = CONFIG.allowances;
/** [description, regex that the agreement text must contain] built from the build's own constants */
const FACTS = [
  ['3-10 players per live game', new RegExp(R.minPlayers + ' 至 ' + R.maxPlayers + ' 位')],
  ['at most 4 rounds after the prompt', new RegExp('最多 ' + R.maxRounds + ' 轮')],
  ['prompt 30 s', new RegExp('选题限时 ' + R.promptSec + ' 秒')],
  ['draw 60 s', new RegExp('画一棒限时 ' + R.drawSec + ' 秒')],
  ['describe 45 s', new RegExp('猜一句限时 ' + R.describeSec + ' 秒')],
  ['20-minute game cap', new RegExp('最长 ' + R.gameMaxMin + ' 分钟')],
  ['lobby idle 30 minutes', new RegExp('等待开局时 ' + R.lobbyIdleMin + ' 分钟没有动静')],
  ['10 rooms created, 30 joined a day', new RegExp('每人每天最多开 ' + A.roomsCreatedPerDay + ' 局、加入 ' + A.roomsJoinedPerDay + ' 局')],
  ['3 free + 2 ad 慢慢传 starts', new RegExp('每天可以免费开 ' + A.freeStarts + ' 条接龙，看完激励视频最多再开 ' + A.adStartsMax + ' 条')],
  ['3 棒 per person per chain', new RegExp('每人最多接 ' + CONFIG.chain.maxPerPerson + ' 棒')],
  ['48 hour chain', new RegExp(CONFIG.chain.lifetimeMs / 3600e3 + ' 小时内传完')],
  ['early reveal from 4 棒', new RegExp('传了 ' + CONFIG.chain.earlyRevealMin + ' 棒及以上')],
  ['80 turns a day', new RegExp('每天最多交出 ' + A.stepsPerDay + ' 棒')],
  ['5 s image check cut-off', new RegExp('大约 ' + CONFIG.moderation.imageSyncTimeoutMs / 1000 + ' 秒内没有结果')],
  ['10 reports a day', new RegExp('每人每天最多举报 ' + A.reportsPerDay + ' 次')],
  ['strike window 30 days', new RegExp('最近 ' + CONFIG.strikes.windowMs / 86400e3 + ' 天计算')],
  ['strike 2 = 24 h', new RegExp('2 次：限制参与 ' + CONFIG.strikes.ladder[1].restrictMs / 3600e3 + ' 小时')],
  ['strike 3 = 7 days', new RegExp('3 次：限制参与 ' + CONFIG.strikes.ladder[2].restrictMs / 86400e3 + ' 天')],
  ['strike 4 = 30 days + review', new RegExp('4 次及以上：限制参与 ' + CONFIG.strikes.ladder[3].restrictMs / 86400e3 + ' 天，并由我们人工复核')],
  ['quiet hours 22:00-08:00', new RegExp(CONFIG.quietHours.fromHour + ':00 至次日 0' + CONFIG.quietHours.toHour + ':00')],
  ['180-day retention', new RegExp('保存 ' + CONFIG.retention.days + ' 天')],
  ['claim lock 150 s = about 2.5 minutes', new RegExp('大约 ' + (CONFIG.chain.claimTtlMs / 60e3 === 2.5 ? '2 分半钟' : 'XX') + '后')],
  ['5-digit contact filter', new RegExp('含 ' + CONFIG.text.digitsReject + ' 位以上数字')],
  ['换一批 limit per pick', new RegExp('换一批（每次选题限 ' + CONFIG.roll.rerollsPerPick + ' 次）')],
  ['3 prompts offered', new RegExp('随机抽出 ' + CONFIG.roll.size + ' 个')],
  ['abandoned chain / closed lobby / signals deleted after 1 day', new RegExp(CONFIG.retention.abandonedDays + ' 天后删除')],
];

test('agreement rev. 3 (.txt): every number it promises equals the build constant it was checked against', () => {
  const wrong = FACTS.filter(([, re]) => !re.test(TXT)).map(([d]) => d);
  assert.deepEqual(wrong, []);
});

test('agreement rev. 3: the clauses that depend on behaviour hold in the build (marker copy, no reward for sharing, no IAP, ads only after a reveal)', () => {
  const copy = require('../core/copy');
  const M = copy.MARKERS;
  for (const t of ['（没来得及画）', '（没来得及写）', '（这一棒没传过来）']) assert.ok(TXT.includes('「' + t + '」'), 'the agreement names ' + t);
  assert.ok(Object.values(M).some((m) => JSON.stringify(m).includes('没来得及画')) && JSON.stringify(M).includes('这一棒没传过来'), 'the build has those very markers');
  assert.match(TXT, /分享不会获得任何奖励/);
  assert.match(TXT, /不出售任何道具，也没有虚拟货币/);
  assert.match(TXT, /插屏广告只会在你离开揭晓页面时出现/);
  assert.equal(CONFIG.ads.interstitial.minLifetimeReveals, 3);
  assert.equal(CONFIG.ads.banner.enabled, false);
});

// OPEN (QA-R2-1): the text the 《用户协议》 screen shows is generated into js/terms-text.js, which was never regenerated after the rev. 3 text was written.
test('the 《用户协议》 the player reads in game (js/terms-text.js) is the rev. 3 text: 80 棒, live rooms, markers, the room limits', () => {
  const wrong = FACTS.filter(([, re]) => !re.test(SHIPPED)).map(([d]) => d);
  assert.deepEqual(wrong, [], 'the shipped agreement text contradicts the build in ' + wrong.length + ' of ' + FACTS.length + ' promises');
  assert.ok(!/每天最多传 40 棒/.test(SHIPPED), 'the v1 40-棒 cap is still in the shipped text');
});

test('agreement rev. 3: the notes to the CTO are current: TD-134 (live-round reporting) is closed by TD-140, so the "build dependency" and the §五.1 caveat must be gone before approval', () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'chuanhua', 'release', 'user-agreement.md'), 'utf8');
  const decisions = fs.readFileSync(path.join(ROOT, 'docs', 'chuanhua', 'decisions.md'), 'utf8');
  assert.match(decisions, /TD-140[^\n]*TD-134 is closed/);
  assert.ok(!/TD-134 \(live-round reporting\) must ship before approval/.test(md), 'the agreement notes still list TD-134 as an open build dependency');
});

test('agreement rev. 3: the version line says 第 1 版 while rulesVersion is 2 (recorded, not a defect): the two are independent', () => {
  assert.match(TXT, /版本：第 1 版/);
  assert.equal(CONFIG.rulesVersion, 2);
});
