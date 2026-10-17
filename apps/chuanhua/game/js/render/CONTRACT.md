# Render contract (frontend-ui <-> minigame-dev), v2: 传画接龙 (spec rev. 2)

Owners: **render = frontend-ui** (`js/render/*.js`: how it looks); **logic = minigame-dev** (`js/vm.js`, `controller.js`, `api.js`, `core/*`: what it says and does). Neither edits the other's files. A change to this file needs both owners. Spec: `docs/chuanhua/spec.md` §8 (screens), §5 (canvas, strokes v2, forced send), §9 (share), §12 (view models). This is the binding contract for the logic rebuild: every screen below has a ready-made vm for every state in `js/render/samples.js` (`sample(screen, state, overrides?)`, `SAMPLES`), and `tests/contract-docs.test.js` keeps this file and the samples in sync (every `## screen` section and every `**States:**` entry must have a sample; every hit id listed here must be produced by some state, `tests/render.screens.test.js`).

What rev. 2 changed in the render layer: the 今日起点 card, the national count, the 今日 chips, the draw-screen 今日彩笔 pill, 同题再传 and the vertical auto-play reveal strip are GONE. New screens: `pick` (was `picker`), `roundWait`, `lobby`, `roomEntry`, `overview` and `stepthrough` (both replace `reveal`), `startLimit` (sheet). Changed: `home`, `draw`, `describe`, `sent`, `entry`, `teaser`, `group`, `album`, `howto`, `settings`, `shareCard`, `strokes`.

## Conventions (all screens)

