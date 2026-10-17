# 群友刻度盘 typed-clue QA report (build 80db31a, 2026-10-16)

Scope: founder request "type the answer instead of 我在群里说; typed is the default tab, presets the second tab". Tested against `docs/kedupan/spec.md` (6.12, 11.6, 11.7, 13, 17), not the developer summary.

## Commands run
| Command | Result |
|---|---|
| `game`: `npm test` | 438 tests, 435 pass, 0 fail, 3 skipped (dev-only assertions in release mode) |
| `cloudfunctions`: `npm test` (pretest runs sync) | 223 pass, 0 fail (219 existing + 4 new QA tests) |
| `cloudfunctions`: `npm run sync && npm run check` | synced 24 functions, "no drift" |
| `node tools/release-config.js --env env-qa-test --shared-test-env` (no flag) | exit 1, "release refused, the user agreement is not final" (draft marker + 7 placeholders) |
| same with `--allow-draft-terms`, then `game: npm test`, then `--dev` | release state set; game suite 435 pass / 0 fail in release mode; `--dev` restores; `git status` clean afterwards (no diff in `js/build-config.js` / `project.config.json`) |
| `tools/preview/render.js` (ONLY=create,round, 375x812 default and 320x568 large) | 224 PNGs; viewed by me; 30 copied to `docs/kedupan/qa/typed-clue/` |

New test file (test infrastructure only): `apps/kedupan/cloudfunctions/tests/qa-typed-clue.test.js` (real cloud functions on the fake DB/SDK).

## Per-AC verdicts
Evidence = existing test (name prefix) unless "QA" = my new test.

| AC | Verdict | Evidence |
|---|---|---|
| 27 create screen, tabs, preset 6 + free 换一批 | PASS | clue-client "AC 83/84"; render contact sheet (tab bar, 6-preset grid, 发到群里 disabled until picked) |
| 28 setClue rules (other spectrum, NOT_HOST, chat/unknown mode, guess exists) | PASS | suite/clues.js (mock and real); QA: NOT_HOST on draft and open rounds, `chat`/`TEXT`/``/null/7/array modes all rejected |
| 29 only input is the clue; showKeyboard from keyboard.js with maxLength 12 | PASS | clue-client "AC 29"; hygiene; wechat-compat; my grep: single `wx.showKeyboard` at `game/js/keyboard.js:64-69` |
| 30 clue line shapes pre-reveal | PASS | clue.test "AC 91/94/97 clue view"; renders: typed, hidden, paused, chat, preset |
| 33 reveal/host clue line, hidden copy for host and guest | PASS | renders `round__clue_hidden`, `clue_hidden_host`, `clue_reveal_typed`; clue.test view |
| 49 no openid/clueMod/trace id in responses | PASS | clues-real "AC 49 scripted session"; QA scan of getRound as host/guest after report and after every non-pass outcome |
| 53 no clue on any share title/image | PASS | clue-client "AC 96"; code read `share.js:81-84`, `clue-ui.js:178-182` (typed -> fixed line; text never passed) |
| 64 no authorization / rules agreement needed for preset path | PASS | clue-client "AC 85" (sheet only from tap on input); suite |
| 67 cleanup retention incl. typed clue, mod_log, reports, audit | PASS | clues-real "cleanup (AC 67/101)" |
| 77 events harness with typed clue | PASS | qa-server/qa-kpi "AC 77" + clues-real AC 95 |
| 83 typed default | PASS | clue-client "AC 83"; render `create__clue_text_empty` |
| 84 preset second tab, switching keeps state, sends active tab | PASS | clue-client "AC 84" |
| 85 发言规则 | PASS (see B3 for large text) | clue-client "AC 85" x3; server RULES_REQUIRED in suite |
| 86 keyboard | PASS in simulation; device check outstanding (E13/IME) | clue-client "AC 86" x4; renders `clue_kb_*` at both sizes |
| 87 local rules | PASS | clue.test "AC 87" x7 |
| 88 server re-check, no WeChat call, no strike | PASS | suite "AC 87/88"; QA 60+ bypass fixtures: zero accepted, 0 WeChat calls, round bytes unchanged, 0 strikes, 0 mod_log |
| 89 pass stores; version 2 scene 3; general API switch | PASS | clues-real "AC 89" x2 |
| 90 fail closed (all outcomes, 2.1 s timeout, prod+mock) | PASS | clues-real "AC 90" x4 (18 outcomes); QA: text stored nowhere but `mod_log` across every collection |
| 91 report and hide | PASS | suite; QA: OWN_ROUND, DUP_REPORT, invalid reasons, hidden for host/guest/third with text absent |
| 92 strikes ladder | PASS | clue.test "AC 92"; suite |
| 93 admin | PASS | clues-real "AC 93" x4; QA: 4 client openids x 8 ops all FORBIDDEN, zero audit rows, state untouched |
| 94 kill switches | PASS | clues-real "AC 94"; clue-client "AC 94" |
| 95 no text in analytics | PASS | clues-real "AC 95"; clue-client "AC 95"; clue.test sanitizeProps |
| 96 no text on cards/open data/subscribe | PASS | clue-client "AC 96"; `subscribeRound`/`track`/`getGroupDay` index.js do not read clueText (only the synced `core/` copies mention it) |
| 97 legacy chat | PASS | clue-client "AC 97"; render `round__open_chat_clue` |
| 98 send flow | PASS (sim); E13 device | clue-client "AC 98"; suite |
| 99 probing limit | PASS | suite (51st check -> RATE_LIMITED scope day) |
| 100 rule copy / rule line | PASS for the rule line; sheet wording not compared to signed-off H15 text (not yet signed off) | clue-client "AC 100" |
| 101 retention | PASS | clues-real cleanup test |

