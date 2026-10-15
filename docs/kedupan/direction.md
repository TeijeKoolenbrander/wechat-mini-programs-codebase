# 群友刻度盘 (working title): direction

Status: v1 complete-release direction, 2026-10-15. The founder approved building this game (decisions D-1). Author: product-ux.
Companions: `docs/kedupan/spec.md` (the "what") and `docs/kedupan/decisions.md` (dated decision log, PD-1 to PD-30).
Sources: `research/2026-10-15-new-ideas/kept-ideas.md` §0, §2, §5-6; `kept-ideas-alt.md` §2; `03-fresh-sweep.md` §7. Reference implementation: `docs/dianjiangtai/` and `apps/dianjiangtai/`.

Labels: **[COMPLIANCE]** compliance-sensitive; **[SPIKE]** proven only in the founder's device pass; **INFERENCE** our own judgement.

---

## 1. Vision

**One-line pitch:** 一条刻度，两头是"冷"和"热"。火锅放哪？放完看看全国、看看群友，谁和你最同频。
(One ruler, two ends. Where does hotpot go between cold and hot? Place your needle, then see how close you are to the nation and to your group.)

Everybody has opinions about everyday things: is a cup of milk tea cheap or expensive, is a durian nice or awful to smell, is washing up relaxing or exhausting. 群友刻度盘 turns those small opinions into a 60-second daily game with a reveal. You place five needles, the crowd's answer appears, and you find out whether you are 心有灵犀 with the country and with your group chat. The group chat then argues about the one card where everybody disagreed. **The reveal is the product; the argument is the spread.**

## 2. Target player

- WeChat users aged 24-40 and 40+, many new to mobile games, arriving from family, work, alumni and hobby groups.
- They know 默契 and 同频 as everyday words. They don't know game jargon.
- They play in short gaps: commute, queue, after dinner.
- What they want: to feel "I'm normal" or "I'm unique" in a fun way, to have something light to say in the group, and a quick result.
- Design consequences: one thumb, portrait, large text, no timers, no reflex skill, one decision per screen.

## 3. Design pillars

1. **一拖就会 (drag and you know how).** The whole game is "drag the needle to where you think it goes". Learned in under 10 seconds. One ruler, one confirm button. (Constitution Art. 3.2.)
2. **揭晓的那一下 (the reveal moment).** Every card ends in a reveal: your needle, the nation's, your group's. Each reveal must be fast (< 1 s), clear and a little surprising.
3. **同一天，同五张 (same day, same five cards).** Everybody plays the same five cards, so every comparison in a group is fair and every card is a conversation topic.
4. **群就是记分牌 (the group is the scoreboard).** The group's agreement (群默契度) is the headline stat, not individual skill. Even a low score is a story ("全群就我觉得榴莲香").
5. **自愿分享，不求人 (sharing is voluntary).** Shares exist because the result is worth showing. Nothing is rewarded for sharing. [COMPLIANCE]

## 4. What makes it shareable

- **The divisive card.** Each day has at least one card the country splits on (PD-29). "全国对'一杯奶茶'吵翻了：一半说便宜，一半说贵" is the line people paste into the chat.
- **The group number.** "本群今日默契度 82" is a single number a group can be proud of, or tease itself about.
- **最同频的群友.** Inside the game, you see which friend or group member placed their needles closest to yours today. It's a warm, positive comparison about opinions on things, never a judgement of a person.
- **Host rounds.** "我出了一道刻度题：便宜↔贵，提示：一张电影票。你猜我心里的位置？" invites everyone in the chat to play, and the reveal names who 最懂你.

## 5. Tone

- **Voice:** a friendly, slightly cheeky emcee. Short lines: "全国都觉得热，就你觉得还行？" / "和全国 72% 的人想法一致".
- **Never judgemental.** No "错", no "you lose". The lowest label is 想法独特 (a unique view). We tease opinions, never people.
- **Neutral or positive content.** Everyday objects, food, animals, weather, hobbies, feelings. Nothing sensitive (spec §4.5).
- **Plain language.** Every term is explained once, in one line.

## 6. Art direction

**Mood: a sunny desk with a paper tape measure and sticky notes.** Warm, light, playful, readable at arm's length. It must look nothing like Wavelength (no semicircular dial, no coloured scoring wedge, no screen-cover art, no "psychic" role). [COMPLIANCE: original IP]

- **The ruler (刻度尺):** a horizontal paper tape measure across the screen, with ticks every 5 steps and a longer tick at the middle. No numbers are printed on it while placing. End labels sit above each end on sticky notes (for example 冷 on a pale blue note, 热 on a pale orange note).
- **Markers, shape and colour (PD-16):**
  - 你 (you): a **▼** pointer, tangerine `#F07B2C`;
  - 全国 (nation): a **◆** diamond, teal `#2A8C8C`;
  - 本群 (group): a **●** dot, plum `#7D4E8C`;
  - group members (reveal only): small hollow ○ dots in plum.
