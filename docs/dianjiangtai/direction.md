# 点将台 (working title): direction

Status: reviewed with the founder, 2026-10-14; founder decisions are logged in spec §0 (D1-D14). Scope: **三国 only**. Author: product-ux. Date: 2026-10-14.
Companion: `docs/dianjiangtai/spec.md` (the "what", scoped to the Phase 1 prototype).
Sources: `research/2026-10-14-social-minigames/` (00-shortlist, 03-social-mechanics-monetization, 04-legal-compliance).

Labels used in both docs:
- **[VERIFY-P0]**: the research flagged this API or platform detail as UNVERIFIED, or it rests on stale or second-hand sources. It **needs verification in Phase 0** and must not be treated as fact. (Policy/legal items were cleared by the founder, spec D14.)
- **[COMPLIANCE]**: compliance-sensitive feature (user data, sharing rules, ads, content review).
- **INFERENCE**: our own judgement, with no published benchmark behind it.

---

## 1. Vision

**One-line pitch:** 五轮翻令，点五员大将，看你的阵容能不能十二战全胜、一统天下。然后拿到群里吵一架。
(Flip five command tokens, draft five legendary generals, and see whether your army wins all twelve battles and unites the realm. Then take it to the group chat and argue.)

Everyone in China already has opinions about 三国 generals: who was stronger, who was overrated, who should have been 军师. 点将台 turns those opinions into a 60-second game with a verdict. You draft, the campaign grades you, and the grade gives the group chat something to argue about. The argument is the product. The game is a fast, fair way to start one.

## 2. Target player

- **Primary:** WeChat users aged 24-40 (50% of mini game players) and 40+ (40%). Many have never played a "real" mobile game; more than half of 2025 MAU had no prior mobile game experience (research 03, §1).
- **What they know:** the 三国 story from 演义, TV dramas, 评书 and school. They know 关羽, 诸葛亮, 吕布 and 曹操 by heart. They don't know game jargon (SSR, DPS, meta).
- **When they play:** in short gaps: commuting, waiting, after dinner. They usually arrive from a card in a family, work or alumni group.
- **What they want:** to be right, to look clever in the group, and a quick, satisfying verdict. They don't want to learn a system.
- **Design consequences:** one thumb, portrait, large text (body ≥ 16 px equivalent, key numbers ≥ 28 px), no timers, no reflex skill, and no screen with more than one main decision.

## 3. Design pillars

1. **一局一分钟 (one run, one minute).** A run takes 30 s to 3 min. Every screen has one obvious next tap. No stamina, no waiting, no unlocks before you can play.
2. **人人有话说 (everyone has an opinion).** Every result should invite "but why?". Stats are visible and simple, the battle log gives reasons, and 复盘 shows the best possible lineup. The verdict must be arguable, never arbitrary.
3. **同一天，同一手令 (same day, same tokens).** The daily 军令 gives everyone the same tokens and the same battlefield luck, so comparisons in a group are fair. Our randomness is fair, seeded and auditable. We never adjust outcomes per player.
4. **自愿分享，不求人 (sharing is voluntary).** Shares exist because the result is worth showing, never because the game demands it. Rewards come only from rewarded video. [COMPLIANCE]

## 4. What makes it shareable: the argument factor

The draft-and-grade format spreads through *knowledge plus disagreement*, not through the randomness itself (research 00, §3). We design for four kinds of argument:

- **"Why only 9-3?"** A famous lineup that underperforms ("诸葛亮 + 吕布 only went 9-3?!"). The log shows the cause, for example 吕布's low 信 triggering a 临阵生变 event. The cause is plausible enough to defend and debatable enough to fight about.
- **Placement arguments.** The same general scores differently by role. 关羽 as 猛将 or as 守将? 曹操 as 主公 or as 军师? Role fit is visible, so every pick is a small opinion.
- **Same tokens, different choices.** In the daily, everyone faced the same draws. "You had 周瑜 available in round 2 and took 孙权?" The group board shows lineups after you have played.
- **Stat disputes.** Our original stat set (the 五德 from 孙子兵法, see spec §3) invites fights like "张飞 only 4 in 智?" We accept and even welcome these fights; content review keeps them respectful.

