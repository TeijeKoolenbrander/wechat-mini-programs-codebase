# core/ contracts (群友刻度盘)

Pure JS (CommonJS). No `wx`, no DOM, no clock, no randomness: callers pass `nowMs` and an `rng`/random float (enforced by `tests/hygiene.test.js`). Relative `.js` requires only (WeChat cannot require `.json`). The cloud functions run this exact folder (`cloudfunctions/scripts/sync-core.js`), so client, mock server and server cannot drift (AC 7).

## Content the content writer must deliver (they own these; this folder only loads them)

| File | Owner | Format |
|---|---|---|
| `content/spectra.v1.js` | content writer | `module.exports = { contentVersion: 1, categories: [{key,label}] x12, spectra: [{id:'s001', left, right, cat, items:[{id:'s001i01', text, anchor:5..95 int, tags?:string[]}] }] }` exactly as spec 4.1 |
| `content/forbidden.v1.js` | content writer | not loaded by the game; used by their validation test |
| `content/schedule.v1.js` | **generated** by `node tools/build-schedule.js` once the library exists (do not hand-write) | `module.exports = { scheduleVersion:1, contentVersion:1, launchDateKey:'YYYYMMDD', days:[[itemId x5], ...] }`, `days[0]` = issue 1 |

`content.getContent(1)` does `require('./content/spectra.v1')` lazily and returns `null` while the file is absent (the mock server then throws a clear "content library missing"). Tests use `tests/fixtures/spectra.fixture.js` through `createContent(raw)`; they never touch the real file.