## Adversarial results (task 2)
Blocked (QA test, real `setClue`, direct calls): full-width digits, ①②, ⑩, Ⅻ, ², Arabic-Indic/Devanagari/Hangzhou numerals, 七十, 七十多, a lone 〇, 50%, 五％, ‰, zero-width / BOM / word-joiner / variation selector inside numerals, emoji-wrapped digits and numerals, space and U+3000 split numerals, end labels (plain, `很`+label, label split with zero-width chars), 中​间, 偏贵, 刻度, Latin and full-width Latin, wx, kana, hangul, combining marks (冬́天, lone mark, 5́, keycap), RLO, LRM, soft hyphen, Hangul filler, braille blank, 13 chars, 13 + emoji tail, 5000 chars, contact words with zero-width/space/middle-dot. Non-string payloads (null, 5, true, array, object, `__proto__`) and bad modes fail. Mock+prod: SERVER_CONFIG (existing test, 4 env combos). Someone else's round: NOT_HOST. Own report: OWN_ROUND; second report: DUP_REPORT. `admin` from client openids: FORBIDDEN, console (null OPENID) works. Every non-pass outcome (risky, thrown error, errcode, no result, unknown suggest, timeout) leaves the round `draft`, `clueMod` absent, text only in `mod_log`; no response carries text or trace id.

## Bugs and findings
No blocker or high bugs. Product code not changed.

