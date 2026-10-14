# China mini game saturation and gap map (2026-10-14)

Method note: web search plus page fetches. Ranking tables on 36kr are images, so only named positions are available. Several search summaries were secondary and unverified; they are flagged. Latest data found is July 2026 (monthly) and H1 2026 (half-year). No data found for Aug/Sep 2026 charts.

## 1. Key findings
- Scale: WeChat says mini game MAU is over 500M, about 60 min/day per user, over 80 games above 1M DAU, over 300 games above 10M RMB per quarter. Age mix: under 24 ~10%, 24-40 ~50%, over 40 ~40%. Platform calls 500M "near the ceiling" (fact, sources below).
- Growth has slowed. DataEye puts 2025 market at ~61B RMB (+22%, down from +64% in 2024), and forecasts 2026 above 74.5B (+22%). The GPC (游戏工委) H1 2026 mini game revenue is reported as +36% YoY, but the media gives two different totals (31.66B vs 36.16B). Verify against the original.
- Top-grossing (IAP) in July 2026 is dominated by hybrid/mid-core: 向僵尸开炮, 三国：冰河时代, 灵画师, 我的花园世界, 疯狂水世界, 无尽冬日, 镇邪人. Churn is heavy (top 100: 33 up, 42 down, 2 flat).
- Engagement (IAA-driven) chart: 羊了个羊：星球 held #1 for 11 months until 赵云与阿斗 (word-combination tower defense) displaced it in July 2026. Followers: 抓大鹅, 猪了个猪, 箭了又箭 (arrow puzzle), 套住那只羊 (Jan 2026). Rising: 搬砖没我快, 挪车真有趣 (parking-sort), 文造兵器, 小妖退退退.
- Douyin differs: 灵画师, 赵云和阿斗, 超能下蛋鸭 top the July grossing chart. 我的花园世界 topped May. 占城大师 (real-time versus battle) rose to #3 grossing in May. Douyin grows through meme and short-video distribution, WeChat through the relationship chain.
- Platform is pushing social: WeChat "社交擂台赛" component (claimed 5x share-fission efficiency, platform claim, unverified), friend assist, leaderboards, 视频号 live "好友组队挑战赛", and a planned 2026 high-performance mode for multiplayer.
- The 82-0 basketball draft game is viral in the West and in Chinese basketball circles in June 2026, but I found NO dedicated, well-known WeChat mini game. Only a GitHub-hosted web port and an unnamed mini program in a comment were seen. This looks like a gap, not confirmed absent.
- No Wordle/Connections-style daily-puzzle title was found in the WeChat charts. 汉兜 (Handle) exists as a web game from 2022. A daily shared puzzle with a shared-result format is not a visible mainstream WeChat genre. Absence in my search is weak evidence only.

## 2. Evidence
### Market and platform
- WeChat dev conference, 2026-05-27/28 (IT之家): MAU over 500M, 60 min/day, age mix, 500k+ developers (80% small/mid teams), 80+ games above 1M DAU, 300+ above 10M RMB/quarter. https://www.ithome.com/0/956/526.htm
- QuestMobile (via wallstreetcn/woshipm, May 2026): WeChat mini game MAU 654M, +32.7% (different definition from the official 500M). IAP launch incentive: up to 50M RMB revenue exempt from platform share (reported). https://wallstreetcn.com/articles/3773242
- DataEye H1 2026 buying report (2026-07-22): 43k games in market across WeChat and Douyin (+24.4%), Douyin over 20k, WeChat growth slowed, 26.8M creatives. 2026 forecast above 74.5B. https://www.36kr.com/p/3906056959825027
- GPC H1 2026 (2026-07-30): total game revenue 188.45B (+12.17%), users 684M. Mini game numbers conflict across media. https://stock.10jqka.com.cn/20260730/c678542751.shtml
- DataEye 2025 size ~61B (+22%), hybrid (混变) games ~60% of buying spend (date: Dec 2025 reports). https://www.thepaper.cn/newsDetail_forward_32682540 (summary-level; not checked in full).

