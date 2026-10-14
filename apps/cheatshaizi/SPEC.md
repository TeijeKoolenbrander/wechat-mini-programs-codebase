# 骰盅 — WeChat Mini Program & Mini Game Spec

A virtual dice cup (骰盅) for playing 吹牛 / 大话骰 in person. Replaces the physical
cup: you shake, the dice stay hidden, you lift the cup to peek at your own five.
All bidding, 开, and drinking happens out loud between real people — the app has no
game logic, no scoring, no opponents.

The rolls are rigged. That is the point of the app.

There are two builds of the same app, and this spec covers both:

| Build | Folder | What it is |
|---|---|---|
| **Mini Program** (小程序) | `mini-program/` | WXML pages, WXSS styles, `setData` |
| **Mini Game** (小游戏) | `mini-game/` | One canvas, drawn by hand, with its own touch routing |

They behave the same way: same modes, rolls, gestures, cheat grid, haptics, sprites
and layout. Everything below applies to both unless a section says otherwise.
§3.1 lists where the Mini Game differs.

---

## 1. Objective

| | |
|---|---|
| **Users** | Me, and nobody else. Private build. |
| **Distribution** | Never submitted for review. Runs via DevTools preview or a 体验版 QR. |
| **AppIDs** | Separate registrations: Mini Program `wx6d5a9d8ec36cf6a1`, Mini Game `wx554df5d818dc209a`. |
| **Network** | None. Zero requests, zero backend, nothing stored off-device. |
| **Dice count** | Always 5. (Reference app uses 6; we use 5.) |
| **Look** | Rebuild the visual language of 喝酒摇骰子 — see `base_images/`. |

### Three modes

Chosen from the launch screen, which shows **one visible button: PLAY**.

| Mode | How it is reached | Behaviour |
|---|---|---|
| **Lucky** | Tap the **PLAY** button | Heavily weighted toward good hands, but can still roll badly |
| **Insane** | Tap the **摇骰子** title | Near-guaranteed monster hands |
| **Cheat** | Tap **玩法说明** under the button | Fair roll, then set the hand by hand, secretly |

Both secret triggers are ordinary-looking text with generous invisible padding
around the glyphs, so they can be hit without aiming. Neither has a hover state or
any other affordance. Anyone picking up the phone sees a title, a PLAY button, and
what looks like a help link.

Each mode screen has a **back button** returning to the launch screen.

---

## 2. Roll generation

All three generators live in `core/` as pure functions of an injected RNG.
Each build has its own copy of `core/`, and the two copies are kept byte-identical
(see §9).
A hand is `number[5]`, each value `1..6`.

Terminology: **1s are wild (飞)**, so a hand's strength for face `X` is
`count(X) + count(1)`.

### 2.1 Lucky mode

```
LUCKY_GOOD_CHANCE = 0.85    // tunable
```

- With probability `LUCKY_GOOD_CHANCE` → return a hand satisfying `isGoodHand()`.
- Otherwise → return a fair random hand, which may be good or bad by chance.

Implemented by **rejection sampling**: roll fair, test the predicate, retry up to
`MAX_REJECTION_TRIES = 300`. This keeps the distribution natural *within* the good
subset rather than always producing the same shape. Falls back to direct
construction if the cap is ever hit.

`isGoodHand(hand)` is true when **any** of:

| | Rule | Example |
|---|---|---|
| **G1** | Three or more dice share the same face | `4 4 4 2 6` |
| **G2** | For some face `X ≠ 1`: `count(X) + count(1) ≥ 4` | `5 5 1 1 3` → reads as four 5s |
| **G3** | No 1s at all, and at most 3 distinct faces | `2 2 5 5 6` |

> **G3 replaced the earlier "no 1s at all" rule.** That rule alone matched ~40% of
> fair hands, so it widened "good" too far. Requiring at most 3 distinct faces as
> well brings G3 down to ~23% of fair hands. Kept behind `GOOD_RULE_G3_ENABLED`
> for tuning.