Share objects: the result card (daily cards hide names to avoid spoilers), the "同签挑战" challenge card, and the group leaderboard reached from a group card.

## 5. Tone

- **Voice:** a wry 说书人 (storyteller). Short, classical-flavoured lines, easy to read: "十二战全胜，天下归心。" / "猛将如云，奈何无人运筹。"
- **Respectful to history.** We tease lineups, never the historical figures. No demeaning, vulgar or meme-ified portrayals. [COMPLIANCE: content review is subjective]
- **Warm, not hype.** No flashing "LEGENDARY!!!", no slot-machine sounds, no casino language. We use 令牌 (command tokens), not 抽卡 or 转盘.
- **Plain language.** Every term is explained once, in one line, the first time it appears.

## 6. Art direction

Mood: **a general's desk at dusk.** Rice paper, ink, cinnabar seals and lacquered command tokens. It should look calm and premium, readable at arm's length, and nothing like the busy gold-and-red look of 三国 SLG ads.

**Phase 1: 印章 monograms only.** Each general's given-name character carved as a seal, in the faction colour, on paper texture. No likeness, no style-imitation risk, tiny files. It stays as the fallback whenever a portrait fails to load.

**Final portraits: AI-generated (founder decision, spec D10).** Production starts only after a Go in Phase 1. The look is fixed in the style guide; candidates are a 水墨/工笔 half-length bust (most emotive) or a 皮影/剪纸 silhouette (distinctive, nostalgic for the 40+ audience, easy to keep consistent). Requirements:
- **Style guide** (framing, palette, line weight, costume and armour rules by era and faction) written before any generation, so 120-160 portraits read as one set.
- **Provenance log per asset:** tool and model version, full prompt, negative prompt, seed, settings, date, the generated candidates, the selected output, and every human edit. Stored alongside the asset record (not in git as binaries).
- **Human review** of every portrait before use: historical plausibility (era-appropriate dress, arms and age; no anachronisms) and a resemblance check against other games' art. No Koei 三国志 or 三国杀 lookalikes. Prompts never name another game, studio, artist or copyrighted character, and no reference sheets from other games are used. Rejected images are logged as rejected.
- **AIGC labelling:** comply with 《人工智能生成合成内容标识办法》 (in force 2025-09-01): explicit labels where required and implicit (metadata) labels in the files. The legal check is cleared (spec D14); the implementation rule is a visible label in the general detail sheet plus metadata labels in every file, and store-listing disclosure where applicable (spec §17 #16). [COMPLIANCE]
- **Human-edit trail:** keep layered or versioned working files showing the human edits (composition, paint-over, corrections). Copyright in purely AI output is uncertain in China, so documented human creative input is what supports our claim and the 软著 file.
- **Hosting:** final portraits live on CDN/cloud storage (whitelisted domain, spec §17 #12), referenced by `portraitId`, and are **not committed as plain files in git**. The repo holds only the style guide, the prompt/seed log and the asset manifest.

**Palette** (faction colours based on the 五德 tradition, deliberately not the colour sets of existing 三国 games):
- Paper 宣纸 `#F3EAD7`, ink 墨 `#1E1B18`, seal 朱砂 `#B23A2B`, gold accent 藤黄 `#C9973A`.
- 魏 赭黄 ochre `#B8862B` (土德) · 蜀 赤 vermilion `#C0392B` (汉 火德) · 吴 青 teal `#2E7D7A` · 群 赭石 umber `#7A5230` · 晋 (Phase 2) 月白 `#C9D3DD`.
- Faction is never shown by colour alone. The faction character (魏/蜀/吴/群) always accompanies it, for colour-blind users.

**Typography mood:** a 宋体/楷体 display face for titles, the record and the 评语; the system font for everything else. Display fonts must be open-licence (for example OFL fonts such as 思源宋体 or 霞鹜文楷), subset, and loaded from a subpackage, not the main package. Large sizes and high contrast throughout.

**Maps:** no real geographic map of China, ancient or modern, anywhere in the game. "一统天下" is shown with an abstract seal or banner motif. [COMPLIANCE: map content is regulated; avoid it entirely]

## 7. Audio mood

- Plucked 古琴/琵琶 for the UI. A low 战鼓 pulse during the battle reveal. A single 编钟 strike plus a short swell for 12-0.
- A token flip sounds like wood on lacquer, not a slot reel.
- Audio is short and quiet by default, with a mute toggle on home that persists. All audio loads from a subpackage. The game is fully playable muted, because many players are in public places.

## 8. Naming and branding

- **点将台** is the name. **Resolved:** the founder has cleared it for trademark and use (spec D11). The WeChat in-app name is reserved at registration.
- Never use "82-0", the NBA or any other sports-league reference, or the names, UI, terminology or stat labels of existing 三国 games (光荣/Koei 三国志, 三国杀, etc.) in the product, store listing, marketing or share copy. [COMPLIANCE]
- Branding motif: a cinnabar seal stamp with "点将" that doubles as the app icon and the 12-0 stamp.

## 9. What we will NOT do

- No IAP, no virtual currency, no purchasable re-spins, no paid randomness, no loot boxes or gacha framing, no cash or real-world prizes. [COMPLIANCE]
- No reward of any kind for sharing, inviting or group counts. No "share to continue", no share-to-unlock, no fake system-message cards, no auto-share. [COMPLIANCE: 诱导分享]
- No forced authorization: no login wall, no nickname or avatar request, no location, phone, album or contacts permissions in Phase 1.
- No energy or stamina, no daily-login rewards, no countdown pressure, no hidden rubber-banding or per-player outcome manipulation. (Unlike our `cheatshaizi` dice app, whose rolls are deliberately rigged, this game's randomness must be fair and identical for everyone.)
- No real-time PvP, no user-generated text (no custom team names or chat), no geographic maps.
- No imitation of any existing 三国 game's art, names, UI, stats or terminology. No mention of 82-0, the NBA or any other sports league.

## 10. Success metrics and phased plan

All thresholds are INFERENCE. There are no published WeChat benchmarks for this format (research 00, §4; research 03, §2.3).

The game is **三国 only**. There is no separate concept test before the build: **validation of the concept relies entirely on the Phase 1 prototype**, played in the founder's 15-20 WeChat groups, against the go/kill thresholds below.

### Phase 0: platform-API verification (before any code) — done 2026-10-14
- **Platform-API verification** was the whole of Phase 0. Findings against the official docs are in `docs/dianjiangtai/phase0-platform.md`; verdicts per item are in spec §17. They changed the design: `getGroupEnterInfo` replaces the deprecated `getShareInfo`, 微信朋友关系 must be declared with a privacy and friend-scope flow, rewarded-video fallback share pages are disabled, cloud functions need `TZ=Asia/Shanghai` and explicit timeouts, and (CTO decision C3) leaderboard ranks come from our server rather than from WeChat user cloud storage.
- The compliance/legal check is **done**: cleared by the founder on 2026-10-14 (spec D14). The entity is resolved (spec D9): the founder's Beijing (mainland China) company registers the game; game-category access, WeChat 认证, 流量主, the 微信朋友关系 privacy declaration and (Phase 2) an ICP-filed CDN domain are the founder's operational setup steps.

### Phase 1: two-week prototype (the validation)
**Phase 1 opens with a 1-2 day real-device spike** (spec §17.1). cheatshaizi uses none of the share, group-entry, cloud, open data, ad or privacy APIs, so nothing has been proven on a phone yet. The spike covers share → group entry → `getGroupEnterInfo` → cloud decrypt, open data domain rendering with friend scope, the fields on `getGroupCloudStorage` rows, rewarded video (stub or real) with the fallback share page disabled, and `genDaily` timing. Feature work on boards, sharing and ads starts once its exit criteria (spec §17.1, E1-E7) pass, or once the listed fallback is adopted with CTO sign-off. The spike is part of the two weeks.

Then: text plus monogram portraits, **32 generals** (spec Appendix B), the daily 军令, free play, result and challenge cards, group and friend boards, and stub ads if 流量主 is not ready. The founder posts the prototype into **15-20 WeChat groups** and we collect **at least 7 days** of data. The Go/Kill decision is made on these thresholds alone:

| Metric (definitions in spec §15) | Go | Kill |
|---|---|---|
| Completed runs with at least one share tap | ≥ 10% | < 4% |
| Card opens that lead to a started run | ≥ 25% | n/a |
| Completed runs per session | ≥ 3 | < 2 |
| D1 retention (new users, Beijing date) | ≥ 35% | n/a |

Between the thresholds, we iterate for at most one more week, then decide. **AI-generated portrait production (§6) starts only after Go.**

### Phase 2: full build (about 6-8 weeks after Go)
120-160 generals with final AI-generated portraits (§6), the 晋 faction and 归晋 era, 识人模式 (hidden stats), streaks, optionally 擂台赛 and updatable cards (both constrained: gift packs and client scores, fixed template text; spec §21), and production ads. Before release, the founder's setup steps (game category, WeChat 认证, 流量主; spec D9) and the release items (备案, 软著, privacy guide, per the cleared legal check, spec D14) must be in place, and release runs its normal pre-submission rules check. Launch-health targets (INFERENCE, to be set from Phase 1 data): D1 ≥ 40%, D7 ≥ 15%, and share rate kept ≥ 8% at scale.

## 11. Risks

1. **Fad and clones.** The mechanic was cloned within weeks worldwide (research 04, §4). Our moat is content quality, balance, the daily group loop and the 三国 voice, not the loop itself.
2. **Grade feels arbitrary.** If players stop believing the simulator, arguments turn into complaints. Mitigation: shared daily luck, visible role fit, reasons in the log, the 复盘 view, and tuning targets checked by a simulation tool (spec §7).
3. **Group leaderboard API behaviour on real devices.** Phase 0 confirmed in the docs that `getGroupCloudStorage` and the open data domain APIs exist (they need the 微信朋友关系 privacy declaration and `scope.WxFriendInteraction`), and that `getGroupEnterInfo` replaces the deprecated `getShareInfo` (spec §17). Nothing has run on a phone yet. Mitigation: the Phase 1 device spike (spec §17.1). If group entry cannot be decrypted, the group board shows only its explainer and the friend board is unaffected.
4. **Entity setup and 流量主.** The entity is resolved: the founder's Beijing (mainland China) company registers the game (spec D9). Game-category access, WeChat 认证 and 流量主 activation remain operational setup steps; delays block release and real ads, not the prototype (stub ads are approved for Phase 1).
5. **诱导分享 enforcement.** Cleared in the founder's legal check (spec D14). Our design avoids every share reward, which leaves little exposure; release re-checks share copy in its pre-submission rules check.
6. **Roster depth.** 32 generals (spec Appendix B) cover all 16 faction-era cells, but the thinnest cells hold only 2, so some rounds will feel repetitive over many runs. Watch draft-pick spread and runs per session in Phase 1; Phase 2 grows to 120-160.
7. **Content-review subjectivity** around historical figures (including the 临阵生变 event, reviewed before submission) and AIGC labelling and copyright for the AI-generated portraits (§6).
8. **Ad saturation.** 三国 ad creatives are dominated by SLG titles, so paid UA would be expensive. The plan is organic group spread first.
9. **IAA economics.** IAA-only money is shrinking as a share of the market (research 03, §1). The upside is capped unless we later add IAP, which brings 版号 and is out of scope.
10. **Leaderboard tampering.** The client can overwrite its WeChat cloud-storage values, and the server cannot read them back (Phase 0). Mitigation (spec C3, §11): ranks come only from our server-validated results, matched to friend and group rows by a salted per-day openid hash, so a tampered value never earns a rank. This depends on the Phase 1 device spike. If the spike fails, the fallbacks are, in order, Ed25519-signed values verified in the open data domain, then B-lite: self-reported values with the risk accepted for the no-prize prototype (spec §11.8).
11. **Daily seed generation cost.** Gate-checking candidate seeds may exceed the cloud function timeout. Mitigation: an offline seed bank as the primary source (refilled before launch and monthly), a time-boxed live generation as last resort only (if it fails, no seed is published and an alert fires), and a timeout acceptance test (spec §5.2, §7.5.1).
12. **No pre-build concept signal.** We build before any market signal on the concept. Mitigation: the prototype is two weeks, uses no art, and has hard kill thresholds.
