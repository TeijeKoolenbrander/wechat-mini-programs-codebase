# Hooks for frontend-ui (render contract)

frontend-ui owns `js/render/**`, `opendata/**` and `tools/preview/**`. minigame-dev owns everything else, including this
file. The renderer is pure: it receives a view model, draws it and returns hit areas. It never formats a number, calls
`wx`, holds state or starts a timer. `js/stub-render.js` is a working reference (boxes and labels) that emits every hit id
below; the real renderer replaces it by providing `js/render/index.js` (see `js/renderers.js`).

```
render/index.js exports
  makeLayout(info)                         info = {windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect}
  screens[<screen>].draw(ctx, vm, layout)  -> hitAreas   (screen = home | play | result | challenge | board | history | issue)
  overlay.draw(ctx, overlayVm, layout)     -> hitAreas
  hitTest(hitAreas, x, y)                  -> id | null  (optional; later areas win)
  shareCard.render(canvas, cardVm, {pixelScale})   sets the canvas to 500x400 x pixelScale (saved image uses 2) and draws
```

- `hitAreas = [{id, x, y, w, h}]`, **later areas win**. Concatenate `screen.draw` then `overlay.draw`. Unknown ids (`*:block`) only swallow taps.
- `hitAreas.scrollMax = {<scrollId>: maxOffsetPx}`. Logic owns the offsets and passes them back in the vm (`scrollY`).
- Layout: `layout` must expose at least `W, H, x0, contentW, bottomEdge, navBottom, board:{x,y,w,h}, dpr, s`. Nothing tappable in the capsule row.
- `vm.display = {largeText, highContrast, scale, palette}` is on every screen vm: apply 大字模式 and 高对比度 from it (spec 6.19). They never change the share card.

## Strings and formatting

All strings are pre-formatted in `js/vm.js`: labels, `valueText` ("6,300", "约6,300", "公元前221"), `unitText`, `sourceText`
("来源：水利部 · 2013"), prompt, verdict, banners, comments. `valueText` already contains the 约 prefix for approximate
values. A face with `valueText: null` is a hidden card: draw "？" + the unit. The renderer owns only fixed chrome (button
names such as 返回, 分享, 提交). **Never write the banned vocabulary** (`core/forbidden.js`; `tests/forbidden.test.js` scans `js/render/**` too).

`CardFace = {factId, label, subLabel, icon, accent, valueText|null, unitText, approx, sourceText|null, canReport}`.
`icon` is a key drawn in code: city, province, mountain, river, lake, year, animal, planet, bridge, tower, food, distance.
`accent` is the category colour (never the only carrier of meaning). `canReport` = show the 数据有误？ link (after the reveal only).

## Screens, extras and hit ids

Sheets are part of the screen vm: `vm.sheet` (kind or null) and `vm.sheetVm` (its model). Draw the sheet over the screen; its hit
areas replace the screen's. `sheet:close` closes the top sheet (scrim, X, 知道了 all emit it).

### home
vm = spec 10 Home plus `daily.themeLabel`, `daily.resultText` / `subline` (done), `daily.dayStreak.text`, `free.resumeText`, `sheet`, `sheetVm`, `display`, `t`.
`daily.state`: loading | available | inProgress | done | error | offline. Hit ids: `home:daily` (开始 / 继续 / 查看结果), `home:retry` (error, offline),
`home:free`, `home:freeResume` (only when `free.resumeText`), `home:category`, `home:groupBoard`, `home:groupBanner`, `home:friendBoard`,
`home:history`, `home:howto`, `home:sound`, `home:settings`.
Sheets on home: `howto` (`sheetVm.lines`), `settings`, `sources` (opened from settings), `category`.
- settings ids: `settings:sound`, `settings:largeText`, `settings:highContrast`, `settings:sources`, `settings:openSetting` (only when `!friendBoardEnabled`), `settings:privacy`, `settings:feedback` (position the native feedback button over this rect).
- category ids: `category:<key>` (`all`, `city`, `geo`, `era`, `animal`, `space`, `build`, `food`, `dist`); `sheetVm = {selected, options:[{key,label,factCount}]}`.