### 2.2 Insane mode

```
INSANE_FIVE_CHANCE = 0.80   // else four
```

- **80% — five effective.** Pick a face `X`; every one of the 5 dice is either `X`
  or `1`, so `count(X) + count(1) === 5`. Includes the degenerate cases of five `X`
  and five `1`s.
- **20% — four effective.** `count(X) + count(1) === 4`, and the remaining single
  die is a face that is neither `X` nor `1`, so the hand reads as exactly four, not
  five.

How many of those dice are wilds is **Binomial(target, `INSANE_WILD_P` = 0.5)**:
2 or 3 ones is easy, 1 or 4 is harder, 0 or 5 is almost impossible. Five wilds is
the all-wilds hand. The four-effective branch resamples any draw above 3 wilds so
the odd die can never read as high as the target. Measured spread of 1s per hand:

```
             0      1      2      3      4      5
five-eff   3.2%  15.5%  31.3%  31.4%  15.5%   3.1%
four-eff   6.7%  26.7%  39.9%  26.7%     —      —
overall    3.9%  17.7%  33.0%  30.5%  12.4%   2.5%
```

### 2.3 Cheat mode

Base roll is **fair random**. If you never arm the override, that hand stands.

**Arming:** *long-press* the 摇 button (`CHEAT_LONGPRESS_MS = 600`). A
double tick (two heavy `wx.vibrateShort`, `DOUBLE_TICK_GAP_MS = 120` apart) fires
on activation — distinct from the single tick of a zone tap, and far quieter than
`wx.vibrateLong`. A *short tap* on 摇 is an ordinary re-roll,
exactly as in the other modes.

Arming is **one shot**: as soon as a quantity and a face have both been tapped and
the hand is set, the override disarms itself. Setting another hand means
long-pressing again. Nothing can touch the dice in between.

**Input:** once armed, the whole screen becomes a 3×2 tap grid. The six zones are
fixed in space, but **the two taps read the same zone differently**:

```
          TAP 1 — quantity          TAP 2 — face
          ((zone index + 1) mod 6)  (zone index + 1, 1-6)

        ┌─────────┬─────────┐     ┌─────────┬─────────┐
        │    1    │    2    │     │    1    │    2    │
        ├─────────┼─────────┤     ├─────────┼─────────┤
        │    3    │    4    │     │    3    │    4    │
        ├─────────┼─────────┤     ├─────────┼─────────┤
        │    5    │    0    │     │    5    │    6    │
        └─────────┴─────────┘     └─────────┴─────────┘
```

Quantity is the **effective count under 飞** — the chosen face plus any wilds:

```
quantity === count(face) + count(1)
```

So quantity 0 (bottom-right) means *none of that face and no 1s at all*, and quantity 5 means *all five
dice read as that face*. Every zone 0–5 is legal with 5 dice, so there is no invalid
quantity and no rejected tap.

Two taps, **quantity first, then face**:

> Want three 1s → tap **zone 2** (mid-left, quantity = 3), then **zone 0**
> (top-left, face = 1).

**The chosen dice** are composed according to `CHEAT_SPLIT`:

| Value | Behaviour | `qty=3, face=5` gives |
|---|---|---|
| `'binomial'` **(default)** | Each counted die is a wild with probability `CHEAT_WILD_P = 0.5`, so wilds ~ Binomial(`qty`, 0.5). | `5 5 1` / `5 1 1` 38% each, `5 5 5` / `1 1 1` 12–13% each |
| `'weighted'` | 10% of the time a clean run of the chosen face; otherwise 1 to `qty` wilds, uniformly. | `5 5 5` 10%, else `5 5 1` / `5 1 1` / `1 1 1` |
| `'oneWild'` | Exactly one counted die becomes a `1`, when `qty ≥ 2`. | `5 5 1` |
| `'uniform'` | Every counted die is the chosen face. | `5 5 5` |
| `'random'` | Split randomly, always keeping at least one of the face. | `5 1 1` / `5 5 1` / … |

