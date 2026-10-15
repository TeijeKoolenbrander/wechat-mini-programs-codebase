# Render contract (frontend-ui <-> minigame-dev), v1

Every screen module `js/render/<screen>.js` exports `draw(ctx, vm, layout) -> hitAreas`.

- `vm` is the spec 13 view model (including the **v1 additions**), plus the **extra optional fields** listed per screen below. Missing extras fall back to the stated default. Field names are the spec's wherever the spec has one; fields marked **ADDITION** are not in spec 13 and need the client to supply them.
- `layout = makeLayout({windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect})` from `layout.js`. `menuRect` is `wx.getMenuButtonBoundingClientRect()`. Build it again on resize/`onShow`. Pass `pixelRatio` (it is `L.dpr`, used for the optional seal cache).
- `hitAreas = [{id, x, y, w, h}]` in canvas px. **Later areas win** (`hitTest(hitAreas, x, y)`): concatenate `screen.draw(...)` then `overlay.draw(...)`. Unknown ids (`*:block`, `*:card`, `sheet:body`, `sheet:scrim`, `coach:block`) only swallow taps; ignore them.
- `hitAreas.scrollMax` = `{<scrollId>: maxOffsetPx}` for scrollable regions. Logic owns the scroll offset (drag on the scroll id) and passes it back in the vm. Clamp to `scrollMax`. When you concatenate overlay hits, keep `scrollMax` from the screen (`const sm = hits.scrollMax; hits = hits.concat(...); hits.scrollMax = sm`).
- Renderers are pure: no wx, no timers, no state. Animate by passing progress fields and redrawing each frame. Shipped render code requires only `.js` modules (tests/wechat-compat.test.js).
- Renderer-owned strings: fixed UI chrome and spec copy (button labels, state explainers, `适任/可用/错位`, `甲/乙/丙`, slot labels, `十胜二负` from `{w,l}`, `令牌传递中断`, `五德揭晓`, `保存图片需要相册权限`). Logic supplies everything dynamic and pre-formatted.
- Fonts: system only (`theme.js` stacks). Text never goes below 16pt (20pt in large-text mode); `layout.u()` scales up on larger screens.

## Display modes (all screens, spec 8.10)

Every vm carries `display: {largeText:boolean, highContrast:boolean}` (spec 13's `scale`/`palette` are accepted too). Each `draw()` starts by applying it, so the mode is per draw call and nothing leaks between screens. Pass the **same** `display` in the overlay vm (if you omit it, the mode left by the screen's `draw()` still applies). Share and saved cards always use the standard look.
- **Large text:** body >= 20pt, record >= 48pt, buttons >= 56pt tall. Home keeps the daily card, 自由点将 and the footer pinned and scrolls the group banner and the (2 x 2) board buttons above them (`home:scroll`, `scrollY`). Draft keeps the primary button pinned and scrolls tokens, pool and lineup as one page (`pool:list`, `poolScroll`). Result, history and the sheets scroll.
- **High contrast:** plain white, pure ink, dark faction set with white text, 2pt outlines on fit chips and frames, no paper texture. Contrast is checked by `tests/render.v1.test.js` (text >= 7:1, non-text >= 3:1; default mode >= 4.5:1).

## Seal portraits (CTO-D1)

`seal.js` draws every general: full name in seal layout, faction colour, tier frame. Used in pool rows (48pt, full name), the detail sheet (72/80pt), lineup chips (monogram), result rows, history, share card (free) and the open data board tiles (monogram). A `Seal` descriptor (spec 13) may carry `{text, monogram, factionKey, color, inkText, frame, size}`; **`color` is ignored** (the renderer takes the colour from `factionKey` so high contrast can swap the set). Missing `seal` fields fall back to `name`/`monogram` plus the cell's faction token. Optional cache: `seal.setCanvasFactory((w,h) => wx.createCanvas()-like)`; without it seals draw directly.

