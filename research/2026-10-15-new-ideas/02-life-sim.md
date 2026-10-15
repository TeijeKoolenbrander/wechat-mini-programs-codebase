# Life-sim (BitLife-style) research, 2026-10-15

Evidence caveat: web search was shallow. No 2025-26 WeChat chart data, DataEye/Aladdin figures, or Stillfront 2025 BitLife numbers were found. Anything marked INFERENCE is my judgement, not sourced. Treat saturation verdict as medium-confidence until verified in the WeChat 小游戏 search/chart UI and DataEye.

## 1. Key findings
- BitLife is a mature, durable western hit (App Store best rank #4 Games, 1.8M ratings, 4.8 stars; listing updated 2026). Owner: Candywriter, acquired by Stillfront for $74.4M upfront (up to $195M with earn-outs) in 2020. Its core loop (age up year by year, tap choices on random events, die, restart) is generic; its expression (BitLife name, UI, event text, art, "Ribbons"/challenge naming) is protectable.
- China's text life sim was proven by 《人生重开模拟器》 (2021 web game, about 200M plays in 3 days, 2-person team, ~2 weeks dev). It spawned a mobile version (published by 羽仁游戏, with ads) and many clones. Peak was 2021; this is 5 years old.
- INFERENCE: the plain "random talents -> auto-generated life -> ending card" clone is saturated in China (free to copy, original is open web, many clones). No evidence of a current chart-topping plain clone was found, which also suggests the format is not a growth category on WeChat now.
- AI-driven life sims in the West (LifeLife, Nov 2025; Infinite Life Simulation) have only a handful of ratings: no evidence any went viral. Useful dev lesson: let code own the numbers and the LLM own only text (otherwise a "5-year-old CEO").
- China AIGC rules (标识办法) took effect 2025-09-01: runtime LLM text needs labelling and platform-side declaration; realtime AI text also needs content-safety filtering. Pre-written event pools avoid most of this.
- Best unique angle is not "another life sim" but a shared/social layer on a pre-authored life: daily shared seed, friend-as-NPC, ending cards.

## 2. Evidence
West
- Stillfront acquisition, 2020, DAU 1.2M / MAU 7.8M then, 42M downloads then: https://www.pocketgamer.biz/news/73190/stillfront-group-acquires-bitlife-developer-candywriter/ (stale, 2020)
- 72M virtual lives in 12 months (2022): https://goodgamestudios.com/company/press/releases/72-million-virtual-lives-in-one-year-bitlife-impresses-internationally/ (stale)
- Rank/ratings snapshot (2026): https://apppricinglab.com/compare/apple/1374403536/933113994
- Revenue ~ $110k/day, about half ads: only an unverified podcast blurb (https://www.audible.co.jp/pd/B0FD9QBQ7P). Not reliable.
- BitLife monetization (my background knowledge, not freshly sourced): rewarded ads + interstitials, "God Mode" and Bitizen subscription, IAP for ribbons/challenges.
- AI life sims: LifeLife https://appshunter.io/ios/app/lifelife/id6755062821 (3 ratings); Infinite Life Simulation https://apps.apple.com/hn/app/infinite-life-simulation/id6503607456; LLM design note https://cynthiachen2023.itch.io/life-simulation-monopoly

China
- 人生重开模拟器 virality, 2 devs, 2 weeks: https://www.ifanr.com/app/1439503 (2021, stale)
- Mobile version via 羽仁游戏 with ads: https://www.ithome.com/0/573/967.htm (2021, stale)
- Clone examples on app stores with weak ratings (努力活着 3.4 stars / 7 ratings): https://apps.apple.com/cn/app/%E5%8A%AA%E5%8A%9B%E6%B4%BB%E7%9D%80-%E6%88%91%E7%9A%84%E5%AE%8C%E7%BE%8E%E4%BA%BA%E7%94%9F%E6%A8%A1%E6%8B%9F%E5%99%A8/id6742537442
- Xiaomi listings for 人生模拟 genre (merge-click and cartoon story variants, 2025-11): https://game.xiaomi.com/game/62377959
- WeChat chart positions, DataEye ad-creative volume for 人生 titles: not found.
- 中国式家长 / 中国式人生 status 2025-26: not found in this pass (known as Steam/mobile titles; no sourced numbers).

Compliance
- 人工智能生成合成内容标识办法, effective 2025-09-01 (explicit + implicit labels): https://www.news.cn/digital/20250902/d08b592223954340af8c02ac3d7161e1/c.html and https://www.ithome.com/0/879/710.htm
- WeChat platform AI-label/declaration notice (via 珊瑚安全): referenced in the above coverage; original not fetched.
- Specific mini-game rejection cases for life sims: not found.

## 3. Opportunities (each: signal)
1. Daily shared-seed life ("今日人生"): everyone gets the same birth/family/era and ~6-8 choices; compare endings and score in the group chat. Signal: Wordle-style daily shared state is proven in the West (my background knowledge); WeChat group ranking + share card fits. Simple: yes. Daily hook: strong (new seed daily, streak-free). Shareability: strong (same-question comparison creates talk). API: share to chat, friend cloud storage/open data context rankings, cloud function for the daily seed. Pre-authored events, so no AIGC risk. Best angle.
2. Group-chat family tree / friends-as-NPCs: group members (nickname only, via user-authorised share or joining a shared challenge) appear as classmates/spouse/boss in your run. Signal: humour from friends' names is the viral engine of 人生重开模拟器 sharing (INFERENCE). Daily hook: medium. API caution: avatars/nicknames require user authorisation; no induced sharing; no friend list API, so friends only appear if they opened the shared card. Needs a rule that being an NPC is opt-in (privacy).
3. One-decision-per-day slow life: one choice a day, 1 year per day, finish in about 80 days; compare with friends. Signal: daily return is the point; but 30s-3min session fits. Risk: retention cliff over weeks (INFERENCE); works best as a seasonal "life in 30 days" format.
4. Era-born life (e.g. 1980s 改革开放 childhood, 90s, 00s) with real-feeling milestones (高考, 下岗, 房价). Signal: 年代 nostalgia works in China (INFERENCE). Compliance risk: modern history and class satire need careful, neutral writing; avoid dynasties/real political events. Use as a skin on #1.
5. Live a friend's life (async swap): a friend's run seed + choices are replayed for you; you try to beat their ending. Signal: challenge links are native WeChat behaviour. Simple. Medium daily hook; strong 1:1 share. Good as a feature, not a standalone.
6. "What's your life ending" share card: low effort, pure share mechanic; every idea above should end with it. Not unique alone.

Protectability note: genre mechanics (age-up, stats, random events, endings) are free to use; avoid BitLife trade dress, names ("Ribbons", "God Mode", "Bitizen"), event text, and the 人生重开模拟器 talent names/text verbatim.

## 4. Risks / saturation / policy
- Saturation: plain clone = saturated (INFERENCE, see caveat). Differentiate via the shared-seed/social layer.
- Content: crime, 早恋/minor romance, gambling, drugs, suicide/self-harm, political and class satire, and 价值观导向 (the game should not glorify 躺平, violence or corruption; death/ending framing should be neutral). Keep events pre-authored and reviewed; avoid underage relationship events; make a prosocial-leaning ending set.
- Death/suicide wording: avoid methods; endings should be "life ended naturally/illness/accident" style. Do not simulate drugs or gambling as rewards.
- AIGC: runtime LLM-generated text needs visible 'AI-generated' label, content filtering (e.g. WeChat msgSecCheck / security API), and may require generative-AI filing for public-facing services (INFERENCE; verify with legal). Launch without runtime AI; if later using AI offline to draft events, human review all.
- Rejection history for life sims: not found. Mini game categories and 版号: ad-funded (IAA) mini games usually register via the 小游戏 filing route; confirm category (休闲/模拟) and that IAA-only avoids 版号 (founder's assumption, not re-verified here).
- Privacy: showing friend names/avatars requires explicit user authorisation; no forced share to unlock content.

## 5. Open questions
- Current WeChat chart/search presence of 人生 simulators; DataEye ad volume; any 2025-26 AI-life hit (e.g. on Douyin).
- Whether 中国式家长 style titles still chart, and their monetization split.
- Exact filing path and category for a text sim IAA game and any text-content security API requirements.
- Event pool size needed for daily seeds (rough guess: 300-500 events for 2+ months without repeats).
- Does the open-data-context friend ranking suffice, or do we need a cloud backend for the daily-seed leaderboard?