Under `'binomial'`, the wild count per declared quantity comes out as:

```
ask for 1:  0×1: 50%   1×1: 50%
ask for 2:  0×1: 25%   1×1: 50%   2×1: 25%
ask for 3:  0×1: 12%   1×1: 38%   2×1: 37%   3×1: 13%
ask for 4:  0×1:  6%   1×1: 25%   2×1: 37%   3×1: 25%   4×1:  6%
ask for 5:  0×1:  3%   1×1: 16%   2×1: 31%   3×1: 31%   4×1: 15%   5×1: 3%
```

Asking for **five** gives 2 or 3 wilds most of the time, and all five wilds (which
reads as five of *every* face) only ~3% of the time.

Every split produces the **same effective count** under 飞. See §8.2 for why `binomial`
is the default.

**The other dice** are filled randomly from faces excluding **the chosen face** and
excluding **1**. The hand therefore contains *exactly* the count you asked for, with
no accidental extra wilds inflating it.

- Ask for three 5s → `5 5 5` plus two drawn from `{2,3,4,6}`.
- Ask for three 1s → `1 1 1` plus two drawn from `{2,3,4,5,6}`.
- Ask for zero 5s → all five drawn from `{2,3,4,6}`.

**Feedback:** every tap fires a single `wx.vibrateShort`. Silent, invisible, and feels like
nothing to anyone watching.

**No locking:** the override stays usable with the cup up, so a hand can be fixed
after you have seen it — long-press to arm, then tap. While revealed the dice keep
their existing positions and only their faces turn over, so the pile does not
visibly jump.

---

## 3. Interaction

### Launch screen

Dark background, centred column: title, subtitle, the red **PLAY** button, and a
help link.

| Element | Looks like | Goes to |
|---|---|---|
| `摇骰子` | the app title | **Insane** |
| `PLAY` | the only button | **Lucky** |
| `玩法说明` | a how-to-play link | **Cheat** |

Each secret target carries ~30rpx of padding beyond its text so it is forgiving to
tap, and neither shows a pressed state (no `hover-class` in the Mini Program, no
press visual in the Mini Game). `玩法说明` is a stand-in — any innocuous label works,
and it is one string in `pages/home/home.wxml` or `js/home.js`.

### Cup screen

One screen for all three modes. The Mini Program passes the mode as a query param
(`pages/cup/cup?mode=lucky`); the Mini Game passes it when it switches to the cup
scene (`app.go('cup', 'lucky')`).

| Action | Result |
|---|---|
| Tap 摇 | Roll. Cup drops over the dice and wobbles ~1.2s with sound; 摇 is hidden and input locked during the animation. |
| Long-press 摇 | *Cheat mode only* — arms the override. Vibrates. |
| Swipe **up** | Cup lifts, dice revealed. **Stays revealed** until swiped down. The override stays usable. |
| Swipe **down** | Cup lowers, dice hidden again. |
| Tap 🔊 (left) | Toggle sound. The icon becomes 🔇 when muted. |
| Tap ⚙ (right) | Settings — currently just back to the launch screen. |

**Gesture disambiguation:** a touch that moves more than `SWIPE_THRESHOLD = 40px`
vertically is a swipe; anything less is a tap on the zone grid. This only matters in
cheat mode, where both gestures are live at once.

### 3.1 Mini Game differences

The Mini Game reproduces the Mini Program screen for screen. These are the only
behavioural differences, all forced by having no WXML or navigation bar:

- **No navigation bar.** Content starts where the Mini Program's bar would have
  ended (below the capsule menu), so the layout and the lifted cup keep clear of
  the capsule. The cheat grid covers that same area, so the zones sit where they
  did in the Mini Program.
- **Control taps are only control taps.** In the Mini Program a tap on 🔊/🍶 or ⚙
  also reached the stage, so with the override armed it counted as a zone tap too.
  The Mini Game consumes it.
