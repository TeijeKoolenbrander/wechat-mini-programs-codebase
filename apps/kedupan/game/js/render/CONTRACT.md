# Render contract (frontend-ui <-> minigame-dev)

Every screen module `js/render/<screen>.js` exports `draw(ctx, vm, layout) -> hitAreas`.

- `vm` is the spec section 10 view model (field names exactly as in the spec), plus the **extra optional fields** listed per screen below. Missing extras fall back to the stated default. Every `vm` (and the overlay `vm`) carries `display: {largeText, highContrast, scale, palette}`; renderers call `applyDisplay(vm.display)` first, so both display modes work on every screen with no other wiring. Share cards ignore it (always the standard look).
- `layout = makeLayout({windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect})` from `layout.js`. `menuRect` is `wx.getMenuButtonBoundingClientRect()`. Build it again on resize/`onShow`.
- `hitAreas = [{id, x, y, w, h}]` in canvas px. **Later areas win** (`hitTest(hitAreas, x, y)`): concatenate `screen.draw(...)` then `overlay.draw(...)`. Ids ending `:block`, `:card`, `sheet:body`, `coach:block` only swallow taps; ignore them.
- Extra properties on the returned array (copy them when you concatenate): `scrollMax` = `{<scrollId>: maxOffsetPx}`, `ruler` = `{x0, x1, y, h}` (the track, for `posFromX`), `board` = `{x, y, w, h, rowH, footH}` (the open data window), `banner` = `{x, y, w, h}` (rect for the native banner ad).
- Scrolling: logic owns the offset. Drag on the scroll id, pass the offset back as `vm.scrollY` (sheets: `vm.sheetScroll`), clamp to `scrollMax`. Every screen with a `<screen>:scroll` id scrolls when its content does not fit (320x568, large text). Content is bottom-anchored in the thumb zone when it does fit.
- Renderers are pure: no wx, no timers, no state. Animate by passing progress fields and redrawing each frame (`t` ms clock, `revealT`, `textT`, `confettiT` 0..1).
- Renderer-owned strings: fixed chrome and spec copy (button labels, sheet copy, state explainers, 玩法 text, 各有想法/灵魂同频 gauge ends). Logic supplies everything dynamic and pre-formatted.
- Fonts: system only. Text never goes below 16pt; spec sizes are met by `theme.js` (`prompt` 30/36, `score` 42/50, button height 52/58, ruler band 64/84 standard/large).

## The ruler (play, round)
Touch: a single finger on hit id `ruler` (a full-width band, >= 64 tall, >= 80 in large text). While it is down, map every `touchmove` x (even outside the band) with `posFromX(hitAreas.ruler, x)` to an integer 0-100 and pass it back as `vm.needle`, with `vm.dragging = true` (the pointer lifts). `nudge:left` / `nudge:right` move one step; the renderer only emits them while the needle can move that way.
No numbers are ever drawn. Markers: `you` is a tangerine triangle above the tape, `nation` a teal diamond (lane 1), `group` a plum dot (lane 2), `member` a hollow plum circle, `target` a vermilion bar, `late` a dashed circle.

## home  (`home.js`)
Extras: `sheet: null|'howto'|'settings'`, `settings: {muted, largeText, highContrast, privacy, friendScope}` (for the settings sheet), `sheetScroll`, `scrollY`, `t`.
Hit ids: `home:daily` (开始 / 继续 / 看结果 by `daily.state`), `home:retry` (pendingSubmit, error, offline, unavailable), `home:host`, `home:archive`, `home:group`, `home:friend`, `home:howto`, `home:sound`, `home:settings`, `home:groupBanner`, `home:scroll`.
Sheets: `sheet:close` (X, outside tap, 知道了), `sheet:list` (scroll), `settings:sound`, `settings:largeText`, `settings:highContrast`, `settings:openSetting` (only when `friendScope !== 'granted'`), `settings:privacy`, `settings:feedback` (position the native `wx.createFeedbackButton` over this rect).

