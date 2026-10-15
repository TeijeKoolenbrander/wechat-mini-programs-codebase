# Render contract (frontend-ui <-> minigame-dev)

Every screen module `js/render/<screen>.js` exports `draw(ctx, vm, layout) -> hitAreas`. Source of truth for the view models is `docs/chuanhua/spec.md` section 12; this file lists what the renderers add.

- `vm` is the spec 12 model plus the **extra optional fields** listed per screen. A missing extra falls back to the stated default. A missing spec field never shows content: moderation-sensitive fields default to hidden (see "Moderation and privacy").
- `layout = makeLayout({windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect})` from `layout.js`. `menuRect` is `wx.getMenuButtonBoundingClientRect()`. Rebuild on resize and `onShow`.
- `hitAreas = [{id, x, y, w, h}]` in canvas px. **Later areas win** (`hitTest(hitAreas, x, y)`): concatenate `screen.draw(...)` then `overlay.draw(...)`. Unknown ids (`*:block`, `*:card`, `sheet:body`, `sheet:close` on the scrim) only swallow taps.
- `hitAreas.scrollMax` = `{<scrollId>: maxOffsetPx}`. Logic owns the scroll offset (drag on the scroll body) and passes it back as `vm.scrollY`. Clamp to `scrollMax`. Scroll ids: `scroll` (default body), `reveal:scroll`, `sheet:scroll`.
- `hitAreas.layoutInfo` = `{top, bottom, footerTop, contentH}` (debug and tests).
- Renderers are pure: no wx, no timers, no randomness, no state. They call `theme.applyDisplay(vm.display)` first, so a frame never depends on the last one. Animate by passing progress fields and redrawing every frame.
- Renderer-owned strings: fixed UI chrome and spec copy (button labels, section titles, state fallbacks such as 审核中, 该内容已被举报隐藏). Logic supplies everything dynamic and pre-formatted (spec 12).
- Fonts: system only. Text is never below 16 pt in standard mode and 18 pt in large-text mode.
- Tap targets are at least 48 x 48 (60 high buttons in large-text mode).

## Display modes (all screens)
`vm.display = {largeText, highContrast}` (the logic copies it from settings into every vm and into the overlay vm). Large text: body 20, small 18, buttons 60 high, content scrolls instead of clipping. High contrast: white background, black text, darker fills, thicker outlines, 7:1 text. Share cards ignore the modes.

## Shared extras on every screen
`display`, `sheet` (`null|'rules'|'strike'|'howto'|'report'`, see Sheets), `scrollY` (px), `keyboardH` (px of the native keyboard, picker and describe), `t` (ms clock: skeleton pulse, caret blink).

## Strokes
Rendered by `strokes.js` from the spec 5.3 format `{v:1, s:[[c, w, x0, y0, dx1, dy1, ...]]}` (c = colour index 0-11, w = brush index 0-2, first point absolute, then integer deltas; widths 8/18/36 grid units on a 1024 grid). Malformed strokes are skipped. `strokes.draw(ctx, strokes, {x,y,w}, {progress, bg, border, radius})` draws a square drawing; `progress` 0..1 replays it. The live draw canvas shows `vm.strokes`, so logic should include the stroke currently being drawn in `vm.strokes.s` (and count it in `pointsUsed`).

## home  (`home.js`)
Extras: `sheet` (when omitted: `showRulesWarning` opens `strike`, else `showHowToOnce` opens `howto`).
The primary shows `start.label` and `start.sublabel`, disabled unless `state === 'ready' && start.enabled`. A second button `看视频再开一条 (剩 N)` appears when `state === 'ready' && start.freeLeft === 0 && start.adLeft > 0`. `groupLine.show` draws the tappable group strip. `restriction.text` and `ugcPausedText` draw notice cards. `album.unseenReveals > 0` adds a dot and the line `N 条揭晓` on 我的接龙.
Hit ids: `home:start`, `home:adStart`, `home:retry`, `home:groupLine`, `home:album`, `home:group`, `home:howto`, `home:settings`.

## picker  (`picker.js`)
Extras: `drawSec` (default 60, label `开始画 (60 秒)`).
A `今日` chip is drawn only when the list mixes daily and other prompts. With `custom.open` the footer button becomes 确定 (`picker:customOk`, disabled unless `canStart`) with 取消.
Hit ids: `back`, `picker:select:<id>`, `picker:shuffle`, `picker:custom`, `picker:customInput` (tap to focus the keyboard), `picker:customOk`, `picker:customCancel`, `picker:start`, `picker:retry` (states error/offline).

