# core/ contracts (点将台)

Pure JS (CommonJS). No `wx`, no DOM, relative requires only (a unit test enforces it). The backend copies this folder into its cloud functions, so the client and server run the same code. The JSON content file is `require`d, so copy `core/content/` too.

Versions: `getContent(contentVersion)` and `getConfig(configVersion)` return `null` for an unknown version. `LATEST_CONTENT_VERSION` (content.js) and `LATEST_CONFIG_VERSION` (config.js) are the live ones. `config.gateVersion` is bumped whenever the 7.5.1 population rules change.

## Files and exports

| File | Exports |
|---|---|
| `rng.js` | `mulberry32(seed)`, `hash32(str)` (uint32), `sub(seed, name)` = `mulberry32(hash32(seed + ':' + name))`, `int`, `pick`, `shuffle`, `randomSeed()` |
| `date.js` | `beijingDateKey(nowMs) -> 'YYYYMMDD'` (explicit UTC+8 arithmetic, TZ independent), `beijingMidnightMs`, `secondsSinceBeijingMidnight`, `dateKeyToMs`, `addDays`, `daysBetween`, `msUntilBeijingMidnight`, `issueNo(dateKey, launchKey)` |
| `content.js` | `getContent(v) -> {contentVersion, generals[], byId, indexOf, roster[], factions, eras, roles, roleByKey, slots, bonds, cells, validCells, roleScores, texts, forbiddenTerms}`, `SLOTS` (`zhugong junshi xianfeng mengjiang shoujiang`, fixed order), `roleScore`, `fitOf`, `tierOf`, `validateContent(content) -> string[]` (empty = valid, AC 7) |
| `content/generals.v1.js` | the 32 generals (Appendix B) plus `texts` (cause lines, event templates, comments). **Roster index = array index**; `getBoard` row `x` uses it |
| `config.js` | `getConfig(v)`, `bandFor(config, wins)`, `LATEST_CONFIG_VERSION`. Holds sim weights, `curve`, `tau`, `jitter`, `morale`, `events`, `bands`, `allowance`, `gates`, `ads` caps, `boardListCap`, `analytics`, `daily` (`launchDateKey`, `graceMs`), `freeRarity` |
| `sheet.js` | `buildSheet(seed, contentVersion[, configVersion]) -> rounds[5]`; round = `{faction, era, altFaction[3], altEra[3], fallback: tokenSet[4]}`. **The fallback tokens ride in the sheet** (spec 4): a client holding only `rounds` (the daily client has no seed) can replay everything |
| `draft.js` | the shared state machine: `createRun({seed, contentVersion, mode, rounds?})`, `apply(run, action) -> {ok, reason?}`, `nextRound`, `currentPool`, `poolOf`, `respinInfo`, `isComplete`, `lineupOf`. `rounds` overrides the seed-derived sheet |
| `validate.js` | `replay(seed, contentVersion, actions, mode) -> {ok:true, lineup, finalTokens, tokens (alias), respinsFree, respinsAd} \| {ok:false, error:'INVALID_ACTIONS', reason, index?}`; mode `daily \| free \| challenge` |
| `sim.js` | `simulate(lineup, seed, contentVersion, configVersion, opts?) -> {record:{w,l}, battles[], events[], band:{key,label,...}, morale, scores, lineup}`; `opts.events === false` disables events. Also `makeScenario`, `simulateScenario` (per-seed constants, reused by search and gates), `moraleOf` |
| `search.js` | `bestLineup(seed, contentVersion, finalTokens, opts?) -> {lineup, record, evaluated, sets} \| null` (null when five distinct generals cannot be drafted). `opts.stopAt12`, `opts.scenario`, `opts.configVersion` |
| `gates.js` | `gateCheck(seed, contentVersion, configVersion) -> {optimal, greedyRate, randomRate, K, gateVersion, relaxed:false, pass}`, `acceptDailySeed(seed, opts?) -> {accepted, gates, best?, rounds?}` (the spec calls the file `gate.js`; the contract name is `gates.js`) |
| `players.js` | simulated players (`random naive greedy greedyNoisy sensible`) used by gates and `tools/simstats.js` |
| `score.js` | `lineupDetail(content, lineup)`, `commentFor(content, lineup, wins)` |

## Actions (spec 5.1)

`{round, type: 'flip'|'respinFaction'|'respinEra'|'pick'|'undo', generalId?, slot?, source?: 'free'|'ad'}`. The UI's 下一轮 step is not an action: `flip` for round n+1 is accepted straight after round n's pick.

Replay rejection `reason` codes (all under `error: 'INVALID_ACTIONS'`): `UNKNOWN_CONTENT_VERSION UNKNOWN_MODE BAD_ACTIONS BAD_ACTION ROUND_MISMATCH NOT_FLIPPED ALREADY_FLIPPED RESPIN_AFTER_PICK AD_RESPIN_NOT_ALLOWED AD_BEFORE_FREE RESPIN_LIMIT NO_ALT NOT_IN_POOL DUPLICATE_GENERAL DUPLICATE_SLOT BAD_SLOT UNDO_INVALID EXTRA_ACTIONS WRONG_PICK_COUNT`.

Decisions where the spec was silent: a re-spin is allowed after 撤回 (no pick is standing); an ad re-spin of a dimension requires that dimension's free re-spin to be spent; an auto-reflip (empty pool) is not a re-spin and consumes the round's next carried fallback token set; the last fallback is always a cell with at least 5 generals so the reflip always terminates.

## Simulator RNG layout (so the server can reproduce it)

- `sub(seed,'battle')`: shuffle of the 6 battle types, then 6 random types appended and the 12 shuffled; then per battle `u` (luck) and `j` (jitter, `(rng()*2-1)*jitter`).
- `sub(seed,'event')`: 5 wavering rolls (indexed by **slot**, so a higher 信 never triggers more often), then the flipped-battle pick and the three template picks.
- A battle is won iff `P > D + tau * logit(u)` (same as `u < 1/(1+exp(-(P-D)/tau))`), which makes "stronger never worse, before events" exact.
- Event order: 临阵生变 on natural wins, then 奇谋 and 万夫莫敌 on natural losses with `p >= 0.35` (a battle flipped by wavering is not eligible).
- Tie-break of `bestLineup`: highest sum of natural win chances.