## play  (`play.js`: daily, archive, bonus cards)
Extras: `issueNo`, `title` (overrides the header title), `scrollY`, `sheet: null|'report'`, `coach: boolean` (first-ever card), `notice: string|null` (e.g. 网络不稳，答案还没送达, phase `pending`), `dragging`, `revealT` (0..1 slide of the ◆ and ●), `textT` (0..1 fade of the label and score), `confettiT` (0..1, only when `reveal.bullseye`), `t`.
`phase: 'submitting'` draws the button as 提交中… (the vm's `primaryLabel` is used otherwise). The reveal lines are drawn from `reveal.label/scoreText/nationText/agreeText/groupText`.
Hit ids: `back`, `ruler`, `nudge:left`, `nudge:right`, `play:primary` (就这儿 / 下一张 / 看结果 / 重试 by `phase`; drawn disabled until `canConfirm`), `play:report`, `play:scroll`, `coach:dismiss`, `coach:block`.
Report sheet: `report:inappropriate`, `report:ambiguous`, `report:typo`, `sheet:close` (取消).

## result  (`result.js`, day result)
Extras: `scrollY`, `sheet: null|'distribution'`, `sheetScroll`, `t`. `distribution.hist` is `5 x 21` bins, drawn with your `rows[i].you` marked.
Hit ids: `back` (‹ 首页), `result:share`, `result:group`, `result:friend` (this row is pinned at the bottom), `result:bonus` (加一题; ad button, disabled while loading or when `bonus.left` is 0), `result:dist` (全国分布; ad button until `distribution.unlocked`, then a normal button that opens the sheet), `result:host`, `result:archive`, `result:scroll`, `sheet:close`, `sheet:list`.

## host  (`host.js`, create round)
Extras: `left`, `right` (the chosen spectrum, steps `pickClue` and `sharing`), `clueSwapLeft: 0|1` (default 1), `adState: 'idle'|'loading'|'playing'|'error'` (the 换一批 ad), `scrollY`, `t`.
Hit ids: `back`, `host:spectrum:<i>` (i = 0..2), `host:swapFree`, `host:swapAd`, `host:mode:preset`, `host:mode:chat`, `host:clue:<itemId>`, `host:clueSwap`, `host:share` (disabled until `canShare`), `host:retry`, `host:home`, `host:scroll`.

## round  (`round.js`: guess, waiting, host view, reveal)
Extras: `needle`, `canConfirm`, `submitting`, `dragging`, `hostTarget: number|null` (host view only, drawn as the tangerine band +-2), `revealing: boolean` (host tapped 揭晓), `namesState: 'ok'|'unauthorized'|'privacyDenied'` (reveal list), `boardRows` (server rows, for the window height), `sharedCanvas`, `revealT`, `scrollY`, `t`.
Status screens: `loading`, `open`, `submitted` (needle = `myGuess`, shows the subscribe card), `revealedUnplayed`, `hostWaiting`, `revealed`, `expired` (with `reveal`: reveal only; without: 已过期), `noGuesses` (host vs guest copy by `isHost`), `notFound`, `offline`.
`late: true` on `open` shows the 先猜再看 banner (the guess does not count).
Hit ids: `back`, `ruler`, `nudge:left`, `nudge:right`, `round:confirm`, `round:home`, `round:retry`, `round:reveal`, `round:reshare`, `round:late`, `round:view`, `round:daily`, `round:host`, `round:share`, `round:subscribe` (提醒我; only drawn for `subscribe.state` offer/requesting), `round:openSetting`, `round:contract`, `round:agree`, `board:list`, `round:scroll`.

## group  (`group.js`) and friend  (`friend.js`)
Extras: `mq: number|null` (numeric 群默契度 for the gauge), `boardRows` (server rows, 1..n; the window shows at most 5), `sharedCanvas` (from `wx.getOpenDataContext().canvas`), `scrollY`, `t`, `banner: {show, reservedHeight}`.
`hitAreas.board` is the rect the open data canvas must be sized for. Post the open data message with `width = board.w`, `height = board.h`, `rowH = board.rowH`, `footH = board.footH`, `fontScale = layout.s * (largeText ? 1.2 : 1)`, `dpr`. `board:list` is the drag area; forward the offset as `{type:'scroll', offset}`, clamped to `[0, serverRows * board.rowH]`.
In `privacyDenied` and `unauthorized` the board is still drawn (anonymous rows); pass `sharedCanvas` as usual. Friend `selfOnly` adds `selfText` as the explainer.
Group hit ids: `back`, `group:share`, `group:play`, `group:retry`, `group:contract`, `group:agree`, `group:openSetting`, `group:round:<roundId>`, `board:list`, `group:scroll`.
Friend hit ids: `back`, `friend:play`, `friend:retry`, `friend:contract`, `friend:agree`, `friend:openSetting`, `board:list`, `friend:scroll`.

## archive  (`archive.js`, list)
Extras: `banner: {show, reservedHeight}`, `scrollY`, `t`. State `offline`/`error` with `items` shows the cached page with an 离线 tag; without items it shows the retry notice.
Hit ids: `back`, `archive:item:<dateKey>`, `archive:more`, `archive:retry`, `archive:scroll`.

## review  (`review.js`, archive day)
`kind: 'review'` (read-only review of a day played as the daily) or `'play'` (end of an archive practice set).
Extras (all optional): `rows` (same shape as the day result rows: your needle and the final ◆ per card), `totalText`, `bandLabel`, `percentileText`, `divisiveText`, `endText` (e.g. 往期练习 380 · 不计入排行), `distribution: {unlocked, adState, hist?}`, `sheet: null|'distribution'`, `sheetScroll`, `scrollY`, `t`.
Hit ids: `review:list` (返回列表, also the header back), `review:next` (再来一期), `review:dist`, `review:retry`, `review:scroll`, `sheet:close`, `sheet:list`.

## overlay  (`overlay.js`, draw after any screen)
`vm = {display?, dialog?, toast?, adStub?, privacy?}`.
- `dialog: {title?, text, confirmLabel, cancelLabel?, danger?}` -> `dialog:confirm`, `dialog:cancel`
- `toast: {text}` (no hit areas; logic removes it)
- `adStub: {kind:'rewarded'|'interstitial', secondsLeft}` -> `adstub:complete`, `adstub:skip`
- `privacy: {}` (own dialog if `onNeedPrivacyAuthorization` is used) -> `privacy:agree`, `privacy:refuse`, `privacy:contract`

## shareCard  (`shareCard.js`)
`render(canvas, vm, {pixelScale?})` sets the canvas to 500x400 (times `pixelScale`) and draws; `draw(ctx, vm)` draws into a 500x400 area. Then export with `canvas.toTempFilePath`.
```
vm.type = 'daily':  { issueNo, totalText, bandLabel, rows:[{prompt, left, right, label}] x5 }   // no positions, ever
vm.type = 'round':  { left, right, clueText|null }                                                // empty ruler, no target
vm.type = 'reveal': { left, right, target, guesses:number[], mqText, countText }                  // unnamed dots
vm.type = 'group':  { mqText|null }                                                               // null: 本群今日刻度
```

## open data domain  (`opendata/`)
Message `{type:'render', view:'group'|'friend'|'round', shareTicket?, groupid?, salt, selfHash, viewerDone, rows, refs?, target?, mode?, width, height, palette, scale, dpr?, rowH, footH, fontScale}`; additions to the spec: `target` (round: the revealed target, to print 差 N 格), `mode` (friend: `'full'|'selfOnly'`), `rowH`, `footH`, `fontScale` (from `hitAreas.board`).
Row shapes: group `[h, gs, ns, t, pos?, k?]`, friend `[h, ns, t, pos?, k?]`, round `[h, g, s, late, isHost]`. Then `{type:'scroll', offset}`.
Reads the `kd` key (`{d, s}`) with `getGroupCloudStorage` (group page, or a round with a ticket/groupid) or `getFriendCloudStorage`. If reading fails or the scope is refused it still draws the server rows anonymously (群友 A/B/C, 你, 出题人). Set `"openDataContext": "opendata"` in game.json.

## Packaging note
`tools/` (preview, node_modules) and `tests/` must be excluded from the uploaded package (`packOptions.ignore` in the project config, owned by minigame-dev).