## draw  (`draw.js`)
Extras: `coach` (bool: first-ever draw turn; shows the coach line on the canvas), `t`.
Layout: 放弃 (`back`) and the timer share the capsule row; strip with the title, 举报 (only when `canReport`) and the previous 棒 or prompt; square canvas; colours; sizes + 撤销 + 清空; 画好了.
**Canvas rect:** the hit area `draw:canvas` is the drawing rect. Map a touch with `grid = (touch - rect.xy) * 1024 / rect.w`. Only start a stroke when the touch begins on `draw:canvas` (it is only emitted while `status === 'drawing'`). The array also carries `hits.canvasRect`.
Palette: `palette[].locked` swatches are not drawn. The 今日彩笔 button is drawn on the empty canvas only when `paletteAd.show` (states idle/loading/playing/error).
Status: `submitting` (lock + 正在传出…), `error` (`errorText` + 重试), `timeUp` (modal 时间到，这一棒交给别人吧 with 好); `pointsUsed >= pointsMax` shows 画得太细啦，先交吧.
Hit ids: `back`, `draw:canvas`, `draw:color:<idx>`, `draw:size:<0|1|2>`, `draw:undo`, `draw:clear`, `draw:submit`, `draw:paletteAd`, `draw:report`, `draw:retry`, `draw:timeUpOk`, `draw:lock` (swallows taps while locked).
放弃 and 清空 confirms use `overlay.dialog`.

## describe  (`describe.js`)
Extras: `keyboardH` (px, default 0; the drawing shrinks, below 72 px it is hidden), `focused` (default true), `placeholder` (default 你觉得这画的是什么？), `t`.
Status copy is renderer-owned: `blocked` 这句话没通过审核，换个说法吧; `busy` 审核服务繁忙，请稍后再试; `error` uses `errorText` and the button reads 重试; `submitting` shows 审核中…; `timeUp` modal.
Hit ids: `back`, `describe:input`, `describe:submit`, `describe:report`, `describe:timeUpOk`, `describe:lock`. `hits.drawingRect` is the drawing rect.

## sent  (`sent.js`)  (已传出)
`modState` missing or unknown is treated as `pending` (fail closed). The share button shows only for `pending` and `passed`; `blocked`/`void` show 再开一条 as the primary. `revealed` makes 看揭晓 the primary. `mine` is the author's own content (the only content this screen draws). `subscribe.state`: `offer`/`requesting` draw the button, `granted` a status line, `unavailable` 提醒未开启.
Hit ids: `back` (首页), `sent:share`, `sent:reveal`, `sent:subscribe`, `sent:group`, `sent:again`.

## entry  (`entry.js`)
Extras: `claimBusy` (接这一棒 tap in flight), `timerSecText` (e.g. 限时 45 秒).
Never draws a prompt or any 棒 content; it reads only counts, kinds and pre-formatted lines. `headline` and `subline` default per `state`.
Hit ids: `back` (首页), `entry:claim`, `entry:group`, `entry:revealNow`, `entry:new`, `entry:refresh`, `entry:subscribe`, `entry:share`, `entry:reveal`, `entry:teaser`, `entry:mine`, `entry:sameAgain`, `entry:home`, `entry:retry`.
`entry:claim` is drawn disabled (no hit area) for `restricted`/`ugcPaused`, and enabled for `rulesRequired` (logic opens the rules sheet).

## reveal  (`reveal.js`)
Extras: `replay: {n, progress}` (replay of one drawing after a tap on it), `teaser: {promptText, finalText, passed, canSameAgain}` (data for `notParticipant`; `steps` is never read for that state), `autoplay.progress` (0..1, panel progress).
Autoplay: `autoplay.playing` shows only panels up to `autoplay.panel` (0 = prompt, k = k-th playable step; placeholders are skipped), follows the newest panel, draws the footer disabled and makes the whole body the tap target `reveal:skip`. `reveal.timeline(vm.steps, elapsedMs) -> {panel, progress, done, total}` converts a clock into these fields: prompt 0.8 s, each drawing 2.5 s whatever its length, each sentence 0.6 s, 0.4 s between panels (about 15 s for 6 棒). `reveal.totalMs(steps)` is the full length. When not playing the full strip is shown (set `playing:false`; use `replay` for single replays).
Content is drawn only for `state === 'ready'` and steps with `placeholder == null` and their own strokes/text; everything else is a placeholder (`reported` 该内容已被举报隐藏, `deleted` 作者已删除这一棒, `paused` 内容维护中, missing 内容暂不可见).
Hit ids: `back`, `reveal:skip`, `reveal:drawing:<n>` (replay one), `reveal:laugh:<n>`, `reveal:report:<n>` (only when `canReport`), `reveal:share`, `reveal:sameAgain`, `reveal:replayAll`, `reveal:retry`.
Scroll id `reveal:scroll`.

