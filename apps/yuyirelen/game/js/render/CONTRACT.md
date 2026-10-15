# Render contract (frontend-ui <-> minigame-dev), 语义热冷

Every screen module `js/render/<screen>.js` exports `draw(ctx, vm, layout) -> hitAreas`.

- `vm` is the spec 13 view model, plus the **extra optional fields** listed per screen below. Missing extras fall back to the stated default.
- `layout = makeLayout({windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect})` from `layout.js`. `menuRect` is `wx.getMenuButtonBoundingClientRect()`. Build it again on resize/`onShow`.
- `hitAreas = [{id, x, y, w, h}]` in canvas px. **Later areas win** (`hitTest(hitAreas, x, y)`): concatenate `screen.draw(...)` then `overlay.draw(...)`. Unknown ids (`*:block`, `*:card`, `sheet:body`) only swallow taps; ignore them.
- `hitAreas.scrollMax` = `{<scrollId>: maxOffsetPx}` for scrollable regions. Logic owns the scroll offset and passes it back in the vm. Clamp to `scrollMax`. **Drag rule:** a touch that starts on a scroll id, or on any hit inside that scroll region (`row:<word>`, `archive:item:*`, `settings:*`, `reveal:*` buttons), scrolls the region when it moves more than ~8 px, and is a tap on that hit otherwise. Scroll ids are drawn first so the items inside win plain taps.
- Renderers are pure: no wx, no timers, no state. Animate by passing progress fields and redrawing each frame.
- **Display modes (spec 8.11):** every vm (and the overlay vm) may carry `display: {largeText: boolean, highContrast: boolean}`. `draw` calls `theme.applyDisplay(vm.display)` first; a missing `display` means the default look, so always pass it from the saved settings. Modes apply on the next frame, no restart. The share card ignores them.
- Renderer-owned strings: fixed UI chrome and spec copy (button labels, state explainers, the how-to lines, coach lines, "顺着「x」想：", "先点一个词试试：", "最接近的 100 个词", "你 X 步 · TA Y 步"). Logic supplies everything dynamic and pre-formatted (rank labels, summaries, stats, toasts, banner, hint label).
- Fonts: system only (`theme.js` stacks). Text never goes below 16pt (20pt in 大字模式). Touch targets are >= 48pt (>= 56pt in 大字模式).
- `boardRect(L, vm)` (also `require('./render').boardRect`) is the exact rect the open data canvas must be sized for; `bannerRect(L, vm)` is the banner slot when `vm.bannerVisible`.

## Rows (play ladder) and temperature

```
Row = { word, rank, rankLabel, temp: 0..100, band: 'hit'|'boil'|'scald'|'hot'|'warm'|'cold',
        bandLabel, isHint, isSynonym, isLatest }
```
Band words printed by the renderer next to every bar: 冷 温 热 烫 沸 命中 (`bandLabel` from logic is used when given). `temp` sets the bar fill; `temps[]`/`bands[]` in Reveal, Challenge and the share card use band keys.

## home  (`home.js`)
Extras: `sheet: null|'howto'|'settings'`, `sheetScroll` (px), `display`, `t` (ms clock for the skeleton pulse).
Daily card by `daily.state`: `loading` (skeleton), `available` (开始猜), `inProgress` ("已猜 {steps} 步 · {bestLabel}", 继续猜), `solved` ("今日 {steps} 步猜中", 查看答案 + 再来一题), `gaveup` ("今日未猜中", 查看答案 + 再来一题), `unavailable` (练习一题), `offline`/`error` (重试). The streak line shows when `streak.show`.
Hit ids: `home:daily` (开始猜 / 继续猜 / 查看答案, decide by `daily.state`), `home:retry` (offline/error), `home:practice` (unavailable), `home:again` (再来一题 on solved/gaveup), `home:groupBanner` (when `hasGroupContext`), `home:groupBoard`, `home:friendBoard`, `home:archive`, `home:howto`, `home:sound`, `home:settings`.
Sheets: `sheet:close` (X, outside tap, 知道了), `sheet:list` (scroll area, scrollMax id), and for settings `settings:sound`, `settings:largeText`, `settings:highContrast` (toggle rows), `settings:openSetting` (only drawn when the friend board is off), `settings:privacy`, `settings:feedback` (position the native `wx.createFeedbackButton` over this rect).