## home  (`home.js`)
Spec fields: `daily {state, issueNo, dateKey, round?, record?, bandLabel?, variant?, variantLabel?, streak {current, text}}`, `hasGroupContext`, `muted`, `settings {friendBoardEnabled}`, `nav {historyEnabled}` (default true).
Extras: `sheet: null|'howto'|'settings'`, `scrollY` (large text), `sheetScroll` (inside the sheets), `t` (ms clock for the skeleton pulse), `settings.album` (`'denied'` shows the album row, ADDITION: spec 13's Settings model has `album`, but Home carries `settings`).
The 识人 badge shows from `daily.variantLabel` (or `variant === 'shiren'`); the streak line shows only when `streak.current >= 2` and `streak.text` is set. The daily card text is centred in every state and mode.
Hit ids: `home:daily` (出征 / 继续出征 / 查看战报, decide by `daily.state`), `home:retry` (pendingSubmit/error/offline), `home:free`, `home:groupBoard`, `home:friendBoard`, `home:history` (往期), `home:howto`, `home:sound`, `home:settings`, `home:groupBanner`, `home:scroll` (drag area, large text only).
Sheets: `sheet:close` (X, outside tap, 知道了), `sheet:list` (scroll area inside a sheet).
Settings sheet: `settings:sound`, `settings:largeText` (toggle, read `display` and write the local setting), `settings:highContrast` (toggle), `settings:openSetting` (only drawn when friend board is off), `settings:openAlbum` (only when `settings.album === 'denied'`; call `wx.openSetting`), `settings:privacy`, `settings:feedback` (position the native `wx.createFeedbackButton` over this rect; the row is pinned, it never scrolls).

## draft  (`draft.js`)
Spec fields (v1): `mode`, `round`, `phase`, `tokens` (faction may be `jin`), `respin`, `pool[] {id, name, courtesy, seal, monogram, blurb, appearanceNote, tier|null, stats|null, drafted}`, `selected {generalId, seal, blurb, statNote, appearanceNote, slotOptions[{slot,label,score|null,fit|null}]}`, `lineup[] {slot,label,generalId,name,score,fit, factionKey}`, `canUndo`, `primaryLabel`, `hidden`, `variantLabel`, `roundFetch`.
Extras: `poolScroll` (px, default 0), `sheetScroll` (detail sheet), `flip` (0..1 token flip, default 0 in awaitFlip else 1), `notice` (string|null, e.g. 此路无将，重新翻令), `coach` (0 none, 1 翻令, 2 选将, 3 放入位置, `'shiren'` the one-time 识人 line), `t`.
`pool[]` order: undrafted rows first, then the dimmed `drafted: true` rows (shown "已点将", not tappable). The header count is the undrafted number. The pool row and the detail sheet read the seal from `pool[].seal` (colour = the cell's faction) and `selected.seal` (primary faction); `lineup[].factionKey` is the faction of the cell the general was drafted from (optional; without it the lineup chip shows the name only).
`hidden: true` (识人): nothing from `stats`, `tier`, `statNote`, `score`, `fit` is drawn even if present; every seal gets the plain frame; the header shows the 识人 tag and "五德出征后揭晓"; the detail sheet shows `？` for the five stats and slot buttons with labels only.
`roundFetch`: `'loading'` -> primary reads 翻令中… and is disabled; `'failed'` -> the line 令牌传递中断 plus the `retryRound` button above the primary (disabled), tokens stay face down.
The primary button is tappable only in `awaitFlip` (翻令), `placed` (下一轮) and `readyToMarch` (出征), and only when `roundFetch` is `idle`; it is drawn disabled otherwise.
Re-spin button rules (renderer): `free>0` -> `换势力 ×1` (`respin:<dim>`); `free==0` in free mode with `adAllowed && adLeft>0` -> `视频再换 ×N` (`respinAd:<dim>`, loading/playing states from `adState`); otherwise disabled `已用`. `free>0 && !enabled` -> disabled (hint 此令无可换).
Hit ids: `back`, `primary`, `undo`, `retryRound`, `respin:faction`, `respin:era`, `respinAd:faction`, `respinAd:era`, `pool:<generalId>`, `pool:list` (drag area, scrollMax id; large text: the whole page), `sheet:close` (deselect), `sheet:list` (scroll area of the detail sheet), `slot:<slot>`, `coach:next`, `coach:skip`.
Confirm-back and ad toast/stub use `overlay`.

## result  (`result.js`)
Spec fields (v1): `mode`, `status`, `record`, `band`, `comment`, `rarityText`, `battles`, `lineup`, `morale`, `replay {unlocked, adState, locked, lockedText, best}`, `challenge {theirRecord, theirLineup, lineupLocked}`, `variantLabel`, `reveal {pending, step}`, `streak {current, text}`, `saveImage {state}`, `subscribe {state, challengeId}`.
**ADDITIONS** (not in spec 13): `lineup[]` may also carry `tier` ('jia'|'yi'|'bing'), `stats` ({zhi,xin,ren,yong,yan}), `factionKey`, `seal` (Seal) and `monogram`. The result lineup is drawn as seal rows; `tier`/`stats` are needed for the 识人 五德揭晓 and optional otherwise.
Extras: `revealCount` (0..12 fractional; integer part = rows shown, fraction fades in the newest; only read when `status:'revealing'`), `stampT` (0..1 slam of the 12-0 seal, default 1), `scrollY` (verdict scroll), `sheet: null|'breakdown'|'replay'`, `sheetScroll`, `privacyNote: boolean`, `boardLabel` (default 看群榜/好友榜), `t`.
Format notes: `battles[].chanceText` and `luckText` are shown as given (include the words, e.g. `胜算八成`, `天时平`); `morale.lord/cohesion` numbers are shown with 2 decimals; `replay.best.lineup[].slot` uses the slot keys; `streak.text` is shown only when set.
识人 verdict: while `reveal.pending`, lineup rows below `reveal.step` (0..5, count of slots revealed) show `？` for stats/S_r and no tier/fit, and the plain frame; the whole verdict area is `result:revealSkip` (tap sets `step` to 5 and `pending` to false); no action buttons and `再来一局` is disabled until then.
Action layout: 复盘 (rewarded) first, then 看群榜/好友榜, then 分享战报 / 发起挑战 / 保存图片 (stacked in large text); 保存图片 is never adjacent to the ad button. `saveImage.state`: idle, rendering (生成中…, disabled), saving (保存中…, disabled), saved (已保存 ✓), denied (button stays enabled, logic shows `overlay.albumDenied`), error (保存失败, retry).
`subscribe.state` `offer|requesting|granted` draws the inline card above 再来一局 (`result:subscribe`, 请求中… disabled, 已开启应战提醒 text); `hidden|declined|unavailable` draw nothing.
`replay.locked` draws the disabled-looking button with `replay.lockedText`; the tap still returns `result:replay` so logic can show the same text as a toast.
Hit ids: `result:back`, `result:skip` (whole area while revealing battles), `result:revealSkip` (verdict area during 五德揭晓), `result:retry` (pendingSubmit/error), `result:again`, `result:share`, `result:challenge`, `result:save`, `result:subscribe`, `result:replay`, `result:board`, `result:breakdown`, `sheet:close`, `sheet:list` (scroll area inside the breakdown/replay sheets).
scrollMax ids: `result:scroll` (done view), `sheet:list`.

## challenge  (`challenge.js`)
Spec fields (v1): `status`, `theirRecord`, `mode`, `countsAsDaily`, `isFriendly`, `answerCount`, `lineupLocked`, `variantLabel`, `subscribe {state}` (own challenge only).
Extras: `bestRecord: {w,l}` (status `own`), `t`.
`variantLabel` shows a "识人军令" pill (ready, own, answered); `lineupLocked` on `answered` adds "对方阵容 · 完成今日军令后可见". Own challenge: `subscribe.state` `offer|requesting` -> the `challenge:subscribe` button, `granted` -> the passive text 已开启应战提醒, anything else nothing.
Hit ids: `challenge:accept`, `challenge:home`, `challenge:retry`, `challenge:free`, `challenge:daily`, `challenge:compare`, `challenge:subscribe`. No back button (entry screen).

## history  (`history.js`, list)
vm: `{state:'loading'|'ready'|'empty'|'error'|'offline', bestStreakText, items:[{dateKey, issueNo, dateText, variantLabel, mine:{record,bandLabel}|null, isToday, statusText}]}` + extras `scrollY`, `t`.
`mine: null` draws 未出征; `statusText` (e.g. 进行中) is drawn in the seal colour.
Hit ids: `history:back`, `history:retry` (error/offline), `history:item:<dateKey>` (every row; today's row too, logic decides), `history:list` (drag area; scrollMax id).

## historyIssue  (`historyIssue.js`, issue detail)
vm: `{state:'loading'|'ready'|'error'|'offline', dateKey, issueNo, variantLabel, mine:{record,bandLabel,lineup:[{slot,label,name,seal,stats}]}|null, stats:{totalText,bands:[{label,shareText}]}|null, best:{record,lineup:[{slot,label,name,seal}]}|null, bestLockedText}` + extras `scrollY`, `t`.
The date line "第11期 · 10月14日" is built by the renderer from `issueNo` + `dateKey` (`YYYYMMDD` or `YYYY-MM-DD`). `mine.lineup[].stats` is drawn when present (send it on 识人 days); `stats.bands[].shareText` like `9%` also sizes the bar. `best: null` shows `bestLockedText`.
Hit ids: `issue:back` (label 往期), `issue:retry`, `issue:list` (drag area; scrollMax id).

## board  (`board.js`, group and friend)
Spec fields (v1): `kind, dateKey, issueNo, state, mode, viewerPlayed, self, actions, variantLabel, banner {show, reservedHeight}`.
Extras: `sharedCanvas` (the canvas from `wx.getOpenDataContext().canvas`, state `ready`), `banner.stub` (true when the ad module runs in stub mode: draws the grey 广告位（测试） bar), `t`.
**Board rect:** use `boardRect(L, vm.banner)` (also `render.boardRect`) for the open data canvas size and `postMessage` width/height; it equals `L.board` without a banner and is shortened by `reservedHeight + 24pt` with one. The native banner goes at `bannerRect(L, vm.banner)` (screen width - 32pt, centred, pinned above the bottom inset), `null` when not shown. The renderer honours `banner` only in the `ready` and `empty` states and moves the footer button up so it stays >= 24pt above the banner. `variantLabel` draws a 识人 badge in the title row.
Hit ids: `board:back`, `board:retry`, `board:goPlay`, `board:share`, `board:contract`, `board:agree`, `board:openSetting`, `board:list` (drag area; forward the offset to the open data domain as `{type:'scroll', offset}`).
The open data domain clamps scroll itself, and it cannot tell the main domain the true range, so clamp your offset to `[0, serverRows * rowH * layout.s]` at most (`rowH` is 66, or 100 in large text).

## overlay  (`overlay.js`, draw after any screen)
`vm = {dialog?, toast?, adStub?, privacy?, albumDenied?, display?}`.
- `dialog: {title?, text, confirmLabel, cancelLabel?, danger?}` -> `dialog:confirm`, `dialog:cancel`
- `toast: {text}` (no hit areas; logic removes it)
- `adStub: {kind:'rewarded'|'interstitial', secondsLeft}` -> `adstub:complete`, `adstub:skip`
- `privacy: {}` (own dialog, the spec 11.6 fallback if the device spike rules out the official popup; **not wired in v1**: the controller uses `wx.requirePrivacyAuthorize`) -> `privacy:agree`, `privacy:refuse`, `privacy:contract`
- `albumDenied: true` -> "保存图片需要相册权限" with `album:openSetting` (call `wx.openSetting`) and `album:cancel` (spec 8.12; shown by logic after privacy/scope refusal, no automatic re-ask)

## shareCard  (`shareCard.js`)
`render(canvas, vm, {pixelScale?, saved?})` sets the canvas to 500x400 (times `pixelScale`) and draws; `draw(ctx, vm, {saved?})` draws into a 500x400 area. Then export with `canvas.toTempFilePath`. Album card: `pixelScale: 2` and `saved: true` (adds "微信小游戏 · 点将台").
```
vm = { mode:'daily'|'free',            // daily: NO general names (D4); free: names
       issueNo?, variantLabel?:'识人'|null,   // tag next to the issue number (daily)
       record:{w,l}, bandLabel,
       lineup:[{slotLabel, name, monogram, faction:'wei'|'shu'|'wu'|'qun'|'jin', factionLabel, sub, tier?}], // 5
       battles: boolean[12] }          // true = win
```
`faction`/`factionLabel` are those of the cell the general was **drafted from** (spec 8.4). `sub` like "蜀 · 赤壁" and `tier` (default 乙 frame) are used by the free card only. Daily draws only the faction tile (character + colour), never `name`/`monogram`. The card ignores `display` (and restores the caller's mode).

## open data domain  (`opendata/`)
Receives the spec 13 message, with these additions: `dpr?: number` (default 1), `roster?: Array<[monogramChar, factionKey, tier?]>` indexed by roster index (`factionKey` may be `'jin'`; `tier` 'jia' draws a gold inner frame), and `display?: {largeText, highContrast}` (large text scales type and rows, high contrast swaps the palette). Server rows are `[h, w, s, x?, k?]`: `k` is the streak, and "连N" is drawn for `k >= 2` only. Messages: `{type:'render', ...}` and `{type:'scroll', offset}`. Set `"openDataContext": "opendata"` in game.json. It reads rows with `getGroupCloudStorage` (`groupid` if present, else `shareTicket`) or `getFriendCloudStorage`, hashes `openid|salt`, and ranks by the server rows only. Read failures and empty lists are drawn inside its canvas. The 识人 label sits in the main domain's title row (`board.variantLabel`).

## Packaging note
`tools/` (preview, node_modules) and `tests/` must be excluded from the uploaded package (`packOptions.ignore` in the project config, owned by minigame-dev).