- **Screens are scenes.** ⚙ switches back to the launch scene rather than calling
  `wx.navigateBack()`. There is no page stack and no system back gesture.
- **Icons are centred by their ink.** Canvas centres a glyph's em box, which puts
  symbols like ⚙ off-centre by a font-dependent amount. Each control glyph is
  measured once off-screen and shifted so its visible shape is centred.

---

## 4. Visual design

Built from the renders in `visuals/` (not shipped). They are cropped,
resized and compressed into `assets/images/` (~230KB in total):

| Sprite | From | Shown at |
|---|---|---|
| `cup.png` | `Cup (1).png` | 442×622rpx |
| `tray.png` | `lid (1).png` | 520×352rpx |
| `die1.png` … `die6.png` | `1 (1).png` … `6 (1).png` | 88×100rpx, rolled value on the top face |

`open&close.png` (closed) and `oc2.png` (open) set the layout; the positions
above are measured from them. `Closed (1).png` and `open (1).png` are older
references.

- **Background**: black, with a blue radial glow behind the cup.
- **Tray**: fixed; only the cup moves.
- **Cup**: closed, it sits deep in the tray, with its base 79rpx above the tray's
  front edge. When revealed, it is translated up 288rpx, so its base hovers just
  above the tray's back rim.
- **Dice**: in a five-die cluster (two behind, one to the right, two in front),
  as in `oc2.png`.
- **Dice rotation**: the dice are 3D renders, so in-plane rotation is kept within ±5°.
- **Shake animation** — cup lowers, then rotates ±8° for ~1.2s with easing, settling
  back to 0°.
- **Bottom bar** — three controls: circular mute toggle (left), large red circular 摇
  button (centre), circular gear (right).

All sizes are given in rpx. The Mini Game converts them the same way WeChat does
(the screen is 750rpx wide), in `mini-game/js/layout.js`. Its CSS transitions
(cup lift `0.45s cubic-bezier(0.22, 0.9, 0.3, 1)`, hint fade `0.3s`) and the
`wobble` keyframes are reimplemented in `mini-game/js/anim.js`.

---

## 5. Project structure

```
cheatshaizi/
├── SPEC.md  README.md
├── mini-program/
│   ├── app.js  app.json  app.wxss
│   ├── project.config.json  sitemap.json
│   ├── base_images/          reference screenshots (not shipped)
│   ├── visuals/              source renders for the sprites (not shipped)
│   ├── core/                 PURE JS — no wx.* calls, no setData
│   │   ├── rng.js            fair + seeded RNG
│   │   ├── hands.js          counts, isGoodHand, predicates
│   │   ├── lucky.js          rollLucky(rng)
│   │   ├── insane.js         rollInsane(rng)
│   │   ├── cheat.js          applyCheat, zoneAt, zone mapping
│   │   └── config.js         every tunable constant, in one place
│   ├── utils/
│   │   └── ui.js             sparkles, hand -> view model
│   ├── pages/
│   │   ├── home/             PLAY + hidden zones
│   │   └── cup/              the whole play screen
│   ├── assets/               sprites + shake.mp3
│   ├── tools/
│   │   └── stats.js          prints each mode's real distribution
│   └── tests/                node:test, runs in plain node against core/
└── mini-game/
    ├── game.js  game.json    entry point and config
    ├── project.config.json   compileType "game"
    ├── core/                 identical copy of mini-program/core/
    ├── js/
    │   ├── main.js           canvas, render loop, touch routing, scenes
    │   ├── home.js           launch scene (pages/home)
    │   ├── cup.js            cup scene (pages/cup)
    │   ├── layout.js         every size, converted from rpx — pure
    │   ├── anim.js           transitions + wobble keyframes — pure
    │   ├── dice.js           dice slots and scatter (utils/ui) — pure
    │   └── draw.js           backdrop, spaced text, buttons
    ├── assets/               same sprites + shake.mp3
    └── tests/                core/ suite + layout, animation, smoke tests
```

