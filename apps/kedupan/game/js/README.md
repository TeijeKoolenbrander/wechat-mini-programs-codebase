# kedupan client hooks (js/)

Who reads this: **frontend-ui** (renderers in `js/render/`, open data domain in `opendata/`), **backend** (cloud functions), **QA**.
Spec: `docs/kedupan/spec.md` (view models: §10; backend: §11). Pure logic is in `core/` (see `core/README.md`).

Architecture: `main.js` (canvas, loop, touches) -> `controller.js` (navigation, entry routing, lifecycle) -> `flows/*.js`
(one per screen group) -> `vm.js` (every string is formatted here) -> renderer. Renderers are pure: no wx, no timers, no state.

## Renderer contract (js/render/index.js)

```js
module.exports = {
  makeLayout(info),                       // info = { windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect }
  screens: { home, card, result, archive, archiveDay, create, round, group, friend },  // each { draw(ctx, vm, layout) -> hitAreas }
  overlay: { draw(ctx, overlayVm, layout) -> hitAreas },      // { dialog?, toast?, adStub? }
  hitTest?(hits, x, y) -> id, shareCard?: { render(canvas, cardVm, { pixelScale }) },
};
```
`hitAreas = [{ id, x, y, w, h }]`, later areas win; concatenate `screen.draw` then `overlay.draw`. `hitAreas.scrollMax = { 'board:list': px }` for scroll regions.
If `js/render/index.js` is missing, malformed or **throws** while drawing, `js/renderers.js` switches to `js/stub-render.js` for the session (and logs
analytics `error {where:'render'}`), so keep `draw` total. `js/stub-render.js` is the executable example of every hit id below.

`layout` should expose (the logic reads these, all optional): `W`, `H`, `pad`, `bottomEdge`, `dpr`, `s`, and **`odcRect = {x, y, w, h}`** (the rect the open data
domain list is drawn into; falls back to `layout.board` or a default).

### The ruler (the one new touch contract)
Draw the ruler track and emit one hit area **`ruler`** whose `x` and `w` are exactly the track span (left end = position 0, right end = 100) and whose `y`/`h` is the
touch band (>= 64 pt, >= 80 pt in large text). `main.js` routes a finger that starts on it to `ctl.onRuler(pos, 'start'|'move'|'end')`
(pos = round((x - hit.x) / hit.w * 100) clamped 0..100, also while the finger leaves the band vertically), and never sends it a tap or a scroll.
The needle: draw it only when `vm.needle !== null`. Nudge buttons are the hit ids `card:left` / `card:right` (`round:left` / `round:right`), +-1 step.

## Screens and hit ids

`ctl.view(now)` returns `{ screen, vm, overlay }`. `vm` is the spec §10 view model plus the **extras** listed (renderers may ignore them).
Common to every vm: `display = { largeText, highContrast, scale, palette }`, `features = { subscribe, banner, interstitial }`.
Common hit id: **`back`** (top-left "‹ 返回"; nothing tappable in the capsule row).

