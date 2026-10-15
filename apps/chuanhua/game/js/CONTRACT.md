# Render contract (frontend-ui <-> minigame-dev), 传画接龙

The view models are exactly the shapes of spec section 12 (`docs/chuanhua/spec.md`), built by `js/vm.js` (pure, unit-testable). Fields marked `extra` below are additions the renderers may use; everything is pre-formatted, renderers own only fixed chrome and button labels. `js/stub-render.js` is a complete reference implementation that emits every hit id.

## Module shape (`js/render/index.js`, frontend-ui)

```js
module.exports = {
  makeLayout(info),                         // info = { windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect }
  screens: { home, picker, draw, describe, sent, entry, reveal, teaser, group, album, detail, settings }, // each { draw(ctx, vm, layout) -> hitAreas }
  overlay: { draw(ctx, overlayVm, layout) -> hitAreas },
  hitTest?(hits, x, y), shareCard?: { render(canvas, cardVm, {pixelScale}) },
};
```
`ctl.view(now)` returns `{ screen, vm, overlay, display: {largeText, highContrast}, muted }`. `hitAreas = [{id,x,y,w,h}]` in canvas px, later areas win; `hitAreas.scrollMax = {<scrollId>: maxPx}` for scroll regions (the controller keeps offsets in `ui.scroll[id]`, none of the current screens need one). Renderers are pure: no wx, no timers, no state. Nothing in the capsule row; primary buttons in the bottom 40%; targets >= 48 pt; text >= 16 pt.

## Drawing area

The draw screen MUST return a hit `draw:canvas` = the square canvas rect (any size, must be square). `main.js` hands finger events that start inside it to the drawing tool (never to `onHit`), so no other hit may sit over it while `vm.status === 'drawing'`. Draw `vm.strokes` (`{v:1,s:[[c,w,x0,y0,dx,dy,...]]}`, includes the stroke in progress) with `CONFIG.palette[c]` and `CONFIG.brushSizes[w]` scaled grid -> px; `js/drawing.js#smoothPath(points)` gives the quadratic display smoothing. The server rasterises with the same geometry (`core/raster.js`).

## Hit ids per screen

- **home**: `home:start` (disabled look when `!vm.start.enabled`), `home:adStart` (only when `vm.start.adLabel`), `home:retry`, `home:album`, `home:group` (the groupLine and the 本群接龙 button), `home:howto`, `home:settings`
- **picker**: `back`, `picker:prompt:<id>`, `picker:batch`, `picker:custom`, `picker:customInput`, `picker:start`, `picker:retry`. `startLabel` extra.
- **draw**: `back` (放弃), `draw:canvas`, `draw:color:<idx>` (only unlocked swatches), `draw:size:<0-2>`, `draw:undo`, `draw:clear`, `draw:done`, `draw:retry` (status error), `draw:report` (only if `canReport`), `draw:paletteAd` (only if `paletteAd.show`). Extras: `sourceLabel`, `notice` (point limit), `coach` (first-ever turn, 3 s), `brushNames`, `brushSizes`, `palette[].name`.
- **describe**: `back`, `describe:input` (tap the text box to reopen the keyboard), `describe:submit`, `describe:report`. Extras: `placeholder`, `shake`. The keyboard itself is the platform's; draw `vm.text` and `vm.count`.
- **sent**: `back` (首页), `sent:share`, `sent:subscribe` (only `subscribe.state === 'offer'`), `sent:group`, `sent:again`. Extras `title`, `explainerText`, `canShare`.
- **entry**: `entry:claim`, `entry:reveal` (revealedParticipant), `entry:revealNow`, `entry:share`, `entry:subscribe`, `entry:mine`, `entry:same`, `entry:others`, `entry:new`, `entry:retry`, `entry:home`, `back`. Show buttons from the extras `primary`, `canRevealNow`, `canShare`, `subscribe.state`, `canSeeMine`, `canSameAgain`, `showOthers`, `showNew`, `retry`. It never shows chain content.
- **reveal**: `back`, `reveal:retry`, `reveal:skip` (a full-screen area while `autoplay.playing`), `reveal:replay`, `reveal:panel:<n>` (a drawing, replays alone), `reveal:laugh:<n>`, `reveal:report:<n>` (only if `steps[i].canReport`), `reveal:share`, `reveal:same` (only if `canSameAgain`). Animation: `vm.play[i] = {shown, progress 0..1}` per step (drawing: replay fraction, use `vm.drawingAt(strokes, progress)`-style truncation by point count; sentence: typed fraction), `vm.timeline` (prompt 0.8 s, drawing 2.5 s, sentence 0.6 s, gap 0.4 s), `steps[i].placeholderText`, `steps[i].label`, `messageText`.
- **teaser**: `back`, `teaser:same`, `teaser:others`, `teaser:report`, `teaser:retry`, `teaser:home`.
- **group**: `back`, `group:chain:<chainId>`, `group:reveal:<chainId>`, `group:new`, `group:retry`. Extras `explainer`, `emptyText`, `errorText`; `banner.reservedHeight` (>= 24 pt gap) when `banner.show`.
- **album**: `back`, `album:item:<chainId>`, `album:more`, `album:retry`. Extras `emptyText`, `staleNote`, `banner`.
- **detail** (own 棒 of an open/expired chain): `back`, `detail:delete:<n>` (only `canDelete`), `detail:retry`, `detail:same`. `vm.state` is added to the spec shape.
- **settings**: `back`, `settings:sound`, `settings:large`, `settings:contrast`, `settings:palette` (only if `canUnlockPalette`), `settings:rules`, `settings:agreement`, `settings:privacy`, `settings:feedback` (position the native `wx.createFeedbackButton` over this rect; `main.js` does it), `settings:delete`.

## Overlay (draw after any screen)

`overlay = { dialog?, toast?, adStub?, sheet? }`
- `dialog: {text, confirmLabel, cancelLabel?, danger}` -> `dialog:confirm`, `dialog:cancel`
- `toast: {text}` (no hit areas)
- `adStub: {kind, secondsLeft}` -> `adstub:complete`, `adstub:skip`
- `sheet: {kind, vm}`:
  - `rules` (接龙公约, spec 8.2): `vm = {version, open, pendingAction, lines[]}`; ids `rules:agree` (同意并开始), `rules:later` (先看看), `rules:privacy` (《用户隐私保护指引》), `rules:agreement` (《用户协议》). No pre-ticked box.
  - `howto` (玩法, spec 8.14): `vm = {lines[], footer}`; id `sheet:close`.
  - `warn` (one-time strike warning on home): `vm = {text, lines[]}`; id `sheet:ack`.
  - `report` (spec 8.12): `vm = {open, target, reasons[], reasonLabels, selected, state, message}`; ids `report:reason:<porn|politics|abuse|ad|other>`, `report:submit`, `report:cancel`.
  Unknown ids (`*:block`) only swallow taps.

## Share cards (`shareCard.render(canvas, cardVm)`, 500 x 400)

Never contains a user drawing (PO-24). `cardVm = { kind:'invite', passed, length:6, nextStep, nextKind }` (no prompt, no text, no drawing: our illustration, "传画接龙 · 已传 3/6 棒", progress dots) or `{ kind:'reveal', promptText, finalText, passed, participantCount }` (the two passed texts only: 起点「…」→ 终点「…」 · N 位群友接力). Static fallback image: `assets/share-fallback.png`.

## Display modes

`view.display = {largeText, highContrast}` and `view.muted` apply to every screen (copied from 点将台). Sound cues are best effort: `audio.play('tick'|'stamp'|'done')` loads `assets/sounds/<name>.mp3` and stays silent if missing.
