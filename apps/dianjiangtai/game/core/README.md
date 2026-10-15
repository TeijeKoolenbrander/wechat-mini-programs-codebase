# core/ contracts (点将台)

Pure JS (CommonJS). No `wx`, no DOM, relative `.js` requires only (tests enforce it: `core-basic` purity test and `wechat-compat.test.js`; WeChat cannot `require` `.json`, so the rosters are `.js` modules). The backend copies this folder into its cloud functions (`cloudfunctions/scripts/sync-core.js`), so the client and server run the same code. Copy `core/content/` too.

Versions: `getContent(contentVersion)` and `getConfig(configVersion)` return `null` for an unknown version.

| | contentVersion 1 | contentVersion 2 (live, v1 release) |
|---|---|---|
| roster | `content/generals.v1.js`, 32 generals, 4 factions x 4 eras, min cell 2 | `content/generals.v2.js`, **120 generals**, 5 factions x 5 eras (晋 and 归晋), 21 used cells, min cell **4**, 273 entries, **16 bonds** |
| config | `configVersion 1` (kept intact for old seeds) | `configVersion 2` |

`LATEST_CONTENT_VERSION = 2`, `LATEST_CONFIG_VERSION = 2`. **Every function that takes an optional `configVersion` now defaults to `defaultConfigVersion(contentVersion)`** (content 1 -> config 1, content 2 -> config 2), so old calls such as `buildSheet(seed, 1)` or `simulate(l, seed, 1)` behave exactly as before. Pass both explicitly when you store them (bank entries, runs). `config.gateVersion` is bumped whenever the 7.5.1 population rules change (still 1).

## What changed for v1 (read this first)

