#!/usr/bin/env node
'use strict';
/**
 * Release-mode test run on a TEMP COPY (QA infrastructure, not a test: the name has no .test.js so `npm test` does not run it).
 *
 *   node tests/release-mode-check.js            run in apps/chuanhua/game
 *   node tests/release-mode-check.js --keep     keep the temp copy and print its path
 *
 * Why it exists. In release mode (cloudEnv set) the suite insists on a FINAL user agreement. The committed docs/chuanhua/release/user-agreement.txt is a
 * 【草稿】 with 【…】 placeholders (operator data the founder supplies), so a release-mode run against a copy with a hand-made one-line stub agreement
 * fails 7 agreement-content tests (rev. 3 numbers and clauses, terms scroll, the "real text" checks, AC 92-94 string scan). Those failures are a stub
 * artefact: they fail identically at 461b427 (before the 5-reroll change) and at a3dc8f3 (after). A COMPLETE stub is the real agreement text with the
 * draft line removed and the placeholders filled, which is what the founder does at release time (RELEASE.md step 2).
 *
 * Procedure (all on a temp copy, the working tree is never touched):
 *   1. copy .gitignore, apps/chuanhua and docs/chuanhua (no node_modules) to a temp dir  (qa-client / qa-release tests read the root .gitignore)
 *   2. user-agreement.txt: delete the 【草稿…】 line, fill every 【…】 placeholder with example operator data (the 【重要】 marker is kept)
 *   3. node tools/build-terms.js --release   (must succeed: no draft, no placeholder left)
 *   4. node tools/release-config.js --env testenv --appid wx0123456789abcdef --ad-rewarded adunit-abcd1234 --ad-interstitial adunit-efgh5678 --prefixed-functions
 *   5. npm test  (release assertions run, dev-only ones skip)  -> must be 0 failures
 * To compare with an older commit, check it out (or `git archive` it) first and run this script there.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GAME = path.join(__dirname, '..');
const REPO = path.join(GAME, '..', '..', '..');
const keep = process.argv.includes('--keep');

const FILL = [
  [/【H13 审核完成后填入：并经人工逐条审核修改】/g, '并经人工逐条审核修改'],
  [/【生效日期】/g, '2026年10月16日'],
  [/【运营主体名称】/g, '示例运营主体有限公司'],
  [/【联系邮箱】/g, 'support@example.com'],
  [/【运营主体注册地址】/g, '示例市示例路1号'],
  [/【运营主体所在地】/g, '示例市'],
];

/** the draft agreement made final: no draft line, no placeholder (a 【重要】 marker is not a placeholder) */
function finalAgreement(src) {
  let t = String(src).split(/\r?\n/).filter((l) => !/^【草稿/.test(l.trim())).join('\n');
  for (const [re, to] of FILL) t = t.replace(re, to);
  return t;
}

function copy(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (p) => !/[\\/]node_modules([\\/]|$)/.test(p) });
}

function run(cwd, cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && cmd === 'npm', maxBuffer: 1 << 28 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (label) console.log('$ ' + label + '  -> exit ' + r.status);
  return { status: r.status, out };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-relmode-'));
try {
  fs.copyFileSync(path.join(REPO, '.gitignore'), path.join(tmp, '.gitignore'));
  copy(path.join(REPO, 'apps', 'chuanhua'), path.join(tmp, 'apps', 'chuanhua'));
  copy(path.join(REPO, 'docs', 'chuanhua'), path.join(tmp, 'docs', 'chuanhua'));
  const agr = path.join(tmp, 'docs', 'chuanhua', 'release', 'user-agreement.txt');
  const final = finalAgreement(fs.readFileSync(agr, 'utf8'));
  if (/【草稿|【[^重]/.test(final)) {
    console.error('a placeholder is left in the agreement; add it to FILL in tests/release-mode-check.js');
    process.exit(2);
  }
  fs.writeFileSync(agr, final);
  const g = path.join(tmp, 'apps', 'chuanhua', 'game');
  let r = run(g, process.execPath, ['tools/build-terms.js', '--release'], 'node tools/build-terms.js --release');
  if (r.status !== 0) { console.error(r.out); process.exit(1); }
  r = run(g, process.execPath, ['tools/release-config.js', '--env', 'testenv', '--appid', 'wx0123456789abcdef', '--ad-rewarded', 'adunit-abcd1234', '--ad-interstitial', 'adunit-efgh5678', '--prefixed-functions'], 'node tools/release-config.js --env testenv ...');
  if (r.status !== 0) { console.error(r.out); process.exit(1); }
  r = run(g, 'npm', ['test'], 'npm test (release mode)');
  const sum = r.out.split(/\r?\n/).filter((l) => /^ℹ (tests|pass|fail|skipped)/.test(l) || /^✖ /.test(l));
  console.log(sum.join('\n'));
  if (keep) console.log('kept: ' + tmp);
  process.exitCode = r.status === 0 ? 0 : 1;
} finally {
  if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
}
