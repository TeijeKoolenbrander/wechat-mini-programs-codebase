# Render contract (frontend-ui <-> minigame-dev)

Every screen module `js/render/<screen>.js` and sheet module exports `draw(ctx, vm, layout) -> hitAreas`. The view models are `docs/bibiyi/spec.md` section 10; the **extra optional fields** are listed per screen below. Missing extras fall back to the stated default. All strings are pre-formatted by logic (`core/format.js`); the renderer only owns fixed UI chrome (button labels, state explainers, `对/错`, `连对`, `第 N 题`).

- `layout = makeLayout({windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect, display})`. `menuRect` is `wx.getMenuButtonBoundingClientRect()`; `display = {largeText, highContrast}` (spec 10 `Display`; `scale:1.25` / `palette:'highContrast'` are also read). **Rebuild the layout on resize, onShow and whenever the display setting changes.** Every `draw()` applies the display mode itself (theme is rewritten in place), so no other call is needed.
- `hitAreas = [{id, x, y, w, h}]` in canvas px. **Later areas win** (`hitTest(hitAreas, x, y)`; `mergeHits(a, b, ...)` concatenates and merges `scrollMax`): concatenate `screen.draw(...)`, then any sheet, then `overlay.draw(...)`. Ids ending `:block`, `:card`, `sheet:body` only swallow taps; ignore them.
- `hitAreas.scrollMax = {<scrollId>: maxOffsetPx}`. Logic owns the scroll offset (drag on the scroll id) and passes it back in `vm.scrollY` (screens) or `vm.sheetScroll` (sheets). Clamp to `scrollMax`.
- Renderers are pure: no wx, no timers, no state. Animate by passing progress fields and redrawing every frame.
- Fonts: system only (`theme.js` stacks). Text never goes below 16pt (20pt in large text).
- **Sheets** (`sheets.*`) draw only their scrim and panel: draw the screen they open over first. `sheet:close` (outside tap, X, 知道了) and `sheet:list` (scroll area) are shared ids.

## play  (`play.js`)
Spec vm plus extras (all optional): `t` (ms clock: shimmer, skeleton), `turn` 0..1 (bottom card flip, phase `revealing`, default 1), `count` 0..1 (value count-up, default 1; the renderer re-formats `bottom.valueText` itself, digits only), `slide` 0..1 (phase `correct`: bottom card slides up to become the top card), `next` (CardFace of the next hidden bottom card, fades in at the end of `slide`), `shake` 0..1 (phase `miss`, a short horizontal shake), `streakPulse` 0..1 (a small bump of the 连对 chip when it increments), `stampT` 0..1 (phase `cleared`), `scrollY`.
Card values: the top card shows `valueText`; the bottom card shows `？` until `turn >= 0.5` in `revealing`, and always in `awaitAnswer`/`sending`/`loading`. `CardFace.approx` draws a small 约 before the value unless `valueText` already starts with 约. `canReport` only after that card's value is revealed.
Phases: `loading` `awaitAnswer` `sending` `revealing` `correct` `miss` `segmentChange` `cleared` `netError`. Answer buttons are tappable only in `awaitAnswer` with `buttons.x.enabled`. The chosen button shows pressed (`sending`/`revealing`), teal (`correct`) or vermilion (`miss`). The verdict pill (`✓ 对` / `✗ 错`, icon plus text) hangs on the bottom card's top edge.
Hit ids: `play:back`, `play:hi`, `play:lo`, `play:cards` (the whole card viewport: **tap = skip the animation / continue** while revealing; **drag = scroll** when `scrollMax['play:cards'] > 0`, which happens with large text on small screens; the renderer scrolls to the bottom card by itself unless `scrollY` is given), `play:retry` (netError), `play:reportTop`, `play:reportBottom`, `play:sourceTop`, `play:sourceBottom` (open the source sheet), `coach:skip` (the one-time coach bubble, `coachMark`).

## home  (`home.js`)
Extras: `t`, `scrollY` (only when large text overflows), `bannerText` (default 来自群聊 · 查看本群今日排行).
Hit ids: `home:daily` (开始 / 继续 / 查看结果, decide by `daily.state`), `home:retry` (error/offline), `home:free`, `home:freeResume` (only when `free.resumeText`), `home:category`, `home:groupBoard`, `home:friendBoard`, `home:history`, `home:howto`, `home:sound`, `home:settings`, `home:groupBanner`, `home:scroll`.

## result  (`result.js`)
Extras: `scrollY`, `t`, `stampT`, `boardLabel` (default 看群榜/好友榜), `streakCount` 0..1 (count-up of the big number; omit for static).
`status` `finalizing` shows skeleton + 正在记分…; `pendingNetwork`/`error` show a notice and 重试 instead of 再来一局. `streakText` with （含再答一次） is shown as a note under the number. `miss` shows the missed fact first with `✗ 错` and `chosenLabel`.
Hit ids: `result:back`, `result:retry`, `result:again`, `result:share`, `result:challenge`, `result:save`, `result:questions`, `result:board`, `result:subscribe`, `result:bottom:report`, `result:bottom:source`, `result:top:report`, `result:top:source` (the missed fact is `bottom`), `result:scroll`.