- **Palette:** paper cream `#FBF6EC`, ink `#24211E`, tape yellow `#F2C94C`, accents as above. High-contrast mode: white background, black ink, darker marker set (`#B04A00`, `#145F5F`, `#4E2A5C`), text ≥ 7:1.
- **Card:** each daily card is a sticky note pinned above the ruler: the spectrum ("冷 ↔ 热") small, the prompt ("火锅") large.
- **Typography:** system font throughout (no font subpackage needed). Prompt ≥ 28 pt, end labels ≥ 20 pt, body ≥ 16 pt (large-text mode: prompt ≥ 34 pt, body ≥ 20 pt).
- **Motion:** the reveal slides the ◆ and ● in from the centre in about 0.6 s, with a soft "tick" sound. A 心有灵犀 card gets a small paper-confetti burst and a light vibration. No flashing, no casino effects.
- **No images of people, no maps, no brand logos.** All art is drawn in code (paper texture, notes, ruler). There are no image files beyond the app icon and the static share fallback.

## 7. Audio mood

Quiet and light: a paper "tick" when placing, a soft chime on the reveal, a brighter two-note chime on 心有灵犀. Mute toggle on home, persisted. Fully playable muted.

## 8. Naming and branding

- **群友刻度盘** is the working title and first choice (PD-23). Fallbacks: 刻度默契, 群友刻度尺, 同频刻度. The founder checks availability at registration (spec §16).
- Never use "Wavelength", 波长, 心灵波长 or any translation of it, and never the word "psychic"/通灵 as a role name.
- Branding motif: a tape-measure coil with a ▼ pointer, which also works as the app icon.

## 9. What we will NOT do

- No IAP, no virtual currency, no paid anything, no gacha or random rewards. [COMPLIANCE]
- No reward of any kind for sharing, inviting or group size; no share-to-unlock; no fake system-message cards; no auto-share. [COMPLIANCE: 诱导分享]
- No in-game user text: no typed clues, no names, no chat, no comments (PD-7). Clues are curated presets or happen in the WeChat chat itself. [COMPLIANCE: UGC]
- No spectra or prompts about people (群友, celebrities, real persons, professions as people), regions, provinces, ethnic groups, religions, politics, gender, bodies, age, brands, alcohol, tobacco, gambling, disasters or medical claims (spec §4.5). [COMPLIANCE]
- No rating of friends. Players place **things**, never people. "群里谁最…" style content is banned.
- No forced authorization: no login wall, no nickname or avatar request, no location, phone, contacts or album. [COMPLIANCE]
- No streak rewards, streak freezes or "don't break your streak" pressure. No push reminders except the one opt-in "刻度题揭晓了" notice.
- No energy, no timers on answers, no countdown pressure.
- No ads in the daily play flow or the host-round flow (except the optional rewarded swap), and never an ad that gates the reveal, the national median or the group board (PD-12, PD-28).

## 10. Release plan and success metrics

Constitution Art. 4: one complete v1, no phase gates. Path:

**v1 complete build → QA (spec §17, all ACs) → release pack (`docs/kedupan/release/`) → Founder Handoff (spec §16) → founder device pass (spec §14) → submission.**

Build effort (INFERENCE, research estimate): about 4-5 weeks of code with heavy 点将台 reuse by copy (PD-26), plus content writing and review in parallel (≥ 300 spectra, ≥ 3,000 items, PD-18). The content review is on the critical path.

**Post-launch KPIs (not gates; INFERENCE; definitions in spec §12):**

| Metric | Healthy | Watch |
|---|---|---|
| Completed dailies with ≥ 1 share tap | ≥ 8% | < 3% |
| Card opens that lead to a completed card in the same session | ≥ 30% | < 15% |
| Host rounds that reach a reveal with ≥ 2 guesses | ≥ 40% | < 20% |
| Archive sets per session (players who open the archive) | ≥ 2 | < 1.2 |
| D1 retention (new users) | ≥ 35% | < 25% |
| D7 retention | ≥ 15% | < 8% |
| Groups with ≥ 3 members completing on the same day (share of active groups) | ≥ 25% | < 10% |

Cheapest early signal (optional, founder's choice, not a gate): the zero-code test from kept-ideas §2 (5 spectrum cards posted as images in 10 groups).

## 11. Risks

1. **Weak "play again now" (research Addictive 3).** Mitigation: the unlimited archive (PD-10), rewarded bonus cards, 定分 the next morning, and host rounds after the daily.
2. **Quiet or small groups make the group stat empty.** Mitigation: the national reference always works; group stats need only 3 members; friend board and 最同频 work without a group.
3. **Dead host rounds.** Mitigation: three reveal paths (host, 8th guess, 24 h), the opt-in reveal notice (PD-13), and the daily as the main loop so hosting is a bonus.
4. **"Another 默契测试".** The 默契 territory is occupied by 2017-era Q&A mini programs (kept-ideas §2). Mitigation: the ruler mechanic, the national crowd and daily shared cards are new; the copy says 同频 and 刻度 more than 默契测试. Founder in-app search before registration (spec §16 H11).
5. **Content risk.** 3,000 items is a lot of text to review; one insensitive card in the daily reaches everyone that day. Mitigation: strict content rules (spec §4.5), two-person review, forbidden-term CI, a server-side daily set that ops can swap without a release, and the "这张卡有问题" feedback.
6. **Low IAA revenue.** Expected (research IAA 2). It is a habit and spread product; the ad placements are where they cannot hurt retention.
7. **Platform APIs proven only on device** (group entry decrypt, open data domain rows, privacy popup, subscribe message). Mitigation: all copied from 点将台 with the same fallbacks; the founder's device pass (spec §14).
8. **Early-day noise in the national median.** Mitigation: the 10-vote editor prior (PD-4); the "样本还少" label below 30 players.
9. **Clone risk.** Simple to copy. Our moat is content quality, the daily rhythm and group stats.