## play  (`play.js`)
Extras: `pendingWord` (string; the word being sent, state `waiting`), `ladderScroll` (px), `menuOpen` (boolean; the ⋯ menu), `sheet: null|'howto'` + `sheetScroll`, `flashWord` + `flashT` (0..1, duplicate flash), `enterWord` + `enterT` (0..1, the row sliding into the ladder), `solvedT` (0..1 gold fill, state `solvedAnim`), `errorText` (replaces "网络开小差了"), `display`, `t`.
`hint.state`: `locked` and `exhausted` draw the button disabled (no hit area); `available` and `atBest` register `play:hint`. Hint button, ad button and 输入 are disabled while `state` is `waiting`, `starting` or `solvedAnim`. Chips are drawn disabled (no hit areas) while `waiting`.
Layout: back row, header (title, "已猜 N 步", ⋯ or 收起), optional banner, optional "首字：x", 刚猜 card, chips, ladder, pinned action row. `adHint.visible` adds a "视频提示" row above the action row, clear of 输入 and the free hint. With `keyboard.open` the ladder and action row give way to the suggestion strip and a slim 刚猜 card, drawn above `heightPx` (or in the top 45% when null); the strip shows as many rows as fit.
Hit ids: `play:back`, `play:menu` (⋯), `play:menu:close` (outside tap while open), `play:menu:howto`, `play:menu:giveup` (open the give-up dialog through `overlay`), `play:collapse` (收起, keyboard open), `play:hint`, `play:input`, `play:adHint`, `play:retry` (offline/error), `warm:<word>` (热身词), `chip:<word>` (联想词), `sugg:<word>` (autocomplete suggestion), `row:<word>` (ladder row: select it and show its chips), `ladder:list` (drag area, scrollMax id), `coach:next`, `coach:skip`, plus `sheet:close`/`sheet:list` for the how-to sheet.
Coach marks (`coach` 1..3) never block taps; lines are <= 14 characters.

## reveal  (`reveal.js`)
Extras: `scrollY` (px), `showTheirs` (boolean; expands `compare.theirWords`), `display`, `t`. Optional `compare.theirBands: string[]` (derived from `theirTemps` if missing).
Everything between the back row and the pinned bar scrolls as one column (title, answer >= 40pt, summary, chart, comparison, stats, board link, top-100).
Hit ids: `reveal:back` ("‹ 首页"), `reveal:share`, `reveal:again`, `reveal:board`, `reveal:retryTop` (top list error), `reveal:theirWords` (看 TA 的猜词 / 收起), `reveal:scroll` (drag area, scrollMax id).

## challenge  (`challenge.js`)
Extras: `display`, `t`. The sharer's chart and step count only, no words. No back button (entry screen).
Hit ids: `challenge:accept` (我来猜), `challenge:home`, `challenge:retry`, `challenge:compare` (only when `alreadyFinished`; logic normally routes straight to the comparison).

## board  (`board.js`, group and friend)
Extras: `sharedCanvas` (the canvas from `wx.getOpenDataContext().canvas`, state `ready`), `viewerPlayed` (default true; false shows "未开始" + 去猜), `canShare` (default true), `errorKind: 'list'|'group'` (state `error` copy), `previewFrame` (dev only), `display`, `t`.
`boardRect(L, vm)` is the rect the open data canvas must be sized for (send it as `width`/`height`, plus `dpr` and `display`). The footer line (`vm.footer`), the action button and the banner slot are drawn by this screen.
Hit ids: `board:back`, `board:retry`, `board:goPlay`, `board:share`, `board:contract`, `board:agree`, `board:openSetting`, `board:list` (drag area; forward the offset to the open data domain as `{type:'scroll', offset}`; the open data domain clamps itself, so clamp yours to `[0, rows * rowH]` at most).

