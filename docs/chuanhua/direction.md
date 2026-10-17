# 传画接龙 (working title): direction

Status: v1 complete release, updated 2026-10-15 for founder decisions F-2 to F-5: 今日起点 removed and replaced by a random 3-pick from a large bank; full-space canvas; forced send at time-up; live simultaneous rooms as the default, with 慢慢传 (async chains) as the secondary mode. The founder approved the build (F-1). There are no phases and no go/kill gate (constitution Art. 4). Author: product-ux.
Companions: `docs/chuanhua/spec.md` (the "what") and `docs/chuanhua/decisions.md` (the dated decision log).
Sources: `research/2026-10-15-new-ideas/kept-ideas.md` §3 and `kept-ideas-alt.md` §3.

Labels: **[VERIFY]** a platform fact still to be proven on a device (spec §16); **[COMPLIANCE]** compliance-sensitive; **INFERENCE** our own judgement.

---

## 1. Vision

**One-line pitch:** 群里一起开一局：每人一题，画一笔、猜一句、再传给下一位，三分钟后一起看「月亮吃月饼」变成了什么。
(Start a game with your group: everyone picks a prompt, draws or guesses what they're handed, passes it on, and three minutes later everyone sees how "a moon eating a mooncake" turned into something else.)

Everyone knows the party game where a message gets garbled as it passes along. 传画接龙 brings it into the place Chinese social life already happens: the group chat.
- By default, the group plays **together, live**. Everyone is on their own screen and works on a different chain each round. At the end, all the chains open at once.
- When the group can't get together at the same time, **慢慢传** lets one chain travel through the group over a day or two.

Nobody wins, and nobody needs to draw well. A bad drawing is a gift to the next person. The product is the reveal. Everyone sees the final picture or sentence first, then steps back through it to the original prompt, and the chat fills with 哈哈哈.

## 2. Target player

- **Primary:** WeChat users aged 18-40 in active friend, class, colleague and hobby groups. These are people who already post memes and run 接龙 sign-ups in their groups.
- **Secondary:** 40+ players reached through family groups. They don't know game jargon and may be shy about drawing. The design must reassure them: "画得丑没关系，越离谱越好笑".
- **When they play:**
  - **Live:** when a few people in a group are around at once, for example after dinner or during a break. A game takes about 3 minutes.
  - **慢慢传:** in short gaps, whenever a card appears in a group.
- **What they want:** a laugh with people they know, something to talk about in the group, and zero effort to start.
- **Design consequences:**
  - one thumb, portrait, no account;
  - one lobby screen with one button for the host;
  - one action per screen;
  - honest, visible timers that end the turn on their own;
  - the biggest possible canvas;
  - large text available.

## 3. Design pillars

1. **一棒一分钟 (one turn, one minute).** Look, draw or type, pass. Every screen has one obvious next tap. When time is up, the turn goes by itself, and nobody can stall the group.
2. **只看上一棒 (you only see the previous step).** The whole game rests on this rule. Nothing in the UI, the cards or the API ever leaks earlier steps before the reveal.
3. **群就是游戏 (the group is the game).** Rooms and chains live in one group. Everyone plays at once, and the reveal is a shared moment. No strangers, no feed.
4. **先审后传 (check before passing).** Every drawing and sentence is machine-checked before anyone else sees it, within seconds. When in doubt, nothing is shown. [COMPLIANCE]
5. **自愿分享 (sharing is voluntary).** A card is how you invite people, but no share ever earns anything. [COMPLIANCE]

## 4. What makes it shareable

- **The drift.** "月亮吃月饼" → "一个大饼在天上" → … → "外星人在吃披萨". The reveal shows the end first, so everyone starts with "what on earth is that?" and then walks back to the start. The reveal card states the start and the end, and that line alone gets a laugh in the chat.
- **Everyone's chain at once.** In a live game, each player started a chain, so there are as many punchlines as players.
- **Random prompts.** Each player rolls 3 prompts from a bank of 2,000+ and picks one, so no two games feel the same.
- **No judgement.** No scores, no best drawer, no ranks. Bad drawers are the stars.

## 5. Tone

- **Voice:** a friendly, slightly cheeky host. Short lines:
  - "画得丑没关系，越离谱越好笑"
  - "等大家都画完…"
  - "全部揭晓！"
  - 「（没来得及画）」
- **Never mocking people.** We laugh at the drift, never at a player, a group of people or a real person. Prompts are everyday, kind and absurd (spec §4.3).
- **Plain language.** 棒 (baton) and 局 (a game) are the only game terms, and they are explained by their use.
- **Calm about safety.** Moderation copy is neutral and brief ("没通过审核，改一改再交"). It is never accusatory. Other players never learn why a step didn't arrive.

## 6. Art direction

Mood: **a sunny classroom doodle wall.** Off-white paper, bold rounded shapes, a relay baton shaped like a paintbrush as the mascot motif, and warm accent colours.

- **Palette:**
  - paper `#FAF7F0`, ink `#1E1B18`;
  - accents: 朱 `#D8433B`, 橙 `#F29B30`, 蓝 `#3C78C8`;
  - the drawing palette is in spec §5.2.
  - Status is never shown by colour alone: 审核中, 已交 and 已通过 always appear in text.
- **Canvas:**
  - The drawing paper fills the screen between a thin top bar and two tool rows.
  - When someone else's drawing has a different shape from your screen, it sits centred on the paper. The spare margin is in a slightly darker paper tone, so you can see where the drawing ends.
- **Lobby:**
  - Seats are numbered doodle stickers: 1 to 10 hand-drawn circles, filled when taken.
  - No names, no avatars.
- **Reveal:**
  - One sticky note at a time, slightly tilted, on the wall.
  - A hand-drawn arrow points back to the earlier step.
  - Strokes replay quickly (2.5 s per drawing), and sentences type in.
  - Gentle paper sounds; no flashing or casino effects.
- **Share cards:** our own illustration (the brush-baton mascot) plus large text. They never contain user drawings (decisions PO-24).
- **Typography:** system fonts (TD-71). Large-text and high-contrast modes as in 点将台.
- All art is original, drawn in code or made by the team. Nothing resembles Gartic Phone's UI, album layout, characters, colours or sounds.

## 7. IP: what we must not copy

- **Gartic Phone** (Onrizon Social Games / Gartic Publicidade Digital, Brazil) and **Telestrations** (a trademark of its US publisher, VERIFY). Do not use their:
  - names or mode names;
  - UI, lobby or avatar look;
  - round-timer look;
  - album-style reveal, chat-bubble list or presenter controls;
  - characters, sounds or colour scheme;
  - prompt lists.
- The **mechanic is folk** and free to use: the telephone game, Eat Poop You Cat, Broken Picture Telephone (2007/2009), Drawception (2012). Simultaneous rounds with rotating sheets are the folk paper version of the game.
- Our prompts are original:
  - The v1 prompts were hand-curated.
  - The v2 bank is AI-drafted and human-reviewed (spec §4.3), and is never lifted from any game.
- **Our reveal differs from Gartic's album:**
  - It starts from the **final step** and steps **backwards** to the prompt.
  - It shows one doodle-wall sticky note at a time.
  - It has no avatars, no chat bubbles and no presenter.

## 8. Name

- Working title **传画接龙**.
- Fallbacks for registration (the founder checks availability, Handoff H1): **画话接龙**, **一笔传一笔**, **传画画**, **群里传画**.
- Avoid names that use 你画我猜 (a saturated category we are deliberately not in), Gartic, or 传声筒 trademarks (VERIFY in the release pack's name check).

## 9. Compliance stance [COMPLIANCE]

This is the studio's first UGC product, and its risk falls on the whole developer entity. One viral obscene or political drawing could cost the app or the entity's standing (kept-ideas §3). Live play raises the stakes, because content now has to move in seconds. Our stance:

- **Machine-check everything before anyone else sees it, and fail closed:**
  - drawings use the synchronous mini-game image check;
  - text uses the synchronous mini-game text check;
  - if a check errors or times out, the step simply doesn't arrive.
- **If the synchronous image check is not available, live rooms are switched off.** Only 慢慢传 runs, with the slower async check (spec §6.9).
- **Keep reach small:**
  - one group per room or chain;
  - reveals only for the people who played;
  - no UGC in share images;
  - no public surfaces.
- **Make removal instant:** reports hide content at once. Admins can remove any chain and stop all UGC display with one switch.
- **Collect almost nothing:**
  - no names, avatars, ages or contacts;
  - no WeChat privacy interfaces at all;
  - room presence is limited to "joined, left, last seen", kept server-side.
- **Have a human in the loop:**
  - A named ops owner checks reports and random samples daily at launch (Handoff H9).
  - A human reviews every prompt of the AI-drafted bank (H13).
- **Get counsel's answer** on minors, retention and the AI-drafted prompt bank before submission (H10).

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Moderation miss** (crude doodles of leaders or genitals slip past the classifier) | pre-moderation; group-only reach; member-only reveals; reports hide at once; strikes; daily human sampling; kill switch |
| **The synchronous image check is not enabled for our AppID** (error 750031), is not reachable as a cloud call, or is too slow [VERIFY V16] | First item of the device pass. Fallback: live rooms off and 慢慢传 with async checks (PO-44). The CTO escalates to the founder |
| **Real-time sync fails or lags** (`watch` in mini games, PC WeChat) [VERIFY V17] | `watch` is only a doorbell; polling every 2 s is the guaranteed path; deadlines are server-side, so rounds always end |
| **Not enough people online** for a live game | 3-player minimum; a pair (or anyone who can't gather) is pointed to 慢慢传; lobby cards update live |
| **Dead 慢慢传 chains** in quiet groups | 2-person chains; early reveal at 4; 48 h auto-reveal; reveal notices; forced send at time-up |
| **Losing the daily habit** without 今日起点 | streak across both modes; the group's open games on home; reveal notices (PO-37) |
| **AI-drafted prompt bank** contains something unsafe or unoriginal | automated checks, AI review, then a mandatory human review of every prompt (H13); prompts are retired, never edited in place |
| **Pre-publish quota** for content checks blocks QA | mock mode in dev, budget guard, local filter first |
| **Read as "another 你画我猜"** | the reveal card shows the drift; copy never mentions guessing races or scores |
| **Weak IAA** | accepted; rewarded extras and one capped interstitial after reveals; it is a habit and reach product |
| **Image quota at viral scale** (200k/day) | room caps; quota guard; the founder requests a raise at 70% |

## 11. Release plan

1. v1 complete build (minigame-dev, backend, frontend-ui), rebuilt to the updated spec.
2. QA against spec §19.
3. CTO review: correctness, security, compliance, package size.
4. Release pack in `docs/chuanhua/release/` (Art. 7), including the 用户协议 and 隐私指引 texts.
5. Founder Handoff (spec §18).
6. Founder device pass (spec §16.2), starting with the synchronous image check and the live-room sync.
7. Founder-approved submission.