| screen | vm builder | extras | hit ids |
|---|---|---|---|
| `home` | `homeVm` | `daily.title/statusText/primaryLabel/subline`, `sheet` (`null|'howto'|'settings'`), `settings`, `howto.lines`, `t` | `home:daily` (the primary: 开始/继续/看结果/重试 by `daily.state`), `home:host`, `home:archive`, `home:group`, `home:friend`, `home:howto`, `home:sound`, `home:settings`, `home:groupBanner` (when `group.status==='ok'`); sheet: `sheet:close`, `settings:sound`, `settings:large`, `settings:contrast`, `settings:openSetting` (when `settings.canOpenSetting`), `settings:privacy`, `settings:feedback` (position the native `wx.createFeedbackButton` over this rect; main.js does) |
| `card` | `cardVm` | `headerText`, `progressText`, `hint`, `coach`, `sheet` (`'report'`), `pendingText`, `canReport`, `ends`, `revealT` 0..1 (slide-in of the reveal), `t` | `ruler`, `card:left`, `card:right`, `card:primary` (就这儿 / 下一张 / 看结果 / 重试; disabled while `!canConfirm`), `card:report` (only when `canReport`), `coach:ok`; report sheet: `report:unsuitable`, `report:ambiguous`, `report:typo`, `report:cancel` |
| `result` | `resultVm` | `total`, `sheet` (`'distribution'`), `bonusText`, `distributionText`, `offlineNote` | `result:share`, `result:group`, `result:friend`, `result:bonus`, `result:dist`, `result:host`, `result:archive`, `result:retry`, `sheet:close` (distribution sheet; `distribution.hist` is 5 x 21 counts, `null` rows for cards not answered) |
| `archive` | `archiveListVm` | `title`, `emptyText`, `errorText`, `offlineNote` | `archive:item:<dateKey>`, `archive:more` (when `hasMore`), `archive:retry` (error/offline) |
| `archiveDay` | `archiveDayVm` | `dateText`, `done`, `practiceText`, `bandLabel`, `rows` (5 mini rulers: prompt/left/right/you/nation/label/scoreText), `distribution`, `sheet`, `canNext` | `archiveDay:dist`, `archiveDay:next` (再来一期, when `done`), `archiveDay:list` (返回列表), `sheet:close` |
| `create` | `createVm` | `spectrum`, `secretNote`, `chatHint`, `clueTitle`, `clueSwapLeft`, `adState`, `errorText`, `swapHint`, `rateLimitedText` | `create:spectrum:<id>`, `create:swapFree`, `create:swapAd`, `create:mode:preset`, `create:mode:chat`, `create:clue:<itemId>`, `create:clueSwap`, `create:share` (disabled unless `canShare`), `create:retry` |
| `round` | `roundVm` | `phase`, `needle`, `canConfirm`, `lateMode`, `canLate`, `namesNote` (`'privacyDenied'|'unauthorized'|null`), `rows`, `best`, `salt`, `selfHash`, `hostBand` ({from,to}, the host's own target band), `errorText`, `sharedCanvas`, `headerText`, `hint` | `ruler` + `round:left`/`round:right` (when `status==='open'` or `lateMode`), `round:primary` (就这儿, or 揭晓 when `status==='hostWaiting'`), `round:late` (先猜再看), `round:view` (直接看答案), `round:refresh`, `round:retry`, `round:share` (再发到群里 / 分享揭晓), `round:host` (我也出一道 / 再出一道), `round:home`, `round:daily`, `round:subscribe` (when `subscribe.state==='offer'`), `round:names`, `round:settings` |
| `group` | `groupVm` | `base` (the underlying state when `state` is `privacyDenied`/`unauthorized`), `explainer`, `stateText`, `smallText`, `notice`, `sharedCanvas`, `rowCount`, `viewerDone`, `canShare` | `group:retry`, `group:play`, `group:share`, `group:contract`, `group:agree`, `group:openSetting`, `group:round:<roundId>`, `board:list` (scroll; drag -> open data domain scroll) |
| `friend` | `friendVm` | `title`, `stateText`, `base`, `sharedCanvas`, `rowCount`, `viewerDone` | `friend:retry`, `friend:play`, `friend:contract`, `friend:agree`, `friend:openSetting`, `board:list` |

Overlays (`overlay` object, drawn on top, hit ids `dialog:confirm`, `dialog:cancel`, `adstub:complete`, `adstub:skip`, plus the swallow-only `*:block`):
`{ dialog:{text, confirmLabel, cancelLabel, danger}, toast:{text}, adStub:{kind, secondsLeft} }`. The ad stub overlay is QA-only ("广告位（测试）").

Reveal markers (`reveal.markers`, `reveal.markers` of the round): `{ pos, kind }` with kind `you` ▼, `nation` ◆, `group` ●, `member` ○ (unnamed), `target` ▮, `late` (dashed ○).
Shapes differ by kind as well as colour (PD-16). `reveal.bullseye` -> confetti; the vibration and chime are fired by logic.

Round vm `status`: `loading | open | submitted | revealedUnplayed | revealed | hostWaiting | expired | noGuesses | notFound | offline`.
`revealedUnplayed` shows only "已揭晓" + `round:late` / `round:view` (`reveal` is `null` there on purpose).

## Share cards (`share.cardRenderer`)
Hook: `R.shareCard.render(canvas, cardVm, { pixelScale })`, 500 x 400, always the standard look. `cardVm.kind`:
`daily` { header, rows:[{prompt, ends, label}], footer, cta } (**no positions, ever**); `round` { header, left, right, clue, ruler:'empty' } (never the target);
`reveal` { header, left, right, target, dots:[pos], mqText } (no names); `group` { header, mqText }. On failure the static `assets/share-fallback.png` is used.

## Open data domain message (main -> opendata)
`wx.getOpenDataContext().postMessage({ type:'render', view:'group'|'friend'|'round', salt, selfHash, viewerDone, rows, refs?, mode?, shareTicket?, groupid?, width, height, dpr, palette, scale, anon })`.
`anon: true` = privacy or the friend scope was refused: do not read friend data, draw the server rows as "群友 A/B/C" (stable order by `h`) plus "你". Also `{type:'scroll', offset}`.
Rows (spec 8.4): group `[h, gs, ns, t, pos?, k?]`, friend `[h, ns, t, pos?, k?]`, round `[h, g, s, late, isHost]`. `h` = 12 hex chars (per-day or per-round salt).

## Audio cues
`assets/sounds/<name>.mp3`, silenced by the mute flag, missing files fail silently: `tick` (placing, every 5 steps), `reveal` (soft chime), `bullseye` (brighter two-note chime).

## Cloud function contract used by the client (the mock server `js/mock-server.js` is the executable reference)
All calls resolve to `{ ok:true, ... }` or `{ ok:false, code, message }`. Codes: see spec 11.3 plus `NO_CARD` (getBonusCard: nothing to play yet) and the client-only `NETWORK`, `TIMEOUT`.
Identity only from the cloud context. Beyond spec 11.2, the shapes the client relies on:

| function | request | response |
|---|---|---|
| `getDaily` | `{groupRef?}` | `{dateKey, issueNo, serverNow, cards[5]:CardText, mine:{pos[5]|null, answered, complete, total?, cardScores[5]|null}, refs[5]|null (live R only for answered cards), groupRefs:[5]|null (median of the OTHER members per answered card; only with a valid groupRef), divisiveIdx? (only when complete), yesterday?:{dateKey,total,pct|null,final:true}, myStreak:{current,best}, features:{subscribe:{tmplId}|null, banner:{enabled,adUnitId}, interstitial:{enabled,everyNSets,minLifetimeSets,minGapSec,maxPerDay}}}` |
| `submitCard` | `{dateKey, idx, pos, groupRef?}` | `{idx, pos, ref, score, label, agreePct|null, n, group?:{median|null, n (others), dots[]}, complete, total?, streak?}`. `CARD_DONE` carries the same object as `reveal`. |
| `getArchive` | `{before?, limit<=30}` | `{items:[{dateKey, issueNo, mine?:{total, final:true}}], hasMore, bestStreak}` |
| `getArchiveDay` | `{dateKey}` | `{dateKey, issueNo, cards[5], finals[5], mine?:{pos[5], total, pct|null}, hist?:[5][21] (only after unlockDistribution)}`; `DAY_OPEN` while open |
| `getBonusCard` | `{}` | `{card:CardText, final, dateKey}`; `RATE_LIMITED` after 3 a day |
| `unlockDistribution` | `{dateKey}` | `{hist:[5][21 | null]}` (`null` for a still-open day's cards the caller has not answered) |
| `joinGroup` | `{groupData: CloudID}` | `{groupRef}`; `NOT_GROUP`, `BAD_CLOUDID` |
| `getGroupDay` | `{groupRef, dateKey}` | spec 8.4. `rows` and `mq` are empty/`null` until the caller completed the day (`viewerDone:false`); `rounds[]` = `{roundId,left,right,clue|null,status,mq|null,guesses}` |
| `getFriendBoard` | `{dateKey}` | spec 8.4 (`refs` null until the caller completed) |
| `createRound` | `{spectrumId}` | `{roundId, target}` (target only to the host) |
| `setClue` | `{roundId, clueMode:'preset'|'chat', clueItemId?}` | `{}` |
| `getRound` | `{roundId, groupRef?}` | `{roundId, status:'draft'|'open'|'revealed'|'noGuesses', isHost, left, right, clueMode, clueText|null, guessCount (on-time), myGuess:{pos,late}|null, createdAt, expired (>7 d), target? (host or revealed), mq?, salt?, selfHash?, rows? [h,g,s,late,isHost], bestHash?, revealBy?}` |
| `submitGuess` | `{roundId, pos, groupRef?}` | `{late, guessCount, reveal?}` (`reveal` = the revealed fields above) |
| `revealRound` | `{roundId}` | `{reveal, guessCount}` |
| `subscribeRound`, `reportCard`, `track` | as spec | `{}` / `{accepted}` |

`track` events: `{ name, props, sessionId, clientTs }` (top level), <= 50 per call.

## Test seam
`wx.__kdTest = { mockServer, openid, population, launchDateKey, forceStub, realRenderer }` (read only in `main.js`; never set in production) lets `tests/harness.js`
share one mock server between simulated players and pin the renderer.