### play
vm = spec 10 Play plus `headerText`, `verdictText` ('对' / '错', shown with the colour), `revealT` (0..1 count-up progress while `phase === 'revealing'`),
`netError: {text, retryLabel}|null`, `loadingText`, `measureKey`, `muted`, `sheet`, `sheetVm`, `t`. `top`/`bottom` are CardFaces (`bottom.valueText` is null until the reveal;
during `revealing` it holds the final value: count up to it with `revealT`). `phase`: loading | awaitAnswer | sending | revealing | correct | miss | segmentChange | cleared | netError.
`miss`: shake the card (no flashing), keep both values visible. `segmentBanner` shows during `segmentChange`. `challenge.passedText` is an inline line, no sound, no pop-up.
Hit ids: `back`, `answer:hi`, `answer:lo` (drawn disabled when `buttons.*.enabled` is false; ≥ 56 pt tall, ≥ 16 pt apart, thumb zone), `play:cards`
(the card viewport: a tap skips the count-up or the pause, a drag scrolls when large text does not fit a small screen; `scrollMax["play:cards"]`), `play:retry` (when `netError`), `coach:skip`
(the one-time bubble when `coachMark`), `source:top`, `source:bottom`, `report:top`, `report:bottom` (only when that face's `canReport`).
Sheets on play: `continue` (再答一次, `sheetVm = {visible, missText, adState, canOffer}`; ids `continue:video`, `continue:result`; ≥ 24 pt gap), `source`, `report`.

### result
vm = spec 10 Result plus `streakText`, `commentText`, `clearedText`, `friendlyText`, `finalizedNote`, `miss.titleText`, `challenge.compareText`, `boardLabel`, `againLabel`,
`questions[].choiceLabel`, `sheet`, `sheetVm`, `scrollY`. `status`: done | finalizing | pendingNetwork (draw "正在记分…" / "网络不太好" + `result:retry`).
Hit ids: `result:back`, `result:share`, `result:challenge`, `result:save`, `result:questions`, `result:board`, `result:again`, `result:retry`,
`result:subscribe` (only when `subscribe.state === 'offer'`), `source:miss:top|bottom`, `report:miss:top|bottom`; scroll id `result:scroll`.
Sheets: `questions` (本局题目: rows `q:<k>` → ids `report:q:<k>:top|bottom`, `source:q:<k>:top|bottom`; scroll id `sheet:list`), `source`, `report`, `albumDenied`
(`sheetVm = {text, openLabel, cancelLabel}`, id `save:openSetting`).

### report sheet (`sheet: 'report'`)
`sheetVm = {factId, title, card, summaryText, reasons:[{key,label,selected}], state, alreadyReported, submitLabel, canSubmit}`.
Exactly six fixed chips and **no text input**. Ids: `report:reason:<key>` (toggle), `report:submit` (disabled until `canSubmit`), `report:cancel`.

### source sheet (`sheet: 'source'`)
`sheetVm = {label, valueText, unitText, subLabel, year, publisher, sourceTitle, url, retrievedAt, sourceText, canReport}`. URL is plain text (no link, no clipboard). Id `source:report`.

### challenge (entry)
vm = spec 10 Challenge plus `titleText`, `ownerText`, `issueText`, `rulesText`, `ownText`, `myStreak`, `subscribe`, `t`. `status`: loading | ready | expired | own | answered | retired | offline | error.
Hit ids: `challenge:accept` (ready), `challenge:home`, `challenge:retry`, `challenge:free`, `challenge:daily`, `challenge:compare` (answered), `challenge:subscribe` (own, `subscribe.state === 'offer'`). No back button.

### board
vm = spec 10 Boards plus `titleText`, `display`. Same hit ids as 点将台: `board:back`, `board:retry`, `board:goPlay`, `board:share`, `board:contract`, `board:agree`, `board:openSetting`,
`board:list` (drag area, scroll id). `layout.board` is the rect the open data canvas is sized for. Banner: when `banner.show`, leave `banner.reservedHeight` free at the bottom
(the ad itself is native, created by `js/ads.js`).

### history / issue
history: `{state, headerText, items:[{dateKey, issueNo, dateText, themeLabel, mineText, isToday, statusText}], emptyText, errorText}`; ids `history:back`, `history:retry`, `history:item:<dateKey>`; scroll `history:list`.
issue: `{state, titleText, mineText, stats:{totalText, buckets:[{label, shareText}]}|null, deck:[{k, top, bottom, answerLabel, mine}]|null, deckLockedText, errata, sheet, sheetVm}`; ids `issue:back`, `issue:retry`,
`report:issue:<k>:top|bottom`, `source:issue:<k>:top|bottom`; scroll `issue:scroll`.

### overlay
`overlay = {dialog?, toast?, adStub?}`: `dialog = {text, confirmLabel, cancelLabel?, danger?}` -> `dialog:confirm`, `dialog:cancel`; `toast = {text}` (no hit areas); `adStub = {kind, secondsLeft}`
(QA only) -> `adstub:complete`, `adstub:skip`.

## Share card (`shareCard.render`)
```
daily: {mode:'daily', streak, marks:boolean[] (one per answered question, false = the miss), cleared, rarityText|null, titleText, taglineText}   NO fact names or values
free:  {mode:'free', streak, marks, cleared, rarityText|null, titleText, taglineText, pair:{bottomLabel, topLabel, subLabel}|null}              the missed pair's labels, NO values
```
On any render failure the game falls back to `assets/share-fallback.png` (ship it in the main package).

## Open data domain message (main -> `opendata/`)
`{type:'render', kind:'group'|'friend', dateKey, issueNo, contentVersion, salt, selfHash, mode:'full'|'group'|'selfOnly', rows:[[h, n, s, k?]], showUnverified, width, height, dpr, shareTicket?|groupid?}`
and `{type:'scroll', offset}`. `h` = first 12 hex of sha256(openid|salt); `n` = server 连对; `s` = end time in seconds after 00:00 BJT; `k` = day streak when >= 2.
Rank by `n` descending; **equal `n` share one rank number**; within a tie the smaller `s` is listed first; unmatched rows are "未验证" with no rank. The KV key read is `d_<dateKey>` with value `{"n":14}`.

## Audio and haptics
Cues: `assets/sounds/turn.mp3`, `ok.mp3`, `miss.mp3` (short, calm, no casino-style sounds). Muting silences all of them and the miss vibration.

## Reconciliation with the real renderer (js/renderers.js)

`js/render/CONTRACT.md` names tap areas after the module that draws them; this file names them after what the controller does. `js/renderers.js` is the only place that knows both: it renames ids, draws the open sheet over the screen, and rebuilds the layout when `vm.display` changes. `tests/integration.test.js` checks every id the real renderer emits against the list below and that tapping it changes something.

Renames (render id -> controller id): `play:back` -> `back`, `play:hi|lo` -> `answer:hi|lo`, `play:sourceTop|Bottom` -> `source:top|bottom`, `play:reportTop|Bottom` -> `report:top|bottom`, `result:top|bottom:source|report` -> `source|report:miss:top|bottom`, `questions:<k>:top|bottom:source|report` -> `source|report:q:<k>:top|bottom`, `issue:<k>:top|bottom:source|report` -> `source|report:issue:<k>:top|bottom`, `picker:<key>` -> `category:<key>`, `rewarded:watch|skip` -> `continue:video|result`, `sources:back` -> `sheet:close`, `sources:scroll` -> `sheet:list`. The 相册 sheet (`albumDenied`) is drawn as a dialog: `dialog:confirm` -> `save:openSetting`, `dialog:cancel` -> `sheet:close`.

View-model additions made at the boundary: `vm.sheetScroll` (sheet scroll offset, every screen), `vm.scrollY` (home, play only after a drag, challenge, history, issue, result), `turn`/`count` derived from `revealT` while revealing, `sheetVm.card` and `yearText` on the source sheet, `sheetVm.questions` on 本局题目, `dateText` on the issue, `issueNo`/`themeLabel` on the daily share card, `pair` -> `hook` on the free share card. `themeLabel` is empty in v1 (no weekday themes): headers drop the dangling " · ".

Scroll ids (drag): `home:scroll`, `play:cards`, `result:scroll`, `challenge:scroll`, `history:scroll`, `issue:scroll`, `sheet:list`, `board:list`.

### All hit ids (checked by tests/integration.test.js)

Screens: `home:daily`, `home:retry`, `home:free`, `home:freeResume`, `home:category`, `home:groupBoard`, `home:groupBanner`, `home:friendBoard`, `home:history`, `home:howto`, `home:sound`, `home:settings`, `home:scroll`;
`back`, `answer:hi`, `answer:lo`, `play:cards`, `play:retry`, `coach:skip`, `source:top`, `source:bottom`, `report:top`, `report:bottom`;
`result:back`, `result:share`, `result:challenge`, `result:save`, `result:questions`, `result:board`, `result:again`, `result:retry`, `result:subscribe`, `result:scroll`, `source:miss:top`, `source:miss:bottom`, `report:miss:top`, `report:miss:bottom`;
`challenge:accept`, `challenge:home`, `challenge:retry`, `challenge:free`, `challenge:daily`, `challenge:compare`, `challenge:subscribe`, `challenge:scroll`;
`board:back`, `board:retry`, `board:goPlay`, `board:share`, `board:contract`, `board:agree`, `board:openSetting`, `board:list`;
`history:back`, `history:retry`, `history:item:<dateKey>`, `history:scroll`;
`issue:back`, `issue:retry`, `issue:scroll`, `source:issue:<k>:top`, `source:issue:<k>:bottom`, `report:issue:<k>:top`, `report:issue:<k>:bottom`.
Sheets: `sheet:close`, `sheet:list`, `sheet:body` (swallows taps), `settings:sound`, `settings:largeText`, `settings:highContrast`, `settings:sources`, `settings:openSetting`, `settings:privacy`, `settings:feedback`, `category:<key>`, `continue:video`, `continue:result`, `source:report`, `report:reason:<key>`, `report:submit`, `report:cancel`, `source:q:<k>:top`, `source:q:<k>:bottom`, `report:q:<k>:top`, `report:q:<k>:bottom`, `save:openSetting`.
Overlays: `dialog:confirm`, `dialog:cancel`, `dialog:block`, `adstub:complete`, `adstub:skip`, `adstub:block`, `privacy:agree`, `privacy:refuse`, `privacy:contract`, `privacy:block` (the privacy overlay is drawn by the platform prompt flow in js/privacy.js; the renderer module exists but the controller does not pass `overlay.privacy`).
Swallow-only ids (`*:block`, `*:card`, `sheet:body`) are ignored by the controller.
