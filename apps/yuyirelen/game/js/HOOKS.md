# Logic <-> render hooks (minigame-dev -> frontend-ui)

The renderer contract is the same shape as 点将台: `js/render/index.js` exports
`{ makeLayout(info), screens: {home, play, reveal, challenge, board, archive}, overlay, hitTest?, shareCard }`.
`screens[name].draw(ctx, vm, layout) -> hitAreas` (`[{id,x,y,w,h}]`, later areas win, `hitAreas.scrollMax = {scrollId: maxPx}`).
`overlay.draw(ctx, overlayVm, layout) -> hitAreas`. `shareCard.render(canvas, cardVm, {pixelScale})`.
A missing screen falls back to `js/stub-render.js` for that screen only (`js/renderers.js`).
View models are exactly spec 13 (`docs/yuyirelen/spec.md`) plus the additive extras below. All strings are pre-formatted in `js/vm.js`.
Every vm also has `display: {largeText, highContrast}` and `t` (ms clock for pulses).

## home
Extras: `daily.title`, `daily.sub`, `daily.primary {id,label,disabled}`, `daily.secondary {id,label}|null`, `daily.footnote`, `streak.label`, `groupLine`, `sheet: null|'howto'|'settings'`, `howto {lines[3], note, picture[3]}`.
Hit ids: `home:daily` (also `daily.primary.id`: `home:daily` | `home:retry` | `home:practice`), `home:next` (secondary 再来一题), `home:groupBanner`, `home:groupBoard`, `home:friendBoard`, `home:archive`, `home:howto`, `home:sound`, `home:settings`, `sheet:close`.
Settings sheet: `settings:sound`, `settings:largeText`, `settings:highContrast`, `settings:openSetting` (only when `settings.friendBoardEnabled` is false), `settings:privacy`, `settings:feedback` (the rect hosts the native `wx.createFeedbackButton`, positioned by main.js).

## play
Extras: `stepsLabel` ("已猜 12 步"), `firstCharLabel` ("首字：番"|null), `chipsTitle` ("顺着「火锅」想："), `latest.pending` (true while waiting: show the word with a pulsing bar, no rank), `flashWord` (flash that ladder row), `pendingError` ("网络开小差了"|null, state `offline`), `ladderScroll`, `sheet: null|'menu'|'howto'`, `menu {items:[{id,label}]}`, `howto`, `toast` (a copy of the overlay toast: draw ONE of them), `adHint.busy`.
`state`: `starting|ready|waiting|result|offline|error|solvedAnim` (`solvedAnim`: 1.2 s gold 命中 animation, then the controller switches to reveal). `hint.state`: `locked|available|exhausted|atBest`.
Layout notes: with `keyboard.open`, draw the suggestion strip and the 刚猜 card above the keyboard using `keyboard.heightPx`; if it is null assume the keyboard covers the bottom 50% and use the top 45%.
Hit ids: `back`, `menu:open`, `menu:giveup`, `menu:howto`, `sheet:close`, `warmup:<i>` (0-5, only when `warmups` is non-empty), `chip:<i>` (0-4), `row:<i>` (index into `ladder`), `play:ladder` (drag area, scrollMax id; put it UNDER the row hit areas), `key:open` (输入), `key:close` (收起), `sugg:<i>` (0-5), `hint:use`, `hint:ad` (▶ 视频提示, only when `adHint.visible`), `play:retry` (offline/error), `coach:next`, `coach:skip`.
Rules: do not emit `hint:use` while `hint.state` is `locked`/`exhausted`; emit it for `available` and `atBest` (the controller shows "已经只差一步了"). 放弃 appears only in the ⋯ menu. Coach marks never block other hits; `coach` 1/2/3 maps to the three marks in spec 8.2.

## reveal
Extras: `answerLabel` ("答案" on give up, else ""), `top.errorText`, `top.hidden` (future: "列表维护中"), `compare.line` ("你 18 步 · TA 21 步"), `compare.theirWords` (only when allowed: show 看 TA 的猜词), `nextEnabled`, `sheet: null|'theirWords'`, `scrollY`, `privacyNote`.
Hit ids: `reveal:back`, `reveal:share`, `reveal:board`, `reveal:next`, `reveal:retryList`, `reveal:theirWords`, `sheet:close`, `reveal:scroll` (drag area, scrollMax id).
The share button exists only here (after finishing).

## challenge (card entry)
Extras: `headline`, `sub`, `note`, `ownLine`, `primaryLabel`, `secondaryLabel`. States: `loading|ready|notFound|own|offline`.
Hit ids: `challenge:accept` (ready and own), `challenge:home`, `challenge:retry`.

## board
Extras: `explainer` (noGroup), `canShareToGroup`, `viewerPlayed`, `sharedCanvas`, `myLine` (denied states). States: `noGroup|checkingGroup|loading|ready|empty|error|privacyDenied|scopeDenied`.
`layout.board = {x,y,w,h}` is the rect the open data canvas is sized for. `bannerVisible` is true only in `ready`/`empty` with the banner configured: `layout.banner = {left, top, width}` (optional) positions it, keep a >= 24 pt gap.
Hit ids: `board:back`, `board:retry`, `board:goPlay`, `board:share`, `board:contract`, `board:agree`, `board:openSetting`, `board:list` (drag area; the controller forwards the offset).
Open data message (`opendata/` reads it): `{type:'render', kind:'group'|'friend', dateKey, issueNo, salt, selfHash, mode, rows:[[h, st, n, hi, b, s, k?]], width, height, dpr, shareTicket?|groupid?}`; `st` 1 solved, 2 playing, 3 gave up; `n` steps; `hi` hints; `b` best rank; `s` seconds after 00:00 BJT; `k` streak when >= 2. Then `{type:'scroll', offset}`. Rows carry no words.

## archive
Extras: `bestStreakLabel`, `items[].title` ("第127期 10月14日"), `items[].line`, `practice.line`, `practice.cta`, `emptyText`, `errorText`, `loadingMore`, `scrollY`.
Hit ids: `archive:back`, `archive:retry`, `archive:item:<i>`, `archive:more`, `archive:practice`, `archive:scroll` (drag area).
`state: empty` still lists today's row and the practice row under `emptyText`.

## overlay
`{dialog?: {text, confirmLabel, cancelLabel, danger}, toast?: {text}, adStub?: {kind, secondsLeft}}`. Hit ids `dialog:confirm`, `dialog:cancel`, `adstub:complete` (only at `secondsLeft` 0), `adstub:skip`.

## share card
`share.cardRenderer(cardVm) -> Promise<tempFilePath>` is set from `shareCard.render` (500x400). `cardVm = {title, headline, subline, temps[], bands[], footer}` from `core/card.js`: at most 60 columns, height = temperature, colour = band. It never contains a word; draw only these fields.

## Native pieces driven by the controller
Keyboard (`js/keyboard.js`): the renderer only draws the strip; typing, confirm and clear are native. Audio cues: `tap`, `chime`. Haptics: `wx.vibrateShort` on a solve.