### Rankings
- DataEye + 引力引擎 July 2026 charts (36kr, 2026-08-03): grossing and engagement positions listed above. Trends: word-combo tower defense wave (赵云与阿斗 -> 文造兵器, 小妖退退退); sort-elimination (parking, ant-moving), same skeleton as the earlier sand-painting hit; hybrid themes (我要当老祖 animal + cultivation + backpack; 镇邪人 horror + extraction); IP box-opening (斗罗大陆：传承). https://www.36kr.com/p/3923287949176195
- Charts are defined as: 畅销榜 mainly IAP, 畅玩榜 mainly IAA, new games get a boost (same article and https://www.36kr.com/p/3834112006973058).
- Jan and Mar 2026 engagement chart led by 羊了个羊：星球 (secondary, via search summary; not fully verified).
- Douyin May 2026: 我的花园世界 #1, 三国：冰河时代 #2, 占城大师 #3 grossing; 赵云与阿斗 and 占城大师 used as cases of rapid short-video testing. https://www.36kr.com/p/3834112006973058

### Social and sharing
- DataEye year-end analysis via 澎湃 (2026-01-20): 社交擂台赛 component, friend assist, leaderboards, 视频号 live linkage, Douyin 小火人 (claimed 100M+ DAU). Cases: 狙击外星人 "你狙我躲" (Aug 2025, 12x new users, 35% of users from social fission by Oct, 1B topic plays, 2.5M Douyin DAU); 玩到爽飞 (330M topic plays in ~10 days); 我的花园世界 (physical rewards drive Moments-sharing). Social-channel registration share 30-50% market-wide. Friend-invited users reportedly retain and pay better than paid-UA users. Forecast: friend-help in sim games, group puzzle-solving in puzzle games. https://www.thepaper.cn/newsDetail_forward_32422764
- Share-for-revive in groups is widely disliked ("群聊牛皮癣"); a sharing-with-restraint playbook exists. https://www.ifanr.com/minapp/1024520 (date not verified; likely older than 12 months, possibly stale)
- Rules: WeChat's stated position (2018 reporting, STALE, over 12 months): forced sharing, forced sharing to different groups, blocking replay, and incentive-based share abuse are punished; rewarded video (full watch, manual close) is the permitted incentive; 主体信用分 since 2019 ties penalties to the whole developer entity. I did NOT find the current official rule text. Check developers.weixin.qq.com minigame operating specifications before design. https://www.woshipm.com/pd/3613313.html
- 视频号: game recommendation tasks and live "一起玩" launched 2023 (stale, but the mechanism likely persists). 游戏圈: no 2026 sources found. https://www.ithome.com/0/694/844.htm

### Classic viral mechanics (older, background only)
- 羊了个羊 (2022): very hard level 2, share-to-group or watch ads for props, regional leaderboard; no paid UA. Source: https://jingdaily.com/sheep-a-sheep-mini-game-china-craze/ . Stale but explains the template that clones still use.
- 抓大鹅: gyroscope shake interaction as differentiator, hard second level.

### Basketball / 82-0
- 82-0 (Western): random team and decade spin, draft 5 players, simulated record from 0-82 to 82-0; modes such as HoopIQ and Cap Mode; Complex coverage; iOS app listed. https://www.complex.com/bets/a/matt-burke/82-0-nba-twitter-viral-game , https://82-0-challenge.com/
- China: TapTap post by the NBA篮球世界 mobile game (screens dated 2026-06-10) promotes "82-0 完美赛季大挑战" using a GitHub web port; a commenter mentions an unnamed mini program. https://www.taptap.cn/moment/813721498547126504
- Existing Chinese basketball titles found: NBA篮球世界 (licensed mobile card/draft game), older H5 shooters like 热血大灌篮 (2018 era, stale). No basketball title appeared in the 2026 WeChat top lists.

### Wordle-likes in China
- 汉兜 (web, 2022) and 成语 Wordle clones; emoji-grid share format. https://www.ifanr.com/app/1472781 (2022, STALE). App Store has 成语 puzzle apps (猜成语侦探, 成语接龙大闯关), which are level-based, not daily-shared.

## 3. Saturation map
Overcrowded (inference from charts and counts above):
- Sort/match elimination and 3-tile variants: 羊了个羊 line, 抓大鹅, 猪了个猪, 套住那只羊, 挪车真有趣, parking-sort and sand-sort clones. The July 2026 article itself notes the same skeleton reskinned.
- Arrow/path puzzle (箭了又箭) and "re-theme the same puzzle" IAA.
- Hybrid (混变) idle + elimination + tower defense. DataEye: about 60% of buying spend.
- Mid-core IAP: SLG (无尽冬日, 三国：冰河时代), cultivation, horror-extraction, legend-style (about 8% of spend, DataEye estimate).
- Word-combo tower defense: new but already being cloned within weeks (赵云与阿斗 -> 文造兵器, 小妖退退退).
- Merge, idle, 割草 and generic tower defense: assumed saturated but I found no sourced share figures. Not found.

Already localized Western formats: Wordle (汉兜, 成语 Wordle), arrow-puzzle style, io-like battle (占城大师 style real-time versus). Party games: 谁是卧底 mini programs exist (shop-guide source, low reliability).

## 4. Opportunities (candidate ideas, each with signal)
1. 82-0 style NBA team draft with a Chinese-localized player pool (CBA plus NBA, Yao, Kobe etc.), screenshot-share result. Signal: viral in the West; Chinese basketball users shared lineups in June 2026; no known dedicated mini game. Fit with short session and share-card. Licensing of player names/likeness is a legal risk.
2. Group-chat daily puzzle (one shared puzzle per day, group leaderboard, result grid pasted into chat). Signal: Wordle-like mini game is absent from the charts; 群排行 and 社交擂台赛 are platform-promoted; DataEye predicts "group puzzle-solving" as a social direction.
3. Async friend duel on a simple skill mechanic (flick/shoot), built on the 擂台赛 component. Signal: platform claims 5x fission; 狙击外星人 "你狙我躲" shows a social-contest hook scales (on Douyin).
4. Sports-themed hot-take or prediction mini game around NBA/CBA/World Cup events. Signal: 82-0 traction. Evidence in China: none directly. Treat as speculative.
5. Cross-genre social feature (friend assist or group solving) added to a non-saturated puzzle. Signal: DataEye 2026 forecast.

## 5. Risks
- Slowing growth and heavy churn: 42/100 fell in July, most new hits fade fast.
- Clone speed: new mechanics are cloned within weeks, so there is no moat; hybrids are being bought at scale.
- Licensing: NBA and player IP in China; Tencent holds NBA digital rights in China (not verified in this research, check).
- Sharing policy: forced or incentive sharing is penalized; credit-score system is entity-wide. Current rule text not read.
- Regulatory: mini game 版号 and publisher/ICP and 软著 requirements (not researched here). Mini game under 24 is only ~10% of users, so a youth-skewed Western format may reach older users than expected.
- Several figures are platform claims (5x fission, 100M DAU) or secondary reports.

## 6. Open questions
- Is any WeChat mini program already named for 82-0 or 篮球阵容? Needs in-app search ("82胜", "组成82-0阵容", "NBA 阵容") by a human.
- Current official wording of 分享 rules and 擂台赛 requirements; any 游戏圈 changes in 2026.
- Genre share numbers (消除/合成/放置) from the DataEye 2025 annual report; Aug/Sep 2026 charts.
- Do Wordle-likes exist in WeChat search with meaningful DAU? Needs 阿拉丁 or in-app check.
- Which GPC H1 2026 mini game revenue number is correct (31.66B or 36.16B)?
