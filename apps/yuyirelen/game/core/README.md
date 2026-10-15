# core/ (语义热冷)

Pure CommonJS, no `wx`, no timers, no randomness except the seeded `rng`. Every file is shared with the
cloud functions by copy (a drift test compares them), so keep it dependency-free. Mini games can only
`require` `.js` files: data is shipped as `.js` modules (`vocab.js`, `t2s.js`).

Spec section numbers refer to `docs/yuyirelen/spec.md`.

| File | Purpose |
|---|---|
| `config.js` | `getConfig(v)`, `LATEST_CONFIG_VERSION`, `clampAds(remote)`. Hint thresholds `[10,20,30,40]`, caps `[300,50,null,10]`, limits, ad caps. `launchDateKey` is a placeholder (TODO founder). |
| `date.js` | Beijing (UTC+8) date arithmetic: `beijingDateKey(ms)`, `dateKeyToMs(key)`, `addDays`, `daysBetween`, `issueNo(key, launchKey)`, `DAY_MS`. Never uses local-time getters. |
| `rng.js` | `mulberry32`, `hash32`, `sub(seed, name)`, `int`, `pick`, `shuffle`. |
| `temp.js` | `temperature(rank, V)` = `round(100*(1-ln r/ln V))`; `bandOf(rank)` -> `{key,label,max,color}` (`hit` 1, `boil` 2-10, `scald` 11-100, `hot` 101-500, `warm` 501-2000, `cold` 2001+); `rankLabel(1284)` = `第 1,284 名`; `formatCount`. |
| `normalize.js` | `normalizeInput(raw, t2sMap)`: strip spaces and punctuation, full-width to half-width, traditional to simplified per character. Letters and digits are kept (they are simply out of vocabulary). |
| `dict.js` | `createDict(text)` -> `{size, words, has(w), idxOf(w), suggest(norm, max=6)}`. `suggest`: exact match first, then prefix matches by frequency (line order). |
| `vocab.js` | The word list as one string (`module.exports = "w\nw..."`). **FIXTURE** (286 words) until the pipeline writes the real one. Regenerate the fixture with `node tools/gen-fixture-vocab.js`. |
| `t2s.js` | Traditional to simplified map. FIXTURE sample. |
| `starters.js` | `STARTERS` (120 broad words) and `warmupsFor(key, n=6)`: the 热身词 for a date key or `"p<n>"`; depends only on the key (no answer knowledge). |
| `hints.js` | `hintStatus(cfg, steps, used)` -> `{next, state: locked/available/exhausted, threshold, label}`; `newlyUnlocked(cfg, before, after)`; `hintTargetRank(cfg, k, best)` = `min(cap, max(2, floor(best/2)))`; `adTargetRank(best)`; `atBest(best)` (best <= 2); `pickHintRank(target, isTaken, maxRank)` -> next closer free rank, else outward, never 1. |
| `streak.js` | `onRankedSolve(state, dateKey, prevKey)`, `onRankedGiveUp(state)`, `displayStreak(state, todayKey, latestPublishedBeforeToday)`. Server rule; the client only displays. |
| `schedule.js` | `parsePuzzleId`, `dailyId`, `practiceId`, `isChallengeId`, `inRankedWindow(dateKey, nowMs, graceMs)` (D 00:00 to D+1 00:30 BJT), `dateLabel`, `puzzleTitle(kind, issue, practiceNo)`, `nextPuzzle(pastDailiesNewestFirst, practice, pool?)` (the 再来一题 rule). |
| `play.js` | Guess entries and the ladder: `toEntry`, `ladderRows(guesses, latestWord)` (closest first), `chipsFrom(near, guesses, 5)`, `stepTemps`, `stepBands`, `bestRank`, `srcMix`, `summaryLine`. The 提示 3 step has `word === null` and still counts as a step. |
| `card.js` | Share card data from NUMBERS only (no word can reach it): `cardVm(input, maxColumns=60)` (buckets above 60 steps), `shareTitle(input)`, `MENU_TITLE`. |

## Server contract the client relies on

The client never holds the answer or rank lists. Every guess goes to the server (`js/api.js`; the offline
mock in `js/dev/` simulates it with a tiny fixture). Responses are `{ok:true,...}` or `{ok:false, code, msg}`.
See the header of `js/api.js` for the exact fields per function.