1. **`lineup` entries carry `faction`** = the faction of the cell the general was drafted from (cohesion uses it, spec 3.2/7.2; `daily_results.lineupFac` should store it). `draft.lineupOf`, `replay`, `bestLineup` and `simulate` return `{slot, generalId, faction}`. `simulate` accepts entries with or without `faction` (without: the general's primary faction, which is only right for single-appearance content). **Always pass the lineup returned by `replay`/`bestLineup` back into `simulate` unchanged**, and store `faction` with a stored lineup, otherwise a multi-appearance general is scored with the wrong cohesion. Bank `best.lineup` entries include it.
2. **Pools are capped (poolCap 8).** `draft.poolOf(run, faction, era)` / `currentPool(run)` return only the selectable generals (roster indexes, roster order): the first 8 undrafted members of the cell in the round's seeded pool order. `draft.draftedInCell(run, faction, era)` returns the cell members already in the lineup (show them after the pool, dimmed "已点将", not selectable, not counted toward the cap). A pick of a person already drafted from another cell is rejected with `DUPLICATE_GENERAL`; a pick outside the capped pool with `NOT_IN_POOL`.
3. **The sheet carries the pool orders** (`round.pools`, below), so the daily client, which has no seed, and the server derive identical pools. Rounds built by `buildSheet` for content 2 always have it; rounds you pass to `createRun({rounds})` must keep it.
4. **Appearances.** Every general has `appearances: [{faction, eras[], note?}]` (content 1 is read as one appearance). `content.cells` is built from appearances. `faction` stays the primary faction (detail sheet, default seal colour); `eras` is the union. `appearanceNote(content, generalId, faction)` returns the note shown under the name in that cell's pool ("从公孙瓒").
5. **晋 / 归晋.** `content.factions` / `content.eras` are per version (content 2 adds `jin` and `guijin`). 晋 exists only in 归晋: `jin|guijin` is the only 晋 cell; a 晋 token always shows "此令无可换" on 换时代 (the respin machinery already does this: no valid alternative).
6. **`searchSets`**: `search.enumerateSets(content, finalTokens, cap, orders)` now returns `[{g:[5 roster idx], f:[5 faction idx]}]` (it used to return arrays of indexes). With two arguments it assumes cap 8 and roster-order pools (a size estimate for the `heavySets` test; pass `ordersFor(...)` for the exact sets).
7. New `validate.replayPrefix`, `validate.roundToken`, `validate.extendsPrefix` (progressive daily delivery), new `date.weekdayOf`/`variantOf` (识人模式), `config.poolCap`, `config.shiren`.

## Files and exports

| File | Exports |
|---|---|
| `rng.js` | `mulberry32(seed)`, `hash32(str)` (uint32), `sub(seed, name)` = `mulberry32(hash32(seed + ':' + name))`, `int`, `pick`, `shuffle`, `randomSeed()` |
| `date.js` | `beijingDateKey(nowMs) -> 'YYYYMMDD'` (explicit UTC+8 arithmetic, TZ independent), `beijingMidnightMs`, `secondsSinceBeijingMidnight`, `dateKeyToMs`, `addDays`, `daysBetween`, `msUntilBeijingMidnight`, `issueNo(dateKey, launchKey)`, **`weekdayOf(dateKey)`** (0 = Sunday), **`variantOf(dateKey, weekday = 0) -> 'shiren' \| 'standard'`** |
| `content.js` | `getContent(v) -> {contentVersion, generals[], byId, indexOf, roster[], factions, eras, roles, roleByKey, factionByKey, eraByKey, slots, bonds, cells, validCells, minCell, roleScores, texts, forbiddenTerms}`, `SLOTS` (`zhugong junshi xianfeng mengjiang shoujiang`, fixed order), `FACTIONS`/`ERAS` (all five of each; per-version lists are on the content object), `roleScore`, `fitOf`, `tierOf`, `appearanceNote`, `validateContent(content) -> string[]` (empty = valid; dispatches on the version: AC 7 for 1, AC 69 for 2) |
| `content/generals.v1.js`, `content/generals.v2.js` | the rosters plus `texts` (cause lines, event templates, comments). v2 also carries `bonds` (16, with member ids). **Roster index = array index**; `getBoard` row `x` uses it. v2 general: `{id, name, courtesy, faction, appearances, eras, primaryRole, stats, tier, bonds, portraitId:null, monogram, blurb, statNote, source, contentVersion:2}` |
| `config.js` | `getConfig(v)`, `bandFor(config, wins)`, `LATEST_CONFIG_VERSION`, `defaultConfigVersion(contentVersion)`. Holds sim weights, `curve`, `tau`, `jitter`, `morale`, `events`, `bands`, `allowance`, `gates`, `poolCap` (8), `shiren: {weekday: 0}`, `search.heavySets`, `ads` caps, `boardListCap`, `analytics`, `daily`, `freeRarity` |
| `sheet.js` | `buildSheet(seed, contentVersion[, configVersion]) -> rounds[5]`; round = `{faction, era, altFaction[3], altEra[3], fallback: tokenSet[4], pools?}`, `poolOrder(seed, content, round1based, faction, era)`. `pools` (content 2 only) = `{'faction|era': [rosterIndex...]}` for every cell with more than `poolCap` members: the seeded pool order `shuffle(cell, sub(seed, 'pool:' + round + ':' + faction + ':' + era))`. About 1.5 KB per round. **The fallback tokens and pools ride in the sheet** (spec 4): a client holding only `rounds` can replay everything |
| `draft.js` | the shared state machine: `createRun({seed, contentVersion, configVersion?, mode, rounds?})`, `apply(run, action) -> {ok, reason?}`, `nextRound`, `currentPool`, `poolOf`, `draftedInCell`, `respinInfo`, `isComplete`, `lineupOf`. `rounds` overrides the seed-derived sheet and may hold fewer than 5 entries (progressive delivery): a `flip` beyond the released rounds is rejected with `ROUND_NOT_RELEASED` and the run is not mutated |
| `validate.js` | `replay(seed, contentVersion, actions, mode, configVersion?) -> {ok:true, lineup, finalTokens, tokens (alias), respinsFree, respinsAd} \| {ok:false, error:'INVALID_ACTIONS', reason, index?}`; `replayPrefix(...)` (same checks for a partial run -> `{ok, picks, round, phase, complete, lineup, finalTokens, ...}`); `roundToken(...)`; `extendsPrefix(frozen, actions)`. Mode `daily \| free \| challenge` |
| `sim.js` | `simulate(lineup, seed, contentVersion, configVersion?, opts?) -> {record:{w,l}, battles[], events[], band:{key,label,...}, morale, scores, lineup}`; `opts.events === false` disables events. Also `makeScenario`, `simulateScenario` (per-seed constants, reused by search and gates), `moraleOf(content, config, gIdx, lordScore, facs?)` |
| `search.js` | `bestLineup(seed, contentVersion, finalTokens, opts?) -> {lineup, record, evaluated, sets} \| null` (null when five distinct generals cannot be drafted). Honours the pool cap and drafted-person removal. `opts.stopAt12`, `opts.scenario`, `opts.configVersion`, `opts.rounds` (sheet; default derived from the seed). Also `enumerateSets`, `ordersFor` |
| `gates.js` | `gateCheck(seed, contentVersion, configVersion?) -> {optimal, greedyRate, randomRate, K, gateVersion, relaxed:false, pass}`, `acceptDailySeed(seed, opts?) -> {accepted, gates, best?, rounds?}` (opts: `contentVersion`, `configVersion`) |
| `players.js` | simulated players (`random naive greedy greedyNoisy sensible`) used by gates and `tools/simstats.js`; `playRun(model, seed, cv, mode, rng, scn?, {rounds?, configVersion?})` |
| `score.js` | `lineupDetail(content, lineup)`, `commentFor(content, lineup, wins)` |

## Actions (spec 5.1)

`{round, type: 'flip'|'respinFaction'|'respinEra'|'pick'|'undo', generalId?, slot?, source?: 'free'|'ad'}`. The UI's 下一轮 step is not an action: `flip` for round n+1 is accepted straight after round n's pick.

Replay rejection `reason` codes (all under `error: 'INVALID_ACTIONS'`): `UNKNOWN_CONTENT_VERSION UNKNOWN_MODE BAD_ACTIONS BAD_ACTION ROUND_MISMATCH ROUND_NOT_RELEASED NOT_FLIPPED ALREADY_FLIPPED ALREADY_PICKED RESPIN_AFTER_PICK AD_RESPIN_NOT_ALLOWED AD_BEFORE_FREE RESPIN_LIMIT NO_ALT NO_POOL NOT_IN_POOL DUPLICATE_GENERAL DUPLICATE_SLOT BAD_SLOT UNDO_INVALID EXTRA_ACTIONS WRONG_PICK_COUNT`, plus from `roundToken`: `BAD_ROUND NOT_AT_ROUND_END`.

Decisions where the spec was silent: a re-spin is allowed after 撤回 (no pick is standing); an ad re-spin of a dimension requires that dimension's free re-spin to be spent; an auto-reflip (empty pool) is not a re-spin and consumes the round's next carried fallback token set; the last fallback is always a cell with at least 5 generals so the reflip always terminates (every v2 cell has >= 4, and 5 or more exist).

## Progressive token delivery (spec 5.2, AC 86)

For a ranked daily the client never holds a future round. Backend uses:

```js
const v = require('./validate');
// startRun:   round 1                 -> v.roundToken(seed, cv, 1, [], 'daily', configVersion)
// getRound:   actions through pick n  -> v.roundToken(seed, cv, n + 1, actions, 'daily', configVersion)
// both return { ok:true, n, round } or { ok:false, error:'INVALID_ACTIONS', reason, index? }
// getRound also checks v.extendsPrefix(storedFrozenActions, actions) before storing/returning
// submitRun:  require released == 5 and v.extendsPrefix(frozen, actions), then v.replay(...) as before
```

`roundToken` accepts only a valid prefix that holds exactly `n - 1` picks and stands right after round `n - 1`'s pick (round 1: no actions). It is idempotent. `round` is the sheet's round `n` (`faction, era, altFaction, altEra, fallback, pools`). The client builds its run with `draft.createRun({seed: 0, contentVersion, configVersion, mode, rounds: releasedSoFar})`; `flip` of an unreleased round returns `ROUND_NOT_RELEASED`, which is the client's cue to call `getRound`. `replayPrefix(seed, cv, actions, mode)` validates any partial run (e.g. the partial-run validation of spec 14.3) and reports `{picks, round, phase, complete}`.

## 识人模式 (spec 8.11)

`date.variantOf(dateKey, config.shiren.weekday)` -> `'shiren'` on Sundays (Beijing date), else `'standard'`; set `daily_seeds.variant` from it when the document is created. **The variant never touches the sim, the sheet, the gates or validation** (same seed, same actions, same record and battle log). Hiding stats, tier, `primaryRole`, `statNote`, S_r, fit chips and bond preview during the draft is the renderer's job; the data it hides is in `content.generals[i]`.

## Bonds (spec 7.3)

Content 2 has 16 bonds (`content.bonds[i] = {key, label, members: [generalId...], bonus: 0.04}`), applying when every member is drafted, whatever the appearance or slot. `simulate(...).morale.bondKeys` / `.bonds` list the active ones. Keys: `taoyuan jiangdong longfeng suwei xiliang shiyuan shenting xiapi hebei pingluan ershi pingwu henei fuzi_guan fuzi_lu houji` (`fuzi_guan` and `fuzi_lu` share the label 父子同袍).

## Simulator RNG layout (so the server can reproduce it)

Unchanged by v1.
- `sub(seed,'battle')`: shuffle of the 6 battle types, then 6 random types appended and the 12 shuffled; then per battle `u` (luck) and `j` (jitter, `(rng()*2-1)*jitter`).
- `sub(seed,'event')`: 5 wavering rolls (indexed by **slot**, so a higher 信 never triggers more often), then the flipped-battle pick and the three template picks.
- `sub(seed,'pool:' + round + ':' + faction + ':' + era)`: the pool order of a cell (content 2, new).
- A battle is won iff `P > D + tau * logit(u)` (same as `u < 1/(1+exp(-(P-D)/tau))`), which makes "stronger never worse, before events" exact.
- Event order: 临阵生变 on natural wins, then 奇谋 and 万夫莫敌 on natural losses with `p >= 0.35` (a battle flipped by wavering is not eligible). (pMin is per config.)
- Tie-break of `bestLineup`: highest sum of natural win chances.

## Tuning (configVersion 2)

`config 2` = `config 1` with three changes (`V2_TUNING` in `config.js`): the opponent `curve` shifted down by 0.05, `search.heavySets` 5000 (was 2000), and a new `freeRarity` table. Formula weights, role weights, morale constants, `tau` 0.7, `jitter` 0.35, event `pMin` 0.672 and the gate windows are unchanged. The 120-general roster, the pool cap and the 16 bonds moved the sensible-player 12-0 rate from 0.33% (config 1, 32 generals) to 0.28% (config 1 on content 2); the -0.05 shift centres it again.

Measured with `tools/simstats.js` (two independent 100,000-seed runs, `tools/simstats-report-cv2.md` and `tools/simstats-run2-cv2.md`): sensible 12-0 0.33% / 0.39%, greedy 0.56% / 0.61%, naive 0.17% / 0.19%, random 0.00%, sensible median 7, 10-11 wins 8.9% / 9.1%, 0-1 wins 0.55% / 0.54%, events in 24% of runs, most frequent general in optimal lineups 刘备 at 34.5% (limit 60%).

复盘 (spec 7.4, AC 75): with the pool cap a typical search has about 14,000 distinct (general, faction) sets (content 1: about 2,000), so the client only runs the search itself for token sets up to `search.heavySets` (5000, about 14% of free runs); the rest ask `getReplay` first. Search speed in node: p50 38 ms and p99 about 360 ms over all searches, up to about 1.2 s for the worst token sets (server side, limit 10 s); client-side (<= 5000 sets) p99 about 80 ms, max under 150 ms (sampled 4000).

Daily gate for content 2: perfect play reaches 12-0 on about 2% of seeds, the strict gate accepts about 0.55% (about 180 candidates per seed); a 60-day bank takes a few minutes on 8 cores (`apps/dianjiangtai/seed-bank/README.md`).
