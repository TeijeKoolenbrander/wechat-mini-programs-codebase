# 传画接龙 (working title): direction

Status: v1 complete release, 2026-10-15. The founder approved the build (F-1). No phases and no go/kill gate (constitution Art. 4). Author: product-ux.
Companions: `docs/chuanhua/spec.md` (the "what") and `docs/chuanhua/decisions.md` (the dated decision log).
Sources: `research/2026-10-15-new-ideas/kept-ideas.md` §3 and `kept-ideas-alt.md` §3.

Labels: **[VERIFY]** platform fact still to be proven on a device (spec §16); **[COMPLIANCE]** compliance-sensitive; **INFERENCE** our own judgement.

---

## 1. Vision

**One-line pitch:** 一句话传下去，画一笔、猜一句、再画一笔……最后看看"月亮吃月饼"在群里变成了什么。
(Pass a sentence down your group chat as drawing, guess and drawing again, then watch the whole chain unravel in one reveal.)

Everyone knows the party game where a message gets garbled as it passes along. 传画接龙 brings it into the place Chinese social life already happens: the group chat. Nobody wins and nobody needs to draw well. A bad drawing is a gift to the next person. The product is the reveal: the moment six friends see how "a moon eating a mooncake" became "an alien eating pizza", and the chat fills with 哈哈哈.

## 2. Target player

- **Primary:** WeChat users aged 18-40 in active friend, class, colleague and hobby groups: people who already post memes and run 接龙 sign-ups in their groups.
- **Secondary:** 40+ players reached through family groups. They don't know game jargon and may be shy about drawing. The design must reassure them: "画得丑没关系，越离谱越好笑".
- **When they play:** in short gaps, when a card appears in a group. A turn is under a minute; the reveal comes later, often in the evening.
- **What they want:** a laugh with people they know, something to talk about in the group, and zero effort to start.
- **Design consequences:** one thumb, portrait, no account, no lobby, no waiting room, one action per screen, honest visible timers, large text available.

## 3. Design pillars

1. **一棒一分钟 (one turn, one minute).** Look, draw or type, pass. Every screen has one obvious next tap.
2. **只看上一棒 (you only see the previous step).** The whole game rests on this rule. Nothing in the UI, the cards or the API ever leaks earlier steps before the reveal.
3. **群就是游戏 (the group is the game).** Chains live in one group. Several chains run in parallel. The reveal is a group moment. No strangers, no feed.
4. **先审后传 (check before passing).** Every drawing and sentence is checked before anyone else sees it. When in doubt, nothing is shown. [COMPLIANCE]
5. **自愿分享 (sharing is voluntary).** A card is how you pass the baton, but no share ever earns anything, and the old card keeps working. [COMPLIANCE]

## 4. What makes it shareable

- **The drift.** "月亮吃月饼" → "一个大饼在天上" → … → "外星人在吃披萨". The reveal card states the start and the end; that line alone gets a laugh in the chat.
- **Parallel chains from one prompt.** 今日起点 gives every group the same three prompts, and 同题再传 lets a group run the same prompt twice: "our second chain turned into a dinosaur".
- **The national count.** "今天全国 2,315 条接龙从这里出发" makes a small group feel part of something bigger.
- **No judgement.** No scores, no best drawer, no ranks. Bad drawers are the stars.

## 5. Tone

- **Voice:** a friendly, slightly cheeky host. Short lines: "画得丑没关系，越离谱越好笑", "第 4 棒等你接", "接龙揭晓了！".
- **Never mocking people.** We laugh at the drift, never at a player, a group of people or a real person. Prompts are everyday, kind and absurd (spec §4.2).
- **Plain language.** 棒 (baton) is the only game term, explained by its use ("第 3 棒").
- **Calm about safety.** Moderation copy is neutral and brief ("审核中", "没通过审核，换个说法吧"), never accusatory.

## 6. Art direction