## sheets
- `sheets.howto` (玩法): extras `sheetScroll`. Ids: `sheet:close`, `sheet:list`.
- `sheets.settings`: vm Settings `{muted, largeText, highContrast, privacy, friendScope, album}` + `sheetScroll`. Ids: `settings:sound`, `settings:largeText`, `settings:highContrast`, `settings:sources`, `settings:privacy`, `settings:openSetting` (only when `friendScope !== 'granted'`), `settings:feedback` (position the native `wx.createFeedbackButton` over this rect).
- `sheets.picker`: `{selected, options:[{key, label, factCount}]}`, key `all` for 全部. Ids: `picker:<key>`.
- `sheets.report`: spec Report vm + `sheetScroll`. Ids: `report:reason:<key>`, `report:submit` (drawn disabled until a chip is selected, and while sending/sent), `report:cancel`.
- `sheets.source` (tap a source line): `{card, publisher, sourceTitle, yearText, url, retrievedAt, note?, canReport?}`. Ids: `source:report`.
- `sheets.rewarded` (再答一次): spec sheet vm; draws nothing unless `visible && canOffer`. Ids: `rewarded:watch` (ad button, loading/playing disable it), `rewarded:skip` (看结果). `sheet:close` = dismiss, treat like 看结果.
- `sheets.questions` (本局题目): `{questions:[{k, top, bottom, correct}]}`. Ids: `questions:<k>:top:report`, `questions:<k>:bottom:report`, `questions:<k>:top:source`, `questions:<k>:bottom:source`.

## challenge  (`challenge.js`)
Extras: `pastDaily: boolean` ("往期题目 · 友谊赛"), `t`, `scrollY`. No back button (entry screen).
Ids: `challenge:accept`, `challenge:home`, `challenge:retry`, `challenge:free`, `challenge:daily`, `challenge:compare`, `challenge:subscribe`, `challenge:scroll`.

## board  (`board.js`, group and friend)
Extras: `sharedCanvas` (from `wx.getOpenDataContext().canvas`, state `ready`), `viewerPlayed` (default true; false shows 你今天还没参加 + 去答题), `t`. **Size the open data canvas with `board.rect(layout, vm)`** (it leaves room for `banner.reservedHeight`); send it as `width`/`height` plus `dpr`, `largeText`, `highContrast`.
Ids: `board:back`, `board:retry`, `board:goPlay`, `board:share`, `board:contract`, `board:agree`, `board:openSetting`, `board:list` (drag area; forward the offset to the open data domain as `{type:'scroll', offset}`; clamp to `[0, serverRows * 66 * layout.s]`).

## history / issue / sources
- `history.js`: spec History list vm + `scrollY`, `t`. Ids: `history:back`, `history:retry`, `history:item:<dateKey>`, `history:scroll`.
- `issue.js`: spec Issue detail vm + `dateText` ('10月14日'), `scrollY`, `t`. Rows come from `deck` (`answerLabel`, `mine`). Ids: `issue:back`, `issue:retry`, `issue:<k>:top:report`, `issue:<k>:bottom:report`, `issue:<k>:top:source`, `issue:<k>:bottom:source`, `issue:scroll`.
- `sources.js` (数据来源 page): `{sources:[{publisher, attribution, url}], scrollY}`. Ids: `sources:back`, `sources:scroll`.

## overlay  (`overlay.js`, draw last)
`vm = {dialog?, toast?, adStub?, privacy?}`.
- `dialog: {title?, text, confirmLabel, cancelLabel?, danger?}` -> `dialog:confirm`, `dialog:cancel`
- `toast: {text}` (no hit areas; logic removes it)
- `adStub: {kind:'rewarded'|'interstitial', secondsLeft}` -> `adstub:complete`, `adstub:skip`
- `privacy: {}` -> `privacy:agree`, `privacy:refuse`, `privacy:contract`

## shareCard  (`shareCard.js`)
`render(canvas, vm, {pixelScale?, saved?})` sets the canvas to 500x400 (times `pixelScale`) and draws; `draw(ctx, vm, opts)` draws into a 500x400 area. For 保存图片 use `pixelScale: 2, saved: true` (adds 微信小游戏 · 比一比). Never affected by large-text / high-contrast.
```
vm = { mode:'daily'|'free'|'challenge',
       issueNo?, themeLabel?,            // daily / challenge
       streak, cleared?,                  // cleared = 全部答对 stamp
       marks: boolean[],                  // one per answered question (max 60), true = correct
       rarityText?: string|null,          // only at >= 30 results
       hook?: {topLabel, bottomLabel, subLabel}, // free: the missed pair, labels only, NO values
       ownerStreak? }                     // challenge: "你能超过 N 吗？"
```
Daily and challenge cards never contain any fact label or value.

## open data domain  (`opendata/`)
Message `{type:'render', kind, dateKey, issueNo, shareTicket?, groupid?, salt, selfHash, mode, rows:[[h,n,s,k?]...], showUnverified, viewerPlayed?, width, height, dpr?, largeText?, highContrast?}` and `{type:'scroll', offset}`. Set `"openDataContext": "opendata"` in game.json. Marker key `d_<YYYYMMDD>` = `{"n":14}`. Ranks come from the server rows only; **equal `n` share one rank number (1,2,2,4)**, earlier `s` first within a tie; unmatched rows are 未验证 (好友自报 in selfOnly) without a rank number below all ranked rows.

## Icons
`CardFace.icon` is any category key (`city geo era animal space build food dist`) or measure key (`city_pop prov_pop mountain river lake year animal_weight animal_life space_diameter structure_len structure_height food_kcal distance`); each maps to a code-drawn icon (`icons.js`), unknown keys fall back to a diamond. `CardFace.accent` is one of `theme.ACCENTS` (it is darkened automatically for contrast).

## Packaging note
`tools/` (preview, node_modules, out) and `tests/` must be excluded from the uploaded package (`packOptions.ignore` in the project config, owned by minigame-dev).