**What the game needs from the library beyond spec 4.1** (the content writer's test should enforce these):
- `tags` drive scheduling. Allowed: `easy`, `split`, `season:spring|summer|autumn|winter`, `festival:<key>` with `<key>` one of `newyear spring lantern dragonboat qixi midautumn national` (`schedule.FESTIVALS`; an unknown festival key fails `build-schedule`). Add a key by adding its dates there (verify lunar dates against the official calendar).
- **Capacity:** a 365-day schedule with no repeated item needs at least 365 `easy` items (card 1 each day) and at least 365 `split` items (each day needs one; an item cannot be both in practice) plus enough variety that 5 distinct categories remain after the 21-day spectrum gap. Check with `node tools/build-schedule.js --capacity`. Recommended: >= 450 `easy` and >= 450 `split` of the 3,000 items, spread over all 12 categories.
- `easy` should mean anchor <= 20 or >= 80, `split` anchor roughly 35..65 (editor judgement; only the tag is checked by the schedule).
- Item ids are stable forever; the server stores item ids and copies the text into `daily_sets`.

## Modules

| File | Exports (all pure) |
|---|---|
| `config.js` | `CONFIG` (frozen): scoring constants, windows, group/board caps, round rules, per-day limits, interstitial defaults/clamps |
| `date.js`, `rng.js` | copied unchanged from 点将台: `beijingDateKey, dateKeyToMs, addDays, daysBetween, issueNo, ...`; `mulberry32, hash32, sub, shuffle, int, pick` |
| `score.js` | `cardScore(d)`, `cardLabel(d)`, `scoreAt(p, ref) -> {d, score, label}`, `dayBand(total)`, `histMedian`, `medianOf`, `madOf`, `histMad`, `nationRef(hist, anchor[, W=10])`, `agreePct(hist, p)`, `distribution21(hist)`, `bin21(pos)`, `mostDivisive(hists, refs)`, `dailyTotal(positions, refs) -> {total, answered, scores, complete}`, `freezeRefs(hists, anchors)`, `buildFinalHist(totals)`, `percentile(total, finalHist, finalCount)`, `emptyHist()` |
| `ruler.js` | `makeTrack({x,width,margin=16})`, `posFromX`, `xFromPos`, `createRuler()` (needle state machine, single-finger routing, nudges, tick, lock) |
| `content.js` | `getContent(v)`, `createContent(raw)`, `registerContent(raw)`, `cardOf(content, itemId)` (server card with anchor), `cardText(content, cardOrItemId)` (client card, no anchor), `shapeErrors(raw)` |
| `schedule.js` | `pickDay`, `buildSchedule`, `validateSchedule`, `cardsForDate`, `getSchedule`, `capacityReport`, `FESTIVALS`, `seasonOf`, `inFestivalWindow` |
| `windows.js` | `closeMs(dateKey)`, `dayClosed`, `liveDay`, `submitWindow`, `newestClosedKey`, `issueOf` |
| `streak.js` | `onComplete(stats, dateKey, prevPublishedKey)`, `display(stats, todayKey, prevPublishedKey)` |
| `group.js` | `leaveOneOutScore`, `groupMq`, `groupDivisiveIdx`, `groupMedians`, `cardGroupBlock`, `closestPeer`, `buildGroupDay`, `buildFriendBoard`, `buildTrend`, `secondsInDay` |
| `rounds.js` | `drawTarget(r)`, `offerSpectra`, `offerClues`, `clueBelongs`, `lazyTransition`, `guessCheck`, `revealsOnGuess`, `hostRevealCheck`, `scoreRound`, `revealPayload`, `appendGroupRef` |
| `service.js` | document-level server logic: `newDailySet`, `applySubmit`, `cardReveal`, `completionBlock`, `dailyView`, `yesterdayInfo`, `archivePage/Item/DayView`, `pickBonusCard`, `distributionView`, `newRound`, `applyClue`, `roundView`, `applyReveal`, `groupDayView`, `friendBoardView`, `lazyFinal`, `finalAggregate`, `replaceCard`, ... |
| `present.js` | every pre-formatted string and view-model piece: `buildCardReveal`, `buildDayResult`, `homeScoreText`, `yesterdayText`, `homeDailyState`, `clueText`, `guessCountText`, `submittedText`, `revealHint`, `mqText`, `roundViewStatus`, `groupState`, `trendLabel`, `dateText` |
| `input.js` | `V.<function>(event)` validators for all 19 client-callable functions (D-2 adds agreeRules, reportClue; setClue takes preset or text) |
| `adpolicy.js` | `buildFeatures(app_config)`, `clampInterstitial`, `interstitialDecision`, `rewardDecision`, `interstitialErrorSilent` |
| `entry.js` | `parseEntryQuery`, share builders (`dailyShare`, `roundShare`, `revealShare`, `groupShare`, `menuShare`), image models, `titleOk` |
| `errors.js`, `events.js` | error codes + player copy; analytics event table with required props |
| `clue.js` (D-2) | typed-clue rules shared by client and server: `normalizeClue`, `checkClue(text, {leftLabel,rightLabel}) -> {ok,text}\|{ok:false,reason,hint}`, `CLUE_MAX = 12`, `RULE_LINE`, `CLUE_RULES_VERSION`, `clueLength`, `hintFor`. Words: `content/clue-words.v1.js`, `content/blocklist.v1.js` (+ exceptions, copied from 传画接龙), matching helpers `text.js` |
| `ugc.js`, `strikes.js`, `moderation.js` (D-2) | document-level typed-clue rules (flags, clue view/state, `textGate`, `reportGate`, hide/restore/delete), the strike ladder 1/2/3/4+ and restrictions, the fail-closed WeChat verdict mapping and the `ENV_KIND`/`MODERATION_MODE` gate. Used by `cloudfunctions/common/*` and `js/mock-server.js`; contract in `cloudfunctions/CONTRACT.md` 3b |

## Rules worth knowing (all tested)

- Positions are integers 0..100; references may be half-integers. `d = |p - ref|`, `s = max(0, 100 - ceil(2.5 d))`.
- National reference = median of real positions plus 10 virtual votes at the editor anchor (live; frozen at D+1 00:30).
- A day closes at `D+1 00:30:00.000` BJT (`now >= closeMs`).
- Group dots/● use OTHER members who submitted the card (partial members count); rows/scores use COMPLETE members only.
- Percentile uses the 101 five-point bins of `finalHist`: share of complete dailies in strictly lower bins, rounded down, hidden below 30.

## Tests

`npm test` in `game/` (Node >= 20): `tests/*.test.js`. Names carry the AC number they cover. `tests/helpers.js` builds a mock server on a controlled clock with the fixture library. `tools/build-schedule.js` is exercised on the fixture (`schedule.test.js`) and runs against the real library once it exists.