Mood: **a sunny classroom doodle wall.** Off-white paper, bold rounded shapes, a relay baton shaped like a paintbrush as the mascot motif, warm accent colours.
- **Palette:** paper `#FAF7F0`, ink `#1E1B18`, accent 朱 `#D8433B`, 橙 `#F29B30`, 蓝 `#3C78C8`; the drawing palette is in spec §5.2. Status is never shown by colour alone (審核中/已通过 always in text).
- **Drawings** sit on white cards with a slight tilt in the reveal, like sticky notes on a wall; arrows between them are hand-drawn style.
- **Reveal motion:** strokes replay quickly (2.5 s per drawing), sentences type in; gentle paper sounds; no flashing or casino effects.
- **Share cards:** our own illustration (brush-baton mascot) plus large text; never user drawings (decisions PO-24).
- **Typography:** a rounded open-licence display face (e.g. an OFL font) for titles from a subpackage; system font for everything else. Large-text and high-contrast modes as in 点将台.
- All art is original, drawn in code or made by the team. Nothing resembles Gartic Phone's UI, album layout, characters, colours or sounds.

## 7. IP: what we must not copy

- **Gartic Phone** (Onrizon Social Games / Gartic Publicidade Digital, Brazil) and **Telestrations** (a trademark of its US publisher, VERIFY): do not use the names, mode names, UI, round timer look, album-style reveal layout, characters, sounds, colour scheme or prompt lists.
- The **mechanic is folk** (the telephone game, Eat Poop You Cat, Broken Picture Telephone 2007/2009, Drawception 2012) and free to use.
- Our prompts are written by us (spec Appendix B). Our reveal is a vertical "doodle wall" strip with stroke replay, not an album.

## 8. Name

- Working title **传画接龙**. Fallbacks for registration (founder checks availability, Handoff H1): **画话接龙**, **一笔传一笔**, **传画画**, **群里传画**.
- Avoid names with 你画我猜 (a saturated category we are deliberately not), Gartic, or 传声筒 trademarks (VERIFY in the release pack's name check).

## 9. Compliance stance [COMPLIANCE]

This is the studio's first UGC product and its risk falls on the whole developer entity: one viral obscene or political drawing could cost the app or the entity's standing (kept-ideas §3). Our stance:
- **Pre-moderate everything, fail closed** (spec §6).
- **Keep reach small:** one group per chain, participant-only reveals, no UGC in share images, no public surfaces.
- **Make removal instant:** reports hide at once; admin can remove any chain and stop all UGC display with one switch.
- **Collect almost nothing:** no names, avatars, ages or contacts; no WeChat privacy interfaces at all.
- **Have a human in the loop:** a named ops owner checks reports and samples daily at launch (Handoff H9).
- **Get counsel's answer** on minors and retention before submission (Handoff H10).

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Moderation miss** (crude doodles of leaders or genitals slip past the classifier) | pre-moderation, group-only reach, participant-only reveals, instant-hide reports, strikes, daily human sampling, kill switch |
| **Push routing for `mediaCheckAsync` doesn't work in a mini game** [VERIFY V1] | fallback routes (decisions PO-33); first item of the device pass; escalate if all fail |
| **Dead chains** in quiet groups | 2-person chains, parallel chains, early reveal at 4, 48 h auto-reveal, reveal notices |
| **Moderation latency** kills momentum in a lively group | parallel chains keep people busy; honest "通常几分钟" copy; text steps are instant |
| **Pre-publish quota** (≈ 100 text checks/day) blocks QA | mock mode in dev, budget guard, local filter first |
| **Read as "another 你画我猜"** | the reveal card shows the drift; copy never mentions guessing races or scores |
| **Weak IAA** | accepted; rewarded extras and one capped interstitial; it is a habit and reach product |
| **Image quota at viral scale** (200k/day) | quota guard; founder requests a raise at 70% |

## 11. Release plan

v1 complete build (minigame-dev, backend, frontend-ui) → QA against spec §19 → CTO review (correctness, security, compliance, package size) → release pack in `docs/chuanhua/release/` (Art. 7, incl. the 用户协议 and 隐私指引 texts) → Founder Handoff (spec §18) → founder device pass (spec §16.2), starting with the moderation push route → founder-approved submission.