- **B1 (low, local rules weakness; recorded by a QA test that flips when fixed).** Punctuation inside a numeral run or position word defeats the substring rules: `七，十`, `七·十`, `中·间` all pass local rules and reach WeChat. Contact words are NOT affected (`微·信` is blocked). Repro: `setClue {clueMode:'text', clueText:'七，十'}` on any open draft round with the rules agreed (mock pass) returns ok. Cause: `game/core/clue.js:100-135` (`hasDigit` / `positionWord` run on the string with punctuation kept; `text.blocklistHit` apparently strips it). Suggested fix: check rules 2-3 also on a copy with `PUNCT_OK` characters removed. It is guidance, not a safety boundary (WeChat check is), so low.
- **B2 (low, spec naming drift).** Server and client return `reason: 'digit'` / `'charset'` while spec 6.12 and AC 88 name `digits` / `chars`. `core/clue.js:35` keeps `REASON_ALIASES`; behavior is consistent between client and server, so only the spec/contract text needs aligning (or the alias exported).
- **B3 (low, UX, 320x568 large text).** 发言规则 sheet (`create__clue_rules`): only bullets 1-3 are visible; bullets 4-5 (违规提示会被隐藏 / 看到不合适的提示，请点「举报」) and the 《用户协议》 / 《用户隐私保护指引》 links are below a scroll area that shows a scrollbar but leaves a blank gap above the buttons (clipped at a line, not filled). The user can tap 同意并写提示 without seeing the privacy links. Repro: render preview `ONLY=create SIZES=320x568 MODES=large`, state `clue_rules`; file `docs/kedupan/qa/typed-clue/320x568_large__create__clue_rules.png`. Code: `game/js/render/clueSheets.js`. Suggest sizing the scroll viewport to the free space, or pinning the links above the buttons.
- **B4 (low, visual, 320x568 large text).** Round screen with a typed clue: the 举报 link abuts the wrapped clue (`提示：「冬天的被` then 举报 touching the last character, 窝」 on the next line). `round__clue_typed`; `game/js/render/round.js:52-70` claims a reserved column. Also the keyboard-open input wraps the placeholder and typed text onto 2 lines (`320x568_large__create__clue_kb_empty.png`), usable but cramped.
- **B5 (process / hardening, `--allow-draft-terms`).** The flag is not in `build-upload.md`, HANDOFF.md, RELEASE.md or any doc (grep: only `tools/release-config.js:102`, `tests/qa-release.test.js:29`, decisions TD-90). Without it, a DRAFT agreement refuses the release flow (verified). But it is a public CLI flag that makes a draft-terms release a one-word mistake. **Recommendation: make it test-only.** In `tools/release-config.js` honor it only when `process.env.NODE_ENV === 'test'` (else print the refusal and exit 1), and have `qa-release.test.js:29` pass `env: {...process.env, NODE_ENV: 'test'}` to `spawnSync`. Alternative: drop the flag and have the tests write a final-looking `terms-text.js` fixture into their temp copy.

## Visual check (task 4)
PNGs in `docs/kedupan/qa/typed-clue/` (375x812 default and 320x568 large): contact sheets `_sheet_create`, `_sheet_round` (all states) plus individual create tab 1 empty / hint, tab 2 preset, keyboard-open empty / typed, 发言规则, warning sheet, round typed clue, hidden placeholder (guest and host), reveal with typed clue, report sheet, legacy chat line. Findings above (B3, B4). Otherwise: tabs, counter 0/12, rule line, inline hints, busy box (重试 / 改用提示词), restricted copy, and the compact keyboard layout (target band visible, input row and 发到群里 on one row) all render without clipping at both sizes. The report sheet shows exactly five reasons and no text field. Note: previews render fixture view models, not the live logic; layout only.

## Device-only checks still needed (cannot be done without WeChat DevTools/phone)
- **E12:** cloud call `wxa.game.contentSpam.msgSecCheck` works from our AppID (permission in `setClue/config.json`, quota before publish); real `risky` / `pass` latency under 2 s.
- **E13:** share sheet opens after the async check (else the 「提示已通过 · 发到群里」 second tap fallback), real `shareAppMessage` timing.
- **Keyboard/IME:** `wx.showKeyboard` with Pinyin composition (maxLength 12 counts code points vs IME composing text), emoji/symbol removal while typing, confirm key closes only, `onKeyboardHeightChange` values on real iOS/Android (the input row above the keyboard at 320x568 and large text), Android back key with the keyboard open, draft preserved through 发言规则 sheet.
- Scroll gesture in the 发言规则 sheet (B3), `wx.openPrivacyContract` link, 设置 → 发言规则.
- Real report flow on a second device, admin takedown from the cloud console (no OPENID context), `ENV_KIND=prod` + `MODERATION_MODE` unset in the deployed env.
- `miniprogram-automator` e2e was not run: WeChat DevTools is not driven from this session.