Shipped packages: the Mini Program is **52KB**, with `base_images/`, `visuals/`,
`tests/` and `tools/` excluded via `packOptions.ignore`. The Mini Game is
**~290KB**, almost all of it sprites, with `tests/` excluded.

`core/` never imports from `pages/` or `js/` and never touches a WeChat API. That
is what makes the rigging testable without opening the simulator, and what lets
both builds share it unchanged.

---

## 6. Commands

Run from inside `mini-program/` or `mini-game/`:

| | |
|---|---|
| `npm test` | Run that build's suite |
| `npm run test:watch` | *Mini Program* — watch mode while tuning probabilities |
| `npm run stats` | *Mini Program* — print what each mode actually produces, over 200k hands |
| DevTools → 导入项目 | Point at `mini-program/` or `mini-game/`; the AppID comes from its `project.config.json` |

No build step, no bundler, **no dependencies** — the suite uses Node's built-in
`node:test` rather than jest, so there is nothing to install. `core/` is plain
CommonJS, consumed directly by the tests and by both builds.

---

## 7. Testing strategy

Everything that matters is a pure function, so it is tested outside WeChat.

**Deterministic tests** (seeded RNG):

- `applyCheat(…, qty=3, face=5)` → exactly three 5s, zero 1s, other two in `{2,3,4,6}`.
- `applyCheat(…, qty=5, face=1)` → five 1s.
- `applyCheat(…, qty=0, face=5)` → no 5s and no 1s anywhere.
- For every `qty` 0–5 and every `face` 1–6: `count(face) + count(1) === qty` exactly.
- Zone index → quantity (`(index + 1) mod 6`: 1–5, then 0 bottom-right) and zone index → face (index + 1, 1–6).

**Statistical tests** (10,000 samples, ±2% tolerance):

- Lucky: `P(isGoodHand)` lands near `LUCKY_GOOD_CHANCE + 0.15 × P(good by chance)`.
- Lucky: bad hands genuinely occur — the suite fails if the rate is 0.
- Insane: 80/20 split between five-effective and four-effective.
- Insane four-effective: the odd die is never `X` and never `1`.
- Fair baseline: each face ≈ 1/6.

**Mini Game only:**

- `core/` is byte-identical to `mini-program/core/` — the test fails on any drift.
- Layout matches the rpx values in the Mini Program's WXSS; controls do not overlap.
- Easing curves, tweens and the wobble keyframes hit their expected values.
- A smoke test boots the whole game against a fake `wx` and canvas and plays it by
  touch: every mode, swipe to reveal, mute, back, and the full cheat flow (arm,
  two zone taps, one-shot disarm, no-wilds toggle).

**Manual, on-device:** vibration timing, long-press feel, swipe threshold, and whether
the shake animation reads as convincing. None of that can be unit-tested. Check both
builds — the Mini Game's canvas rendering (fonts, emoji, icon centring) can differ
between iOS and Android.

---

### 8.4 Package size

`base_images/` is already ~1.1MB against the Mini Program's **2MB** main-package
limit. It must be excluded from the upload via `packOptions.ignore` in
`mini-program/project.config.json`, or deleted before building a 体验版. The Mini
Game carries no reference images, so it has no such risk.

---

## 9. Boundaries

**Always**

- Keep `core/` free of `wx.*` and free of `setData`.
- Keep the two copies of `core/` identical. Change one, copy it to the other.
- Keep both builds behaving the same. A change to one is made to the other, unless
  it only exists because of the platform (§3.1).
- Keep every tunable number in `core/config.js`, never inline.
- Keep the hidden zones visually undetectable.
- Keep the app fully offline.

**Ask first**

- Changing any probability constant.
- Adding a page or scene, a permission, or anything that appears in the launch UI.
- Anything touching package size or the DevTools config.

**Never**

- Add analytics, telemetry, or any network call.
- Persist or transmit roll history anywhere.
- Require login, 授权, or any WeChat user data.
- Submit for review.