## teaser  (`teaser.js`)
Extras: none beyond the shared ones. Draws only `promptText`, `finalText` (missing -> 终点暂不可见) and `passed`.
Hit ids: `back`, `teaser:sameAgain`, `teaser:group`, `teaser:report`, `teaser:retry`.

## group  (`group.js`)  (本群接龙)
`banner.reservedHeight` is pinned above the footer with a 24 pt gap each side; `banner:slot` is where logic places the native banner (shown only for `ready`/`empty`).
Hit ids: `back`, `group:start`, `group:retry`, `group:chain:<chainId>` (waiting and in-progress rows), `group:reveal:<chainId>` (participant), `group:teaser:<chainId>`, `banner:slot`.

## album  (`album.js`)  (我的接龙)
Extras: `offlineNote` (bool, cached list shown read-only; `state: 'offline'` with items does the same).
Hit ids: `back`, `album:item:<chainId>`, `album:more` (when `cursor` is set), `album:start`, `album:retry`, `banner:slot`.

## detail  (`album.drawDetail`, screen key `detail`)
vm = `{chainId, mine:[{n, kind, strokes?, text?, modState, canDelete}], display, sheet}`. Only the viewer's own 棒.
Hit ids: `back`, `detail:delete:<n>`.

## settings  (`settings.js`)
Extras: `subscribeStatusText`, `version`. `display` defaults to `{largeText, highContrast}` from the vm. `deleteAll.state` `confirm1`/`confirm2` draws its own confirm dialog (ids `dialog:confirm`, `dialog:cancel`); `deleting`, `done`, `error` show a status line.
Hit ids: `back`, `settings:sound`, `settings:largeText`, `settings:highContrast`, `settings:palette`, `settings:rules`, `settings:terms`, `settings:privacy`, `settings:feedback` (position `wx.createFeedbackButton` over this rect), `settings:deleteAll`, `settings:deleteRetry`.

## Sheets  (`sheets.js`, drawn last by every screen)
`vm.sheet`: `'rules'` (接龙公约 with 先看看 / 同意并开始; data `vm.rules`), `'strike'` (one-time strike warning, `vm.warningText` optional), `'howto'` (玩法), `'report'` (`vm.report = {target, reason, state}`; `reason` is the selected key, `state` idle/submitting/done/limit/dup/error). `vm.sheetScroll` scrolls long sheets.
Hit ids: `sheet:close` (scrim and X), `sheet:body`, `sheet:scroll`, `rules:agree`, `rules:later`, `rules:terms`, `rules:privacy`, `strike:ok`, `howto:ok`, `report:reason:<key>` (keys `porn|politics|abuse|ad|other`), `report:submit`, `report:cancel`.

## overlay  (`overlay.js`, draw after any screen)
`vm = {dialog?, toast?, adStub?, display?}`.
- `dialog: {title?, text, confirmLabel, cancelLabel?, danger?}` -> `dialog:confirm`, `dialog:cancel`, `dialog:block`
- `toast: {text}` (no hit areas; logic removes it)
- `adStub: {kind:'rewarded'|'interstitial', secondsLeft}` -> `adstub:complete`, `adstub:skip`, `adstub:block`

## shareCard  (`shareCard.js`)
`render(canvas, vm, {pixelScale?})` sets the canvas to 500x400 (times `pixelScale`) and draws; `draw(ctx, vm)` draws into a 500x400 area. Export with `canvas.toTempFilePath`. Always the standard look.
```
vm = { kind: 'invite',   passed, total? }                        // 传画接龙 · 已传 3/6 棒 + dots. No prompt, drawing or sentence.
vm = { kind: 'reveal',   promptText, finalText, passed, people } // 起点「…」 终点「…」 · N 位群友接力. Only these two passed texts.
vm = { kind: 'fallback' }                                         // static art, no text from the chain
```
Any other field in the vm is ignored (tests feed hostile vms).

## Moderation and privacy (design rules the tests enforce)
1. `entry` never draws chain content. `teaser` and `reveal` with `notParticipant` draw only prompt, final sentence and count.
2. `reveal` draws a step's content only if `state === 'ready'`, `placeholder == null` and the step carries its own strokes or text; a step with a placeholder never draws its content even if the vm still carries it; a step missing both draws 内容暂不可见.
3. `paused`, `loading`, `offline` and `error` reveal states draw no chain content at all.
4. `sent` treats a missing `modState` as `pending` and hides sharing for `blocked`/`void`.
5. Share cards never contain drawings and the invite card contains no chain text.

## Packaging note
`tools/` (preview, node_modules) and `tests/` must be excluded from the uploaded package (`packOptions.ignore` in the project config, owned by minigame-dev).