- Every screen module `js/render/<screen>.js` exports `draw(ctx, vm, layout) -> hitAreas`.
- `vm` is the spec 12 view model plus the fields marked **ADD** below. `?` = optional; a missing optional falls back to the stated default. **Strings are pre-formatted by logic** (`core/copy.js`); renderers only draw them. Renderer-owned strings: fixed chrome (button labels such as 开一局, 慢慢传（不用同时在线）, 放弃, 离开, 画好了, 传出去, 撤销, 清空, 重试, 返回, 举报, 再来一局, 分享揭晓卡, 往前一棒, 往后一棒, 下一条, 看完了, 重播, the section titles, the report reasons' labels, the 公约 bullets, the 玩法 text), the source-strip prefixes `题目：「…」` / `上一棒说：「…」`, and the marker texts (`MARKER_TEXT`: emptyDraw `（没来得及画）`, emptyText `（没来得及写）`, notDelivered `（这一棒没传过来）`).
- `layout = makeLayout({windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect})`. `menuRect` = `wx.getMenuButtonBoundingClientRect()`. Content starts below `navBottom = capsule.bottom + (capsule.top - statusBarHeight)`; **nothing is drawn or tappable in the capsule row** (the capsule); primary actions sit in the bottom 40% of the screen above the safe area; touch targets >= 48 x 48 pt; body text >= 16 pt (20 pt in large-text mode); design width 375, must work from 320 to 430 wide and 568 to 932 tall, and on a 768 x 1024 tablet (AC 107, 108). `layout.bottomEdge` = window height - bottom safe inset.
- `hitAreas = [{id, x, y, w, h}]` in canvas px. **Later areas win** (concatenate `screen.draw(...)` then `overlay.draw(...)`). Unknown ids (`*:block`, `*:card`, `sheet:body`, `sheet:scrim`, `coach:block`) only swallow taps; ignore them. `hitAreas.scrollMax = {<scrollId>: maxOffsetPx}` for scrollable regions; logic owns the offset and passes it back as `scrollY` / `sheetScroll` (clamp to scrollMax). Keep `scrollMax` when concatenating overlay hits.
- Extra properties of the returned array (not hit areas): `draw`: `canvas`, `gridH`, `paper`, `geometry`; `describe`: `drawing`, `input`, `geometry`; `stepthrough`: `swipe`, `note`; `roundWait`: `mineRect`.
- Renderers are **pure**: no `wx`, no timers, no state, no network, no clock. Animation = logic passes progress fields (`t` ms clock, `playT`, ...) and redraws each frame. Shipped render code requires only `.js` modules (`tests/wechat-compat.test.js`). Frame loop: no per-frame allocations that scale with stroke count (cache drawings, see `strokesRev`).
- Fonts: system only. Text never below 16 pt (20 pt large-text).
- **No identity anywhere**: steps are "第 N 棒", chains "第 N 条", the viewer's own are "(你)" / "你起的" (`mine`, `mineStarted`); renderers never show or ask for names, avatars, ids (AC 74).
- Share cards never contain user drawings (PO-24): invite = our art + progress / seats; reveal card = our art + passed text.
- **No ad of any kind** is drawn on `roomEntry`, `lobby`, `pick`, `draw`, `describe`, `roundWait`, `entry`, `overview` or between the steps of `stepthrough` (AC 104, 106, 163). The only ad surfaces: the rewarded buttons on `startLimit` (慢慢传 starts) and `settings` (今日彩笔), and the list banner slot of `group` / `album` (`bannerRect`, >= 24 pt above nothing tappable).

## Display modes (all screens, spec 8.14, PO-31)

Pinned actions (QA-R2-9, AC 107/108): a primary action is never inside a scroll body at rest. Lobby, entry, roomEntry, sent and teaser pin their action block at the bottom (above the safe area) and only the content above it scrolls; the scroll area ends one gap above the first action. Home, pick and overview already pin theirs. A scroll body that is not at its end draws a bottom fade and a small down chevron ("more below"), and logic keeps passing `scrollY` as before (no new fields, no new ids). `render-primary.test.js` checks every primary id at all six sizes x four modes.

Every vm carries `display: {largeText:boolean, highContrast:boolean}`. Each `draw()` starts by applying it, so the mode is per draw call. Pass the same `display` in the overlay vm. Share cards always use the standard look. Large text: body >= 20 pt, buttons and rows >= 56 tall (the draw-screen top bar and rows are 56); lists scroll; the draw canvas absorbs the difference. High contrast: plain white, pure ink, 2 pt outlines, text >= 7:1, non-text >= 3:1, margin tone `#DDDDDD`. The 12 stroke colours are NEVER remapped (they are content).

## Draw-screen geometry (spec 8.4, AC 122-127)

`R.drawGeometry(L, {sourceLines, unlocked, display})` (= `screens.draw.geometry`) and `R.canvasRectFor(ctx, L, display, source, unlocked)` are **pure** and are what logic calls at turn open to freeze the canvas rect and `h` for the turn; `draw()` computes the same numbers every frame, so the canvas never moves during a turn (AC 126; status text is drawn over its bottom). Standard mode rects (x, y, w, h in pt):

| Element | 375 x 812 | 320 x 568 |
|---|---|---|
| Top bar (back 8..88, title, 举报 48 wide, timer 64 wide) | 0, 84, 375, 48 | 0, 64, 320, 48 |
| Source strip, 1 line / 2 lines | 16, 132, 343, 40 / 64 | 16, 112, 288, 40 / 64 |
| **Canvas (1-line strip)** | **8, 180, 359, 478** `h` 1363 | **8, 160, 304, 288** `h` 970 |
| **Canvas (2-line strip)** | **8, 204, 359, 454** `h` 1295 | **8, 184, 304, 264** `h` 889 |
| Colour row (6 targets 48 x 48, pitch (w - 48) / 5) | 8, 666, 359, 48 | 8, 456, 304, 48 |
| Tool row: 撤销, 清空, 粗细 (64 / 56 wide), 画好了 | 8, 722, 359, 48 | 8, 512, 304, 48 |

With 今日彩笔 unlocked a second colour row (colours 6-11) sits ABOVE the base row (y 610 and 666 at 375 x 812) and the canvas loses 56 pt: 8, 180, 359, 422 `h` 1204 (375 x 812); 8, 160, 304, 232 (320 x 568, `h` = round(1024 x 232 / 304) = 781; the spec text says 782, which is a rounding slip). At 320 x 568 with a 2-line strip AND 今日彩笔 the free space is 304 x 208 (aspect < 0.75), so the canvas is clamped to 277 x 208 at x 21.5 with `h` 768. **Formula:** `canvas.y = strip.bottom + 8`; `toolRow.bottom = bottomEdge - 8`; colour rows above the tool row with 8 pt gaps; `canvas.bottom = topColourRow.y - 8`; `canvas.x = 8`, `canvas.w = windowWidth - 16`; then the clamp of §5.1 (`R.strokes.canvasFor(free)`: `h = round(1024 x free.h / free.w)` clamped to 768-2048; outside the clamp the canvas is reduced to the clamped aspect and centred). Large text: bar and rows 56, strip lines 28 pt (20 pt text), labels 20 pt.

Describe-screen rects (`R.describeGeometry(L, {keyboardH?, display?})`): 375 x 812 drawing area 8,140,359,510, input 8,658,359,56, 传出去 8,722,359,48; 320 x 568 drawing 8,120,304,328, input 8,456,304,48, 传出去 8,512,304,48 (the input is 48 high when the window is < 640 tall, 72 in large text).

## Drawing canvas input contract (draw screen)

- The renderer returns one hit area `draw:canvas` = the canvas rect, and echoes `hitAreas.canvas = {x,y,w,h}` (px), `hitAreas.gridH` (the logical height) and `hitAreas.paper = {x,y,w,h,scale}` (the exact paper rect inside the canvas; it equals the canvas to within 1 px). The grid is **1024 wide x `gridH` high**. Map a touch with the paper: `gx = (px - paper.x) / paper.scale`, `gy = (py - paper.y) / paper.scale` (clamped to 0..1023 and 0..gridH-1). `gridH` = `vm.gridH` = `round(1024 x canvas.h / canvas.w)` clamped 768-2048 (spec 5.1), fixed for the turn.
- **Single-finger routing**: a touch that **starts inside** `draw:canvas` starts a stroke and keeps drawing while it moves, even outside the rect (points clamp to the edge); a touch that starts outside never draws; a second finger is ignored while the first is down. Events go to the stroke recorder: `begin(gx, gy, colorIdx, sizeIdx)` on touchstart, `move()` on touchmove (kept only if >= 3 grid units from the last kept point), `end()` on touchend/touchcancel. The recorder (core, rewritten for `h`) emits absolute strokes `[{c, w, p}]` and the wire form `{v:2, h, s}`.
- **What the renderer draws:** `vm.strokes` (wire `{v:2,h,s}`, v1 `{v:1,s}`, or the recorder's absolute `[{c,w,p}]` with `vm.gridH`). Canonical geometry (`render/strokes.js`, equal to the server rasteriser, spec 5.4): every polyline passes through `(p + 0.5) x scale`, with round caps, round joins, `lineWidth = SIZES[w] x scale`, colour `COLORS[c]`; one-point strokes (`dot`) are filled circles of diameter `width`. No smoothing, no extra effects. Only the stroke currently being drawn may be smoothed (`vm.drawingNow`).
- `vm.strokesRev` (number) increments on every change; the renderer caches the finished strokes into an offscreen canvas keyed by `strokesRev` and only draws the live stroke each frame (60 fps target on mid-range Android, AC 32). `app.js` calls `R.strokes.setCanvasFactory(...)` once.
- White paper, thin frame. At 4,000 points (`vm.pointsUsed >= vm.pointsMax`) or the ink budget the strip over the canvas shows `vm.limitText` ("画得太细啦，先交吧" / "线条太多啦，先交吧") and logic stops calling `begin`.
- **Forced send (F-4, AC 128):** when `vm.status` is `timeUp` or `sending`, or `vm.inputLocked`, the renderer draws everything disabled and returns **no hit area except `draw:block`** (the whole window), so every touch and every button (canvas, colours, size, 撤销, 清空, 画好了, 举报, back) is inert. Logic ends the stroke in progress at its last kept point and includes it in the send. The 清空 confirm dialog is an overlay: logic closes it at 0.
- Palette: `vm.palette = [{idx, color, locked}]`, 12 entries. The six base swatches are one row. The second row of six is drawn **only when 今日彩笔 is unlocked** (`locked: false` on idx 6-11, unlocked in 设置 only, PO-49); while locked the six are not drawn at all and there is NO unlock pill on the draw screen. 40 pt swatches (44 in large text) in 48 pt targets; selected = ring + check mark (not colour alone). The size toggle is ONE button (`draw:size`, logic cycles 细 8 -> 中 18 -> 粗 36 grid units) showing a dot of the real width plus the word.
- Static drawings (describe, round wait, 已传出, overview, step-through, 我的接龙 detail) use the same function with the rect they are given.

## Strokes display (`strokes.js`, spec 5.1, 5.7, AC 125)

`drawStrokes(ctx, strokes, rect, opts?) -> {x,y,w,h,scale,gridH}` (the paper rect). A drawing is drawn **contain-fitted and centred** in any rect: `scale = min(rect.w / 1024, rect.h / h)`; never cropped, never stretched. The paper (white) is 1024 x scale by h x scale; the unused part of the rect is filled with the margin tone (`#EFEAE0`, `#DDDDDD` in high contrast) so its edge is visible. v1 drawings (no `h`) are square (h = 1024). Example: h = 1363 in the 375 x 812 describe area (359 x 510) is drawn 359 x 478 with 16 pt of margin above and below. `opts`: `{gridH?, playT?, margin?: false, frame?, cacheKey?, rev?, dpr?, live?}`. Replay: `vm.steps[i]` plus `vm.playT` (0..1) -> `replayPolylines(polys, playT)`; logic computes `playT = min(1, elapsedMs / REPLAY_MS)` (`REPLAY_MS = 2500`, AC 31). Exports: `GRID_W, H_MIN, H_MAX, COLORS, BASE_COLORS, SIZES, REPLAY_MS, drawStrokes, drawPolylines, setCanvasFactory, toAbsolute, absToPolylines, replayPolylines, gridHOf, fit, canvasFor`. This module owns its palette / widths / decoder (it does not depend on the core codec's version); `tests/render.strokes.test.js` keeps it equal to `core/strokes.js`.

## Hit id naming

`<screen>:<action>` or `<screen>:<action>:<param>`. Unknown ids are ignored by logic; logic routes every id listed here (enforced by the integration tests). Back buttons are `<screen>:back` (or `<screen>:home` where the label is 首页) and are text buttons "‹ 返回" / "‹ 离开" / "‹ 放弃" / "‹ 首页" / "‹ 全部" at the top left, level with the top bar, below the capsule row.

---

## shared  (every vm)

```ts
display: { largeText: boolean, highContrast: boolean }
muted: boolean
features: { liveRooms: boolean, subscribe: {tmplId:string}|null, updatableCard: boolean,
            banner: {enabled:boolean, adUnitId:string|null},
            interstitial: {enabled:boolean, minLifetimeReveals:number, minGapSec:number, maxPerDay:number} }
ugc: { createEnabled: boolean, viewEnabled: boolean }
t: number            // ms clock for skeleton pulses / animation (ADD, optional, default 0)
type Strokes = { v:2, h:number /*768-2048*/, s:number[][] } | { v:1, s:number[][] }
type Marker = 'emptyDraw'|'emptyText'|'notDelivered'
type Source = { kind:'prompt'|'text', text:string } | { kind:'draw', strokes:Strokes }
            | { kind:'marker', marker:Marker, hint:string } | { kind:'hidden'|'paused', hint:string }
```

## home  (`home.js`)
**States:** loading | ready | offline | error
```ts
{ state, streakText:string|null /* '连续接龙 4 天', only >= 2 */,
  primary:{ kind:'room'|'chain', label:'开一局'|'开一条接龙', sublabel:string|null, enabled:boolean },
  slowLink:{ show:boolean, label:'慢慢传（不用同时在线）' },
  activeRoom:{ roomId, line:string /* '回到这一局 · 第 2/4 轮' | '回到这一局 · 等待开始' */ }|null,
  groupLine:{ show:boolean, text:string, target:'room'|'chains'|'group', roomId?:RoomId },
  chainStart:{ freeLeft:0..3, adLeft:0..2, sheet:null|'limit', adState?:'idle'|'loading'|'playing'|'error' /*ADD*/ },
  album:{ unseenReveals:number },
  restriction:{ text:string }|null, ugcPausedText:string|null,
  showHowToOnce:boolean, showRulesWarning:boolean,
  sheet: null|'howto'|'rules'|'warning'|'settings'|'startLimit' /*ADD*/, rules?:RulesVm, settings?:SettingsVm, warningText?:string, sheetScroll?:number, scrollY?:number }
```
No `daily`, no `countText`, no 今日 chips. `primary` is drawn pinned in the bottom 40%, with the `slowLink` right under it (hidden when `features.liveRooms` is false, then `primary.kind` is `'chain'` and the label 开一条接龙) and the four tiles 我的接龙 / 本群接龙 / 玩法 / 设置 below (4 across when they fit, else 2 x 2; in large text the tiles scroll with the page). `unseenReveals > 0` puts a dot on 我的接龙 (and "(1)" in the 2 x 2 form). The `sheet:'startLimit'` sheet is drawn over home with `vm.chainStart`. Spec 8.1 cases map onto fields: room cap -> `primary.sublabel` "今天开局次数已用完，明天再来" + `enabled:false`; restricted / paused -> banner text and `enabled:false`; group context -> `groupLine`; seated -> `activeRoom`; offline -> state `offline` (both buttons disabled; `home:album` still works).
Hit ids: `home:primary`, `home:slow`, `home:activeRoom`, `home:groupLine`, `home:album`, `home:groupList`, `home:howto`, `home:settings`, `home:retry` (offline/error), `home:scroll`.

## rules  (接龙公约 bottom sheet; also drawn over home / roomEntry / entry)
**States:** open
```ts
RulesVm = { version:number, open:boolean, pendingAction:'createRoom'|'joinRoom'|'start'|'claim'|null }
```
No pre-ticked box. Hit ids: `rules:agree` (同意并开始 -> `agreeRules`, then continue `pendingAction`), `rules:decline` (先看看, closes; browsing stays fully usable), `rules:terms` (《用户协议》), `rules:privacy` (《用户隐私保护指引》 -> `wx.openPrivacyContract`), `sheet:close`.

## warning  (one-time strike sheet, over home)
**States:** open
```ts
{ text: string }   // core/strikes.WARNING_TEXT
```
Hit ids: `warning:ok`, `sheet:close`.

## howto  (玩法 sheet)
**States:** open
No data; fixed text from spec 8.15 (three lines of a live game plus the 慢慢传 line) and the 3-panel illustration (our art). Hit ids: `sheet:close`.

## startLimit  (sheet over home: 慢慢传 starts used up)
**States:** ad | none
```ts
{ chainStart:{ freeLeft:0, adLeft:0..2, adState?:'idle'|'loading'|'playing'|'error' } }
```
`ad` (adLeft > 0): "▶ 看视频再开一条 (剩 2)"; `none`: "明天再来开新的吧" with 知道了. Rewarded video only (reward on `isEnded`). Hit ids: `startLimit:ad`, `sheet:close`.

## pick  (`pick.js`, both modes, spec 8.3)
**States:** loading | ready | rerolling | sending | error | offline | timeUp
```ts
{ state, mode:'live'|'chain', title:'选一个题目', subtitle:string /* 慢慢传: '你来画第 1 棒' */,
  timer?:{ secLeft:number, warn:boolean },               // live only (30 s round 0)
  rollId:string, prompts:[{ id, text }]  /* 3, from 3 categories */, selectedId:string|null,
  rerollLeft:0|1|2|3|4|5,          // from the server (MAX_REROLLS 5, rev. 2.1); never computed by the screen
  rerollDisabled:boolean,         // true exactly when rerollLeft === 0: greyed out, no hit id
  rerollLabel:string,             // '换一批（剩N次）' (N = 1..5) | '换一批机会已用完'
  rerollTappable:boolean,         // rerollLeft > 0 && state === 'ready'
  custom:{ open:boolean, text:string, count:string /* '5/12' */, error:string|null, passed:boolean },
  startLabel:string /* '就这个' | '开始画 (60 秒)' | '准备中…' */, canStart:boolean, errorText:string|null, canBack:boolean, scrollY?:number }
```
Live: no back button, the countdown pill in the top bar. 慢慢传: "‹ 返回", no timer. **换一批 (rev. 2.1, up to 5 per pick) is never hidden.** It shares one row with 自己出题 and its rect is the same in every state of one pick: it depends on the window and the display mode only, never on `rerollLabel` or `rerollLeft`. It is sized for the longest label (「换一批（剩5次）」 and 「换一批机会已用完」) at the smallest text size the button allows (16 pt, 20 pt in large text); with the compact label both buttons share one row at every size and mode (TD-152; a full-width row above is only a safety fallback for a narrower window). With `rerollTappable` it is the normal secondary button and `pick:reroll` is returned; with `rerollDisabled` (the 5th reroll was used) it is drawn in the disabled style (greyed fill, dashed outline, `disabledInk` text: 4.5:1 standard, 7:1 high contrast) and has NO hit id, so a tap does nothing; in `rerolling` (a request is in flight) it keeps the normal look but has no hit id, the cards and 就这个 are inert too, and `canStart` is false. The returned hit array carries `rects.reroll = {x,y,w,h}` (scrollY 0), identical in every state; the vm does not carry it because a vm has no layout. Three cards of 64 pt (72 in large text), the first preselected by logic. The custom input is canvas-drawn (logic owns the keyboard); while open the list is replaced by the input. `timeUp`: every hit area is gone except `pick:block` and the button reads "时间到，正在交出…" (logic sends the selected rolled prompt, or the first, unless a custom prompt already passed, spec 4.2). `error` text e.g. `MODERATION_BUSY` copy.
Hit ids: `pick:back`, `pick:item:<promptId>`, `pick:reroll` (absent while `rerollDisabled` or `rerolling`), `pick:custom`, `pick:customInput`, `pick:customOk`, `pick:customCancel`, `pick:start`, `pick:retry`, `pick:scroll`, `pick:block`.

## draw  (`draw.js`, live 画出来 and 慢慢传 第 1/3/5 棒; spec 8.4)
**States:** drawing | sending | blocked | error | timeUp
```ts
{ mode:'live'|'chain', roomId?, round?, rounds?, chainId?, claimId?, step?:number,
  title:string /* '画出来 · 1/4' | '第 3 棒 · 画出来' */, backLabel:'离开'|'放弃',
  source:Source /* prompt | text | marker | hidden | paused */, sourceLines:1|2 /*R.canvasRectFor / R.screens.draw.sourceLinesFor*/,
  canReport:boolean,                                  // false on round 1 / 第 1 棒, markers, hidden
  timer:{ secLeft:number, warn:boolean },             // warn = last 10 s: the pill turns 朱 and fills
  canvas:{ x,y,w,h }, gridH:number,                   // frozen at turn open from R.canvasRectFor
  palette:[{ idx, color, locked }], colorIdx:number, sizeIdx:0|1|2,
  strokes:Strokes|AbsoluteStrokes, strokesRev:number, drawingNow?:boolean,
  pointsUsed:number, pointsMax:4000, limitText:string|null,
  canUndo:boolean, canSubmit:boolean, inputLocked:boolean,
  status:'drawing'|'sending'|'blocked'|'error'|'timeUp', statusText:string|null, coach:boolean }
```
`source` copy: round 1 / 第 1 棒 `{kind:'prompt'}` -> "题目：「…」"; later `{kind:'text'}` -> "上一棒说：「…」"; `{kind:'marker', hint:'上一棒没来得及写，你自由画一幅吧'}`; `{kind:'hidden', hint:'（该内容已被举报隐藏）你自由画一幅吧'}`; `{kind:'paused', hint:'内容维护中'}`. `statusText` per status (strip over the canvas bottom, nothing moves): `timeUp` "时间到，正在交出…", `sending` "正在交出…", `blocked` "这幅画没通过审核，改一改再交" (canvas stays unlocked, timer keeps running), `error` "没传出去" with a 重试 button in the strip (`draw:retry`). `coach` = the 3 s first-ever line (dismiss corner `coach:next`; the first stroke dismisses it too).
Hit ids: `draw:back`, `draw:report`, `draw:canvas`, `draw:color:<0-11>`, `draw:size`, `draw:undo`, `draw:clear` (-> overlay confirm "清空画布？"), `draw:submit`, `draw:retry` (status error, in the strip), `coach:next`, `draw:block` (forced send / sending: swallows everything).

## describe  (`describe.js`, live 猜一猜 and 慢慢传 第 2/4/6 棒; spec 8.5)
**States:** typing | sending | blocked | busy | error | timeUp
```ts
{ mode:'live'|'chain', roomId?, round?, rounds?, chainId?, claimId?, step?:number, title:string /* '猜一猜 · 2/4' | '第 4 棒 · 猜一猜' */, backLabel:'离开'|'放弃',
  source:Source /* draw | marker | hidden | paused */, canReport:boolean,
  timer:{ secLeft, warn }, text:string /* already sanitized by core/text.inputFilter */, count:'7/16',
  canSubmit:boolean, inputLocked:boolean, keyboardH?:number /* px; 0 or absent = closed */,
  status:'typing'|'sending'|'blocked'|'busy'|'error'|'timeUp', errorText:string|null,
  caret?:boolean /*ADD blink*/, shake?:boolean /*ADD: counter shake on a dropped character*/ }
```
The drawing fills all the space above the input (contain-fit, margin tone). `errorText` is drawn as a strip over the drawing's bottom: `sending` "审核中…", `blocked` "这句话没通过审核，换个说法吧" (text kept), `busy` "审核服务繁忙，请稍后再试", `error` "没传出去" (+ 重试), `timeUp` "时间到，正在交出…" (keyboard closed by logic, every hit area gone except `describe:block`). Marker source: the marker text on a plain note plus `hint` ("上一棒没来得及画，你随便写一句吧"). With `keyboardH > 0` the compact TD-75 layout applies.
Hit ids: `describe:back`, `describe:report`, `describe:input` (focus -> `wx.showKeyboard`), `describe:submit`, `describe:retry`, `describe:block`.

## roundWait  (`roundWait.js`, spec 8.17)
**States:** ready | passing | offline
```ts
{ roomId, round:number, rounds:number, title:'已交 · 2/4', timer:{ secLeft, warn },
  mine:{ strokes?:Strokes, text?:string, marker?:Marker },
  progressText:'等大家交… 3/5 已交', nextText:string /* '下一轮：猜一句' | '最后一轮了' | '马上揭晓' */,
  passing:boolean /* '传递中…' */, offlineText:string|null /* '网络不好，正在重连…' */ }
```
Shown after the player has sent, until the next round starts (logic then moves to draw / describe / overview by itself). No 举报, no ad. Hit ids: `roundWait:back` (-> confirm "离开后你的回合会自动跳过，确定离开？").

## lobby  (`lobby.js`, spec 8.16)
**States:** ready | starting | closed | removed | offline
```ts
{ state, roomId, seats:[{ n:1..10, filled:boolean, me:boolean, quiet:boolean }] /* always 10 */, joinedText:'4 人已加入（3–10 人）', isHost:boolean,
  start:{ show:boolean, enabled:boolean, label:'开始（4 人）', hint:string|null, slowLink:boolean },
  waitingText:string|null /* '等房主开始…' */, canInvite:boolean, scrollY?:number }
```
Ten numbered doodle seats in two rows of five; filled = joined; "你" under the viewer's; a faint "?" badge (and the line "带 ? 的座位可能已离开") when `quiet`. Seats are NOT tappable. Host with >= 3 seats: `start.enabled`. With 2: `enabled:false`, `hint:'至少 3 人才能开局'`, `slowLink:true` (the link "两个人？去慢慢传"). With 1: `hint:'把邀请发到群里，群友点开就能加入'`. Non-host: `start.show:false` and `waitingText`. `starting`: the button reads "马上开始…". `offline` adds "网络不好，正在重连…" and keeps the screen. `closed` ("这一局太久没开始，已关闭") / `removed` show a panel and 回首页. No ads, no 今日彩笔, no banner.
Hit ids: `lobby:back` (离开 -> confirm "离开这一局？" -> `leaveRoom`), `lobby:invite` (share the room card, voluntary), `lobby:start`, `lobby:slow`, `lobby:home` (closed / removed), `lobby:scroll`.

## roomEntry  (`roomEntry.js`, non-member, spec 8.16)
**States:** loading | joinable | full | started | teaser | wrongGroup | closed | removed | notFound | inOtherRoom | restricted | rulesRequired | ugcPaused | capReached | offline | error
```ts
{ state, roomId, joinedText:string|null /* '4 人已加入（3–10 人）' */, headline:string, subline:string|null,
  otherRoomId?:RoomId, joining?:boolean /*ADD: button reads 加入中…*/, restrictionText?:string|null /*ADD*/ , scrollY?:number }
```
Actions per state: `joinable` / `rulesRequired` -> 加入这一局 (logic opens the 公约 sheet first when needed); `restricted` / `ugcPaused` / `capReached` -> 加入这一局 disabled with the note; `full` / `started` / `teaser` -> 开一局 + 本群接龙 (logic normally switches `teaser` to the teaser screen); `wrongGroup` / `closed` -> 开一局; `removed` / `notFound` -> 首页; `inOtherRoom` -> 回到那一局 + 离开那一局; `offline` / `error` -> 重试. A member never sees this screen (logic goes straight to the lobby, the round or the overview).
Hit ids: `roomEntry:home` (the top-left 首页), `roomEntry:join`, `roomEntry:newRoom`, `roomEntry:group`, `roomEntry:backToRoom`, `roomEntry:leaveOther`, `roomEntry:retry`, `roomEntry:scroll`.

## sent  (`sent.js`, 已传出, 慢慢传 only, spec 8.6)
**States:** pending | passed | marker | blocked | void
```ts
{ chainId, step, kind:'draw'|'describe', mine:{ strokes?:Strokes, text?:string, marker?:Marker },
  modState:'pending'|'passed'|'marker'|'blocked'|'void', modText:string,
  nextText:string|null, autoUpdateNote:boolean,
  subscribe:{ state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable' },
  firstTimeExplainer:boolean, revealed:boolean }
```
`marker`: "时间到，已自动交出（没来得及画）" (the marker text goes in a note instead of a drawing). `blocked` at a forced send: "这一棒没通过内容审核，没有传出去". `pending` / `void` exist only in the async fallback mode. Never shown for a live room (live goes to `roundWait`).
Hit ids: `sent:home`, `sent:share` (发到群里接龙), `sent:subscribe` (揭晓时提醒我, only `offer`), `sent:group` (看看本群其他接龙), `sent:again` (再开一条), `sent:reveal` (when `revealed`, 看揭晓), `sent:scroll`.

## entry  (`entry.js`, 慢慢传 chain entry from a card or list, spec 8.7)
**States:** loading | claimable | taken | pending | prevMine | capReached | wrongGroup | inRoom | revealedParticipant | revealedTeaser | expired | removed | notFound | restricted | rulesRequired | ugcPaused | dailyLimit | offline | error
```ts
{ state, passed:0..6, length:6, nextStep:number|null, nextKind:'draw'|'describe'|null,
  headline:string, subline:string|null /* '上一棒是一幅画，你来猜一句（限时 45 秒，时间会自动交出）' */, timeLeftText:string|null, takenEtaText:string|null,
  isParticipant:boolean, isStarter:boolean, canRevealNow:boolean,
  subscribe:{ state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable' },
  claiming?:boolean /*ADD: button shows 接龙中…*/, restrictionText?:string|null /*ADD*/ , scrollY?:number }
```
`canSameAgain` is GONE (同题再传 removed). `inRoom` (new): "你正在一局里，先玩完再来接" + 回到这一局. `pending` appears only in the async fallback. **The entry never shows the prompt or any 棒 content** (AC 10). Progress is dots `●●●○○○` + 已传 3/6 棒. `expired` offers participants 看我的那一棒 and everyone 开一局.
Hit ids: `entry:claim` (接这一棒; in `rulesRequired` logic opens the 公约 sheet), `entry:group` (看看本群其他接龙), `entry:newRoom` (开一局), `entry:room` (回到这一局, `inRoom`), `entry:refresh`, `entry:reveal` (现在揭晓, only `canRevealNow`; logic confirms via overlay), `entry:viewReveal` (看揭晓), `entry:mine` (看我的那一棒), `entry:subscribe`, `entry:share`, `entry:home`, `entry:retry`, `entry:scroll`.

## overview  (`overview.js`, spec 8.8)
**States:** loading | ready | notMember | paused | offline | error
```ts
{ state, roomId, title:'全部揭晓！', subtitle:'5 条接龙 · 每条传了 4 棒',
  cards:[{ chainNo:number, chainId, mineStarted:boolean, unseen:boolean,
           final:{ kind:'draw'|'describe'|'marker', strokes?:Strokes, text?:string, marker?:Marker,
                   placeholder:null|'reported'|'deleted'|'paused', loaded:boolean } }],
  rematch:{ label:'再来一局', banner:string|null /* '房主开了新的一局 · 加入 ›' */, newRoomId?:RoomId },
  canShare:boolean, interstitialDue:boolean, scrollY?:number }
```
One sticky-note card per chain showing **only its final step** (drawing contain-fit and static, sentence, marker or placeholder; `loaded:false` = a skeleton while `getReveal` loads that chain) plus "第 N 条" and "你起的"; an unseen chain has a dot. **No prompt and no intermediate step ever appears** (AC 156). The renderer picks the columns (`columnsFor`: 2 at window width >= 360 in standard mode, else 1; the spec's `columns` field is not needed). The grid scrolls (`overview:scroll`, drag); the footer [再来一局] [分享揭晓卡] is pinned, with the rematch banner above it. The interstitial rule is applied by logic on leaving (`interstitialDue`).
Hit ids: `overview:back`, `overview:chain:<chainId>` (-> step-through at that chain's final step), `overview:rematch`, `overview:joinNew` (the banner), `overview:share`, `overview:retry`, `overview:scroll`.

## stepthrough  (`stepthrough.js`, both modes, spec 8.9)
**States:** loading | ready | notParticipant | paused | offline | error
```ts
{ state, mode:'live'|'chain', roomId?, chainId, chainNo?:number, chainCount?:number,
  header:string /* '第 2 条 · 你起的' | '接龙揭晓 · 6 位群友' */, earlyText:string|null /* '提前揭晓 · 传了 4/6 棒' */, backLabel?:string /*ADD: default '全部' (live) / '返回' (chain)*/,
  steps:[ /* index 0 = 起点 ... last = final */
    { n:number, label:string /* '起点' | '第 3 棒 · 画' | '第 4 棒 · 猜 · 最后一棒' */, kind:'prompt'|'draw'|'describe'|'marker',
      strokes?:Strokes, text?:string, marker?:Marker, mine:boolean,
      placeholder:null|'reported'|'deleted'|'paused',
      laughs:number, myLaugh:boolean, canLaugh:boolean, canReport:boolean } ],
  index:number /* starts at steps.length - 1 */, playT:number /* 0..1 replay of steps[index] */,
  dots?:{ show:boolean, text:string|null }, canPrev:boolean, canNext:boolean, endAction:null|'nextChain'|'done',
  canShare:boolean, interstitialDue:boolean }
```
Opens on the final step; `index` goes back to 0 (the 起点 card). The renderer shows one dot per step (a 48 pt target each: `stepthrough:dot:<i>`, 起点 hollow, current ringed) when `steps.length x 48` fits the width, else a "4/5" text (`dots.text`, or computed). `label` + " (你)" is drawn for `mine`. 笑 (a toggle with count) only when `canLaugh` (not markers); 举报 only when `canReport` (not own, not markers, not rolled prompts). Placeholders: reported -> 该内容已被举报隐藏, deleted -> 作者已删除这一棒, paused -> 内容维护中. `endAction` is drawn only at index 0: `'nextChain'` -> 下一条 ›, `'done'` -> 看完了 (last chain; logic returns to the overview). `canShare` puts 分享 in the top bar (慢慢传 reveals; the room's 分享揭晓卡 lives on the overview).
**Gestures (logic does the touch tracking):** `hitAreas.swipe = {x,y,w,h}` is the note area. A touch that starts in it and moves horizontally >= 48 pt (and more horizontally than vertically; vertical moves are ignored) is a swipe: right = earlier (`prev`), left = later (`next`). A touch that ends within ~10 px of where it started is a tap: `stepthrough:prevHalf` = left half of the note = earlier, `stepthrough:nextHalf` = right half = later (they stop above the 重播 button so nothing overlaps). **Replay (AC 31, 159):** a drawing replays when first shown (logic sets `playT` from 0 over `REPLAY_MS` 2.5 s when `index` changes); the 重播 button (`stepthrough:replay`) replays it; **while `playT < 1` the whole note is `stepthrough:skip`** (a tap completes the replay at once and the half-taps never navigate mid-replay). Sentences appear at once. Navigation is never automatic.
Hit ids: `stepthrough:back`, `stepthrough:share`, `stepthrough:prevHalf`, `stepthrough:nextHalf`, `stepthrough:skip`, `stepthrough:replay`, `stepthrough:laugh`, `stepthrough:report`, `stepthrough:dot:<i>`, `stepthrough:prev`, `stepthrough:next`, `stepthrough:nextChain`, `stepthrough:done`, `stepthrough:retry`.

## teaser  (`teaser.js`, non-participants, spec 8.10)
**States:** loading | ready | removed | notFound | offline
```ts
{ state, kind:'chain'|'room', title:string /* '一条接龙揭晓了' | '一局传画揭晓了 · 5 条接龙' */,
  lines:[{ from:string, to:string|null /* null = '（一幅画）' */ }], passed?:number, paused?:boolean /*ADD: 内容维护中*/, scrollY?:number }
```
Only passed start / final TEXT, never a drawing or an in-between 棒. `kind:'chain'` shows `lines[0]` as 「起点」 -> 传了 N 棒 -> 「终点」; `kind:'room'` shows one note per chain. Fixed notice (chain: 完整接龙仅参与的群友可见; room: 完整内容仅这一局的群友可见). 同题再传 is gone.
Hit ids: `teaser:newRoom` (开一局), `teaser:group`, `teaser:report` (small), `teaser:home`, `teaser:retry`, `teaser:scroll`.

## group  (`group.js`, 本群接龙, spec 8.11)
**States:** noGroup | checkingGroup | loading | ready | empty | error
```ts
{ state, statsText:string|null,
  rooms:[{ roomId, line:string /* '4 人已加入 · 等待开始' */, joinable:boolean }],
  waiting:[{ chainId, line }], inProgress:[{ chainId, line }],
  revealed:[{ kind:'room'|'chain', id:string, line:string, member:boolean }],
  banner:{ show:boolean, reservedHeight:number, stub?:boolean }, scrollY?:number }
```
Aggregate stats line only; **no per-person data** (AC 98). Sections 正在开的局 (joinable rooms are tappable and open the room entry; a game in progress is not), 慢慢传 · 等你接, 慢慢传 · 进行中, 最近揭晓 (a member -> overview, else teaser). Banner only in `ready` / `empty`, >= 24 pt gap to the primary button.
Hit ids: `group:back`, `group:room:<roomId>`, `group:item:<chainId>`, `group:revealedRoom:<id>`, `group:revealedChain:<id>`, `group:newRoom` (开一局), `group:retry`, `group:scroll`.

## album  (`album.js`, 我的接龙, spec 8.12)
**States:** loading | ready | empty | error | offline
```ts
{ state, streakText:string|null,
  items:[{ kind:'room'|'chain', id:string,
           status:'revealed'|'playing'|'lobby'|'open'|'pending'|'expired'|'blocked'|'removed', line:string, timeText:string, unseen:boolean }],
  cursor:string|null, banner:{ show:boolean, reservedHeight:number, stub?:boolean }, scrollY?:number }
```
Rooms and chains in one list, newest first. Each row has a status glyph AND words (from `line`), never colour alone. Offline shows the cached list read-only with a notice.
Hit ids: `album:back`, `album:room:<roomId>`, `album:chain:<chainId>`, `album:more` (cursor), `album:retry`, `album:scroll`.

## mine  (`mine.js`, own-棒 detail of an open/expired chain)
**States:** loading | ready | error
```ts
{ state, chainId, mine:[{ n, kind, strokes?:Strokes, text?:string, marker?:Marker /*ADD: a marker step, not deletable*/, modState:'pending'|'passed'|'marker'|'blocked'|'void'|'hidden'|'deleted', canDelete:boolean, line:string /*ADD pre-formatted status line*/ }], scrollY?:number }
```
Hit ids: `mine:back`, `mine:delete:<n>` (-> overlay confirm), `mine:retry`, `mine:scroll`.

## report  (`report.js`, bottom sheet; over draw / describe / stepthrough / teaser)
**States:** idle | submitting | done | limit | dup | error
```ts
{ open:boolean, target:{ chainId, step:number /* 0 = teaser texts */, roomId?:RoomId }, reasons:['porn','politics','abuse','ad','other'],
  state, selected?:string|null /*ADD*/ }
```
Reason labels (renderer): porn 色情低俗 · politics 政治敏感 · abuse 辱骂攻击 · ad 广告引流 · other 其他不适. No free text. At a live time-up logic closes the sheet. Hit ids: `report:reason:<porn|politics|abuse|ad|other>`, `report:submit`, `report:cancel`, `report:retry`, `sheet:close`.

## terms  (《用户协议》 full-screen reader, spec 8.14)
**States:** ready
Opened from `rules:terms` and `settings:terms`; a full screen (not a sheet), back button level with the capsule, title, then one scroll region.
```ts
{ title:'用户协议',
  paragraphs:[{ text:string /* '\n' = line break (bullet lists) */, important?:boolean /* a 【重要】 clause: the leading marker is NOT in text */, heading?:boolean /* 一、服务说明 */ }],
  scrollY:number }   // + display
```
Generated by `tools/build-terms.js` from `docs/chuanhua/release/user-agreement.txt`: one paragraph per non-empty source line; a line like `一、` .. `十五、` is `heading:true`; a line starting with `【重要】` is `important:true` and the marker is stripped. `heading` = bold, larger, orange rule. `important` = bold on a highlighted note with a thick left bar. Text is never truncated; large text and high contrast are supported; the scroll region ends at the last line (`scrollMax['terms:scroll']`). Build `paragraphs` ONCE and pass the same array every frame (wrapping is cached on the array per width and mode).
Hit ids: `terms:back` (-> back to where it was opened from), `terms:scroll` (drag; logic owns `scrollY`, clamped to `hitAreas.scrollMax['terms:scroll']`).

## settings  (`settings.js`, sheet over home, spec 8.14)
**States:** idle
```ts
{ muted, largeText, highContrast, canUnlockPalette:boolean, paletteUnlockedToday:boolean, paletteAd?:{state:'idle'|'loading'|'playing'|'error'} /*ADD*/,
  reminderText?:string|null /*ADD: the 揭晓提醒 status line*/, deleteAll:{ state:'idle'|'confirm1'|'confirm2'|'deleting'|'done'|'error' } }
```
**This is the ONLY place to unlock 今日彩笔** (PO-49): "▶ 看视频解锁今日彩笔" (`settings:palette`); unlocked: "今日彩笔已解锁（今天有效）". Hit ids: `settings:sound`, `settings:largeText`, `settings:highContrast`, `settings:rules`, `settings:terms`, `settings:privacy`, `settings:palette`, `settings:feedback` (position the native `wx.createFeedbackButton` over this rect; pinned row), `settings:deleteAll` (the two confirms are overlay dialogs), `sheet:close`, `sheet:list` (scroll).

## overlay  (`overlay.js`, draw after any screen)
**States:** dialog | toast | adStub
```ts
{ dialog?:{ title?, text, confirmLabel, cancelLabel?, danger? }, toast?:{ text }, adStub?:{ kind:'rewarded'|'interstitial', secondsLeft:number }, display? }
```
Hit ids: `dialog:confirm`, `dialog:cancel`, `adstub:complete`, `adstub:skip`. Toast has no hit areas. Dialog texts used by logic: 放弃这一棒？群友可以接着画 · 离开后你的回合会自动跳过，确定离开？ · 离开这一局？ · 清空画布？ · 现在揭晓？之后就不能再接了 · 删除这一棒 · 删除后，你画的和写的内容将不再展示，正在进行的接龙会让出你的那一棒.

## shareCard  (`shareCard.js`)
**States:** invite | reveal | roomInvite | roomReveal
`render(canvas, vm, {pixelScale?})` sets the canvas to 500 x 400 (5:4) and draws; export with `canvas.toTempFilePath`. Always standard look. **No user drawings, ever.**
```ts
{ kind:'invite', passed:number, length:6 }                                     // 慢慢传: our art + "传画接龙 · 已传 3/6 棒" + dots
{ kind:'reveal', promptText:string, finalText:string, participantCount:number } // 慢慢传: "起点「…」→ 终点「…」 · 6 位群友接力"
{ kind:'roomInvite' }                                                          // "一起传画 · 一局约 3 分钟", "3–10 人", ten seat stickers
{ kind:'roomReveal', chainCount:number, promptText?:string, finalText?:string } // "一局传画 · 5 条接龙" (+ the passed texts of one chain)
```
Share titles and queries (logic, `core/copy.js`): invite `m=<roomId>` (room) / `k=<chainId>`; reveal `m=<roomId>` / `r=<chainId>` (ids only). If rendering fails logic uses the static fallback image from the main package.

## strokes  (`strokes.js`, drawing helper used by draw / describe / roundWait / sent / overview / stepthrough / mine)
See "Strokes display" above. Pure; takes an optional offscreen-canvas factory (`setCanvasFactory`).

---

## Events (what logic does for each hit id)

| Hit id | Logic |
|---|---|
| `home:primary` | rules not agreed -> `rules` sheet (`pendingAction:'createRoom'`); else `createRoom` (or the active room) -> lobby; with live rooms off: 慢慢传 start (-> `pick` mode chain) |
| `home:slow` | 慢慢传: rules sheet if needed (`'start'`), or `startLimit` when the starts are used up; else `pick` (mode chain) |
| `home:activeRoom` / `home:groupLine` | back into the room (lobby / round / overview) / room entry, chain list or 本群接龙 per `groupLine.target` |
| `startLimit:ad` | rewarded video -> `grantReward({kind:'start', noFill})` |
| `roomEntry:join` | rules sheet if needed (`'joinRoom'`), else `joinRoom` -> lobby |
| `lobby:start` / `lobby:invite` / `lobby:back` | `startRoom` / `wx.shareAppMessage` from the tap / confirm then `leaveRoom` |
| `pick:start` | live: submit the selected prompt id (or custom text) for round 0 -> `roundWait`; chain: `createChain({promptId | customText, groupRef?})` -> `draw` 第 1 棒 |
| `pick:reroll` | `rollPrompts` reroll (up to 5 per pick; a stale `rollId` is `BAD_REQUEST` and the screen reloads the current set; the 6th is `REROLL_LIMIT`) |
| `draw:submit` / timer end | `submitRoomStep` / `submitStep` with the strokes `{v:2,h,s}`; at 0 s by server time the turn is force-sent as it is (spec 5.8), `status:'timeUp'` |
| `describe:submit` / timer end | the text, or at 0 s the text when >= 2 valid characters else the empty marker |
| `draw:back`, `describe:back` | confirm ("离开后你的回合会自动跳过" live / "放弃这一棒？群友可以接着画" 慢慢传), then `leaveRoom` / `releaseClaim` |
| `entry:claim` | rules sheet if needed; else `claimStep` -> draw or describe |
| `entry:reveal` | confirm, then `revealNow` |
| `overview:chain:<id>` | open `stepthrough` on that chain at its final step; mark it seen |
| `overview:rematch` / `overview:joinNew` | `rematch` (single new room for everyone who presses it) / join `rematch.newRoomId` |
| `stepthrough:laugh` | `laugh({chainId, step})` |
| `report:submit` | `report({chainId, step, reason})` |
| `sent:share`, `entry:share`, `overview:share`, `stepthrough:share` | `wx.shareAppMessage` from the tap (never automatic) |
| `sent:subscribe`, `entry:subscribe` | `wx.requestSubscribeMessage` from the tap -> `subscribeReveal` |
| `mine:delete:<n>` | confirm, then `deleteMyStep({chainId, step:n})` |
| `settings:palette` | rewarded video -> `grantReward({kind:'palette'})`; the only 今日彩笔 entry |
| `settings:deleteAll` | two confirms, then `deleteMyStep({all:true})` |

## Integration settled

- **Module shape.** `js/render/index.js` exports `{makeLayout, hitTest, bannerRect, screens{home, rules, warning, howto, startLimit, pick, draw, describe, roundWait, lobby, roomEntry, sent, entry, overview, stepthrough, teaser, group, album, mine, report, settings, terms, overlay}, overlay, shareCard, strokes, theme, chrome, drawGeometry, canvasRectFor, describeGeometry}`. `ctl.view(t)` returns `{screen, vm, layers, overlay}`; sheets over a non-home screen (`rules` over roomEntry / entry, `report` over draw / describe / stepthrough / teaser) arrive as `layers: [{screen, vm}]`, drawn after the screen and before the overlay. Home sheets are fields of the home vm (`sheet`, `rules`, `settings`, `warningText`, `chainStart`).
- **Boot.** `app.js` calls `strokes.setCanvasFactory((w, h) => <wx.createCanvas() with width/height set>)` once, right after the screen canvas exists, so finished strokes are cached offscreen.
- **Scrolling.** Logic owns every offset and passes it back, clamped to `hitAreas.scrollMax[id]`: `home:scroll`, `pick:scroll`, `lobby:scroll`, `roomEntry:scroll`, `sent:scroll`, `entry:scroll`, `teaser:scroll`, `overview:scroll`, `group:scroll`, `album:scroll`, `mine:scroll`, `terms:scroll` -> their vm's `scrollY` (reset to 0 when the screen opens); `sheet:list` -> `sheetScroll` on the home vm (howto / rules / warning / settings / startLimit) and on the `report` and `rules` layer vms.
- **Swallow-only ids** (logic ignores them): `draw:block`, `describe:block`, `pick:block`, `dialog:block:card`, `coach:block`, `sheet:body`, `sheet:scrim`, and anything ending in `:block`, `:card`, `:scrim`, `:body`.
- **`coach:next`** covers only the 点一下知道了 corner of the coach line (a full-card hit area would swallow the first stroke of a player who starts at the top of the canvas).
- **Entry.** `entry:home` (首页) is drawn in every state; `entry:share` only for participants; `entry:mine` for participants in `expired`, `pending`, `prevMine` and `capReached`.
- **Native feedback.** `settings:feedback` is a pinned row; logic puts the native `wx.createFeedbackButton` over its rect.
- **Timers**: `timer.secLeft` is computed by logic from server deadlines (offset by the `serverNow` of the last `getRoom`, AC 149); renderers never read the clock.
- **Packaging**: `tests/` and this file are excluded from the upload (`project.config.json` `packOptions.ignore`).

## Spec points settled by render (flag if you disagree)

1. 320 x 568 with 今日彩笔: `h` = 781 by the formula (spec text: 782); the test allows +-1.
2. Step-through taps: the spec has both "tap left/right half = earlier/later" and "tap on the drawing replays". Render resolves it with a 重播 button inside the note and `stepthrough:skip` while a replay runs (see `stepthrough`).
3. Step-through dots fall back to "N/M" text when the 48 pt targets do not fit (a chain of 6 棒 + 起点 does not fit 320 wide); `dots` in the vm is optional.
4. Home tiles: 4 across when each is >= 88 pt, else 2 x 2.
5. The lobby start button is `disabled` (not hidden) for a host with < 3 seats, with the hint and the 慢慢传 link above it.