## archive  (`archive.js`)
Extras: `scrollY` (px), `display`, `t`. `item.line` is pre-formatted by logic and carries the answer only for finished issues.
Hit ids: `archive:back`, `archive:item:<puzzleId>`, `archive:more` (加载更多, when `hasMore`), `archive:practice` (练习题 card, or 练习 in the empty state), `archive:retry`, `archive:list` (drag area, scrollMax id).

## overlay  (`overlay.js`, draw after any screen)
`vm = {dialog?, toast?, adStub?, privacy?, display?}`.
- `dialog: {title?, text, confirmLabel, cancelLabel?, danger?}` -> `dialog:confirm`, `dialog:cancel` (the give-up dialog: confirmLabel 放弃并看答案, cancelLabel 再想想, danger true; the safe 再想想 carries the primary look)
- `toast: {text}` (no hit areas; logic removes it after ~2s; drawn just above the pinned action row)
- `adStub: {kind:'rewarded'|'interstitial', secondsLeft}` -> `adstub:complete`, `adstub:skip`
- `privacy: {}` (own dialog if `onNeedPrivacyAuthorization` is used) -> `privacy:agree`, `privacy:refuse`, `privacy:contract`

## shareCard  (`shareCard.js`)
`render(canvas, vm, {pixelScale?})` sets the canvas to 500x400 (times `pixelScale`) and draws; `draw(ctx, vm)` draws into a 500x400 area. Then export with `canvas.toTempFilePath`.
```
vm = { title,      // "语义热冷 · 今日一词 第128期" | "语义热冷 · 往期 第97期" | "语义热冷 · 练习 #12"
       headline,   // "21 步猜中" | "未猜中 · 最近第 3 名"
       subline,    // "用了 1 次提示" | "没有用提示" | ""
       temps: number[],   // per step, in order; > 60 steps are bucketed to 60 columns (highest temp per column)
       bands: string[],   // per step band key (derived from temps when missing)
       footer }    // "同一个词，你几步能猜中？"
```
Spoiler-free: it draws only these four strings and the fixed axis labels 冷 / 命中; it never reads a word field (a test poisons the vm to prove it). Default palette in every display mode. `columns(vm)` exposes the bucketing.

## open data domain  (`opendata/`)
Set `"openDataContext": "opendata"` in game.json. Receives `{type:'render', kind:'group'|'friend', dateKey, issueNo, shareTicket?, groupid?, salt, selfHash, mode:'full'|'group'|'selfOnly', rows, showUnverified, othersPlaying?, width, height, dpr?, display?}` and `{type:'scroll', offset}`.
`rows` are the `getBoard` rows `[h, st, n, hi, b, s, k?]` (st 1 solved, 2 playing, 3 gave up; n steps; hi hints; b best rank; s seconds; k streak >= 2). It reads rows with `getGroupCloudStorage` (`groupid` if present, else `shareTicket`) or `getFriendCloudStorage` (key `d_<dateKey>`), hashes `openid|salt` (first 12 hex of SHA-256) and orders by the SERVER values only; the KV marker `{s,h,st}` is used only to show an unmatched member as 未验证 (or 好友自报 in `selfOnly`). Sections: solved (rank numbers; steps asc, hints asc, finish time asc), 正在猜 ("已猜 N 步", "最近第 N 名", no number), 未猜中, 未验证. `othersPlaying > 0` adds "另有 N 人正在猜" (fallback when WeChat withholds openids). The viewer's row is pinned at the bottom when scrolled off. No row ever contains a word. Read failures and empty lists are drawn inside its canvas.

## Packaging note
`tools/` (preview, node_modules) and `tests/` must be excluded from the uploaded package (`packOptions.ignore` in the project config, owned by minigame-dev).
