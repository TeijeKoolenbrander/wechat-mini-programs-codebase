# Render contract (frontend-ui <-> minigame-dev)

Every screen module `js/render/<screen>.js` exports `draw(ctx, vm, layout) -> hitAreas`.

- `vm` is the spec 13 view model, plus the **extra optional fields** listed per screen below. Missing extras fall back to the stated default.
- `layout = makeLayout({windowWidth, windowHeight, pixelRatio, statusBarHeight, safeArea, menuRect})` from `layout.js`. `menuRect` is `wx.getMenuButtonBoundingClientRect()`. Build it again on resize/`onShow`.
- `hitAreas = [{id, x, y, w, h}]` in canvas px. **Later areas win** (`hitTest(hitAreas, x, y)`): concatenate `screen.draw(...)` then `overlay.draw(...)`. Unknown ids (`*:block`, `*:card`, `sheet:body`, `sheet:scrim`, `coach:block`) only swallow taps; ignore them.
- `hitAreas.scrollMax` = `{<scrollId>: maxOffsetPx}` for scrollable regions. Logic owns the scroll offset (drag on the scroll id) and passes it back in the vm. Clamp to `scrollMax`.
- Renderers are pure: no wx, no timers, no state. Animate by passing progress fields and redrawing each frame.
- Renderer-owned strings: fixed UI chrome and spec copy (button labels, state explainers, `适任/可用/错位`, `甲/乙/丙`, slot labels, `十胜二负` from `{w,l}`). Logic supplies everything dynamic and pre-formatted.
- Fonts: system only (`theme.js` stacks). Text never goes below 16pt (`layout.u()` scales up on larger screens).

## home  (`home.js`)
Extras: `sheet: null|'howto'|'settings'`, `t` (ms clock for the skeleton pulse).
Hit ids: `home:daily` (出征 / 继续出征 / 查看战报, decide by `daily.state`), `home:retry` (pendingSubmit/error/offline), `home:free`, `home:groupBoard`, `home:friendBoard`, `home:howto`, `home:sound`, `home:settings`, `home:groupBanner`.
Sheets: `sheet:close` (X, outside tap, 知道了), and for settings `settings:sound`, `settings:openSetting` (only drawn when friend board is off), `settings:privacy`, `settings:feedback` (position the native `wx.createFeedbackButton` over this rect).

## draft  (`draft.js`)
Extras: `poolScroll` (px, default 0), `flip` (0..1 token flip, default 0 in awaitFlip else 1), `notice` (string|null, e.g. 此路无将，重新翻令), `coach` (0 none, 1 翻令, 2 选将, 3 放入位置), `t`.
The primary button is tappable only in `awaitFlip`, `placed`, `readyToMarch`; it is drawn disabled in `flipped`/`selecting`.
Re-spin button rules (renderer): `free>0` -> `换势力 ×1` (`respin:<dim>`); `free==0` in free mode with `adAllowed && adLeft>0` -> `视频再换 ×N` (`respinAd:<dim>`, loading/playing states from `adState`); otherwise disabled `已用`. `free>0 && !enabled` -> disabled (hint 此令无可换).
Hit ids: `back`, `primary`, `undo`, `respin:faction`, `respin:era`, `respinAd:faction`, `respinAd:era`, `pool:<generalId>`, `pool:list` (drag area, scrollMax id), `sheet:close` (deselect), `slot:<slot>`, `coach:next`, `coach:skip`.
Confirm-back and ad toast/stub use `overlay`.

## result  (`result.js`)
Extras: `revealCount` (0..12 fractional; integer part = rows shown, fraction fades in the newest; only read when `status:'revealing'`), `stampT` (0..1 slam of the 12-0 seal, default 1), `scrollY` (verdict scroll), `sheet: null|'breakdown'|'replay'`, `sheetScroll`, `privacyNote: boolean`, `boardLabel` (default 看群榜/好友榜), `t`.
Format notes: `battles[].chanceText` and `luckText` are shown as given (include the words, e.g. `胜算八成`, `天时平`); `morale.lord/cohesion` numbers are shown with 2 decimals; `replay.best.lineup[].slot` uses the slot keys.
Hit ids: `result:back`, `result:skip` (whole area while revealing), `result:retry` (pendingSubmit/error), `result:again`, `result:share`, `result:challenge`, `result:replay`, `result:board`, `result:breakdown`, `sheet:close`, `sheet:list` (scroll area inside the breakdown sheet).
scrollMax ids: `result:scroll` (done view), `sheet:list`.

## challenge  (`challenge.js`)
Extras: `bestRecord: {w,l}` (status `own`), `t`.
Hit ids: `challenge:accept`, `challenge:home`, `challenge:retry`, `challenge:free`, `challenge:daily`, `challenge:compare`. No back button (entry screen).

## board  (`board.js`, group and friend)
Extras: `sharedCanvas` (the canvas from `wx.getOpenDataContext().canvas`, state `ready`), `t`.
`layout.board = {x,y,w,h}` is the rect the open data canvas must be sized for (send it as `width`/`height`, plus `dpr`).
Hit ids: `board:back`, `board:retry`, `board:goPlay`, `board:share`, `board:contract`, `board:agree`, `board:openSetting`, `board:list` (drag area; forward the offset to the open data domain as `{type:'scroll', offset}`).
The open data domain clamps scroll itself, and it cannot tell the main domain the true range, so clamp your offset to `[0, serverRows * 66 * layout.s]` at most.

## overlay  (`overlay.js`, draw after any screen)
`vm = {dialog?, toast?, adStub?, privacy?}`.
- `dialog: {title?, text, confirmLabel, cancelLabel?, danger?}` -> `dialog:confirm`, `dialog:cancel`
- `toast: {text}` (no hit areas; logic removes it)
- `adStub: {kind:'rewarded'|'interstitial', secondsLeft}` -> `adstub:complete`, `adstub:skip`
- `privacy: {}` (own dialog if `onNeedPrivacyAuthorization` is used) -> `privacy:agree`, `privacy:refuse`, `privacy:contract`

## shareCard  (`shareCard.js`)
`render(canvas, vm, {pixelScale?})` sets the canvas to 500x400 (times `pixelScale`) and draws; `draw(ctx, vm)` draws into a 500x400 area. Then export with `canvas.toTempFilePath`.
```
vm = { mode:'daily'|'free',            // daily: NO general names (D4); free: names
       issueNo?, record:{w,l}, bandLabel,
       lineup:[{slotLabel, name, monogram, faction:'wei'|'shu'|'wu'|'qun', factionLabel, sub}], // 5; `sub` like "蜀 · 赤壁" (free only)
       battles: boolean[12] }          // true = win
```
Daily draws only the faction tile (character + colour), never `name`/`monogram`.

## open data domain  (`opendata/`)
Receives the spec 13 message, with these additions: `dpr?: number` (default 1) and `roster?: Array<[monogramChar, factionKey]>` indexed by roster index, used to draw lineup tiles from `x`. Messages: `{type:'render', ...}` and `{type:'scroll', offset}`. Set `"openDataContext": "opendata"` in game.json. It reads rows with `getGroupCloudStorage` (`groupid` if present, else `shareTicket`) or `getFriendCloudStorage`, hashes `openid|salt`, and ranks by the server rows only. Read failures and empty lists are drawn inside its canvas.

## Packaging note
`tools/` (preview, node_modules) and `tests/` must be excluded from the uploaded package (`packOptions.ignore` in the project config, owned by minigame-dev).
