# WeChat mini games: social mechanics, monetization benchmarks, case studies, effort (2026-10-14)

Method note: web search returned thin 2025-2026 data for several items. Anything unsourced is marked "not found". Inferences are labelled INFERENCE. Many API/policy details come from model background knowledge and were NOT re-verified against live docs; these are marked UNVERIFIED. Several official dev-doc URLs 404 or were truncated.

## 1. Key findings
- Platform scale (fact): 500M+ MAU, ~60 min/day per user, 500k+ developers, 80+ games with 1M+ DAU, 300+ games with 10M+ RMB quarterly revenue (WeChat Mini Game Developer Conference, 2026-05-27; via https://www.ithome.com/0/956/526.htm, 2026-05-28).
- Audience is broad and casual (fact): age split under 24 = 10%, 24-40 = 50%, over 40 = 40% (same IT之家 source, 2026). Early 2025: 55% male / 45% female, >50% of MAU had no prior mobile game experience, 14-day retention >50% platform-wide (https://www.gameres.com/910385.html, 2025-01-10). INFERENCE: mass-market, older, low-gamer-literacy users favour very simple one-thumb mechanics.
- Monetization is shifting from pure IAA to IAP/hybrid (fact, secondary sources): 2025 mini-program game market 535.35亿 RMB, IAP 68.11% vs ad 31.89%, vs 2022 ad 61.19% (via https://news.17173.com/content/12252025/155022114.shtml and Game Industry Committee report as relayed in search results; figures not independently checked). Ad revenue ~170.71亿 in 2025. Still, WeChat says 300 games >10M quarterly and new 10M+ IAA games appear monthly (IT之家 2026-05-28). Pure IAA is only ~16.6% of direct-buy spend (17173, Dec 2025).
- Buying traffic is crowded: direct-buy daily spend 1.44亿 RMB in a recent quarter; creative volume >50M sets in 2025, +97% YoY; hybrid/IAP top titles crowd out mid-tier on bidding cost (17173, 2025-12). Concrete CPA/CPI for WeChat casual: not found.
- Unsourced blog benchmarks (low confidence): rewarded video eCPM 50-120 RMB, banner 8-20 RMB, ARPDAU $1-3 for combined ad formats (https://eastondev.com/blog/zh/posts/media/20260524-mini-game-monetization/, 2026-05-24, "industry data", no named source). Treat as rough only.
- Sharing is still the core social primitive but is tightly policed. Forwarding requires user-initiated action; shareTicket only works for group chats; the official doc warns that forwarding is subject to platform oversight (official doc: https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share/share.html, fetched 2026-10-14).
- Best-proven viral loops: friend-score leaderboards (Jump Jump), team/province PK (Sheep a Sheep), score-sharing (Synthesize Big Watermelon). All are 2017-2022, i.e. stale for the current platform; see risks.
- Distribution has moved toward 视频号 (Video Channel) ad-boost: IAA games acquired via 视频号 can earn up to 40% in 广告加热金 (gameres 2025-01-10).
- Package: main package hard cap 4MB (2026 build-failure reports, see below); engine separation / subpackages are the standard workaround.

## 2. Evidence

### 2.1 Social capabilities (API names)
Verified from official share doc (fetched 2026-10-14) https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share/share.html :
- Menu and forwarding: wx.showShareMenu, wx.hideShareMenu, wx.onShareAppMessage (passive, from the top-right menu), wx.shareAppMessage (active, from a button tap).
- Group identity: wx.updateShareMenu({withShareTicket: true}); recipients opening a card sent to a group get a shareTicket from wx.getEnterOptionsSync or wx.onShow; wx.getShareInfo(shareTicket) returns the encrypted group data (group id after decrypt with session key server-side, UNVERIFIED detail). Works only when the target is a group chat. Side effects: picker allows one target only; message can't be long-press forwarded again.
- Dynamic/updatable cards: wx.updateShareMenu with toDoActivityId, server-side updatableMessage.createActivityId (can show e.g. "x of y friends joined" on the card).
- Card image: Canvas.toTempFilePath / toTempFilePathSync to render a score card dynamically; the doc notes approved share images do not guarantee no problems.
- Policy line from doc: "线上的转发行为依然会受平台监管，请开发者遵守运营规范相关要求."

Not verified live (background knowledge, UNVERIFIED, re-check on developers.weixin.qq.com):
- Open data domain: wx.getOpenDataContext, openDataContext.postMessage, in the sub-domain wx.getFriendCloudStorage, wx.getGroupCloudStorage(shareTicket), wx.setUserCloudStorage, wx.onMessage. Main to sub-domain messaging is one-way (confirmed by open-source example, updated 2025-08: https://gitee.com/zzhcodes/WxOpenDataProject). Sub-domain renders to a shared canvas, cannot use network. Newer docs also push a cloud-storage alternative (user must have authorized friend-relationship data); check current availability.
- Subscribe messages: wx.requestSubscribeMessage (user must tap; one-time per grant, long-term templates only for limited categories). Realistic use: "your friend beat your score" challenge pings, only after an explicit user opt-in. Game-specific variant wx.requestSubscribeSystemMessage / game-circle messaging not checked.
- Realtime/multiplayer: wx.getGameServerManager / frame-sync "实时对战" (createGameServer-style) exists in docs historically; current status and quotas not found. For casual 30s-3min games, async challenge (ghost replays through cloud DB) is simpler. INFERENCE.
- 游戏圈 (wx.createGameClubButton) and 视频号 integration (wx.openChannelsActivity / wx.getChannelsLiveInfo, wx.createGameRecorderShareButton for share-recorded clips): existence UNVERIFIED for 2026; no 2025-2026 source found on 游戏圈 reach. gameres 2025 article does not mention 游戏圈.

### 2.2 What is allowed vs banned (诱导分享)
- Official share doc does not enumerate banned behaviours; refers to 运营规范 (operations rules). Exact current text of the 小游戏运营规范 not retrieved. Historical (2018) context: games gave small rewards (revive, skip wait) for forwarding and enforcement was inconsistent (search result; stale, >12 months).
- UNVERIFIED background: banned are forcing a share to proceed, rewarding for share to groups with a count, "share to unlock" with no skip, fake-system-text cards, misleading titles/images, automatic share. Commonly tolerated: optional share with a modest reward, "challenge a friend", result cards. INFERENCE: rewards tied to sharing are risky; prefer rewarding ad views (rewarded video) and make share optional/non-gating.
- To do: fetch https://developers.weixin.qq.com/minigame/product/ (运营规范) and confirm.

### 2.3 Monetization benchmarks
- Platform trend 2025: ad spend +20% YoY, IAA +30% (界面新闻 citing Tencent earnings; search summary, https://www.jiemian.com/article/12989195.html, date unconfirmed). Rewarded-ad viewing users +20% YoY, 900+ IAA games >1M RMB annual gross in 2024 (gameres 2025-01-10).
- 4 of 5 MAU are IAA users, ~70% play only IAA casual (as relayed by search, 2025; primary source not retrieved). Treat as indicative.
- eCPM: only the unsourced 2026 blog numbers above. Historical (stale): 2020 WeChat eCPM dipped to ~10 RMB during pandemic traffic influx (ifanr/other, old). 30s vs 15s rewarded ad eCPM +60% (2019 experiment, stale). Verified official eCPM by genre: not found.
- Revenue split for 流量主: not found in official form. The 2026 blog says platform takes 10-30% (unverified). Widely cited older figure is 50/50 for 流量主 ads (UNVERIFIED, stale); founder should read the current 流量主 settlement agreement in the MP backend. Feb 2026 incentive: a "7000万 cap" ad-monetization incentive for new games (blog, unclear terms).
- 流量主 threshold: historically 1000+ cumulative UV (old sources; check backend).
- ARPU/LTV, D1/D7 for short-session casual: not found for WeChat. Platform-wide 14-day retention >50% is a platform number, not per-game. Overseas casual D1 ~17% (Mintegral, overseas, older) not transferable.
- K-factor: not found as a published benchmark. Sheep a Sheep reportedly had viral coefficient approaching 0.7-1 (digitaling/woshipm, 2022, stale: https://www.woshipm.com/it/5615840.html).
- UA cost: no CPA/CPI for WeChat found. Qualitative: bids high for hybrid/IAP; IAA only ~16.6% of direct-buy spend, ~2400万 RMB/day (17173, 2025-12-25: https://news.17173.com/content/12252025/155022114.shtml).
- IAP/IAA/hybrid: hybrid creatives ~80% of all creatives and 4x IAA-only creative count (17173, Dec 2025). Merge ("二合") casual subgenre +150% growth in H1 2025 (https://news.qq.com/rain/a/20250625A07XSG00, 2025-06-25).

### 2.4 Case studies (all older than 12 months; stale for exact mechanics)
1. Jump Jump 跳一跳 (Dec 2017): friend-ranking leaderboard via open data domain, endless one-tap gameplay, scheduled leaderboard refresh; reported 300M+ cumulative users, 100M+ DAU peak (https://www.digitaling.com/articles/840790.html and ithome summary in search, 2017-2018). Mechanic: see friends' avatars/scores and "pass" prompts at the end screen.
2. Sheep a Sheep 羊了个羊 (Sep 2022): extreme difficulty plus province team PK leaderboards; viral coefficient reportedly 0.7-1; revive/props via share or ad. Revenue "465万/day" claim was debunked (woshipm https://www.woshipm.com/it/5615840.html, huxiu https://m.huxiu.com/article/661624.html, 2022).
3. Synthesize Big Watermelon 合成大西瓜 (2021): score sharing in social circles plus merge-puzzle shareable "almost" moments (search summary; stale). Note merge genre is still growing (+150% H1 2025).
4. Chinese Checkers/Mahjong-style group games (斗地主, 麻将) spread via group-room invites: UNVERIFIED, not researched.
Gap: no confirmed 2025-2026 title that grew mainly via social virality without UA. INFERENCE: current top IAA winners mostly rely on UA + 视频号 ad boost; pure organic virality is rare now.

### 2.5 Effort and cost
- Main package limit 4MB: confirmed by 2026 practitioner reports (5.2MB and 6.8MB builds rejected, https://eastondev.com/blog/zh/posts/dev/20260522-cocos-wechat-mini-game-build/ and https://eastondev.com/blog/zh/posts/dev/20260522-cocos-mini-game-launch-checklist/, 2026-05-22). Subpackage/total limits (historically 20MB total for subpackages; larger total for games, plus remote asset loading) NOT verified; Cocos docs: https://docs.cocos.com/creator/3.8/manual/en/editor/publish/subpackage.html (Asset Bundles become mini game subpackages, loaded on demand).
- Engine separation / engine plugin lets the engine load from WeChat servers, cutting main package (Cocos docs, above; blog 2026-05-22).
- Team size: 80% of ~400k developers are teams under 30; 80% of 500k are small/mid (gameres 2025-01-10; IT之家 2026-05-28). MVP team size/timeline: not found. INFERENCE: 1-3 people (1 dev, 1 artist, part-time design) for 4-8 weeks for a hyper-casual loop with ads + leaderboard.
- Engines: Cocos Creator (widely documented, mini-game template, engine plugin), Laya, native Canvas (smallest but most work), Unity via WeChat's Unity WebGL converter (WeChat docs; bigger packages, needs remote asset loading). Compare/verify before choosing. Current studio apps/cheatshaizi uses a mini game build; align engine with whatever it already uses. INFERENCE.

## 3. Opportunities (candidate ideas with signal)
1. Async friend challenge on an ultra-simple 30-90s score loop (merge/drop/stack), with a friend leaderboard and result card showing "X beat you" via open data domain. Signal: friend board powered Jump Jump; merge genre +150% (2025-06); older broad audience.
2. Group-room variant: shareTicket-gated group leaderboard ("this group's best") + dynamic card via updatableMessage. Signal: official share API supports group identification; Sheep a Sheep team PK.
3. Rewarded-video-first economy (revive, hint, boost) with optional share instead of mandatory. Signal: rewarded ad viewing +20% YoY, IAA +30%; share rewards carry policy risk.
4. 视频号 replay clip share for "fails/near-miss" moments as a discovery feed, feeding 视频号 ad-boost up to 40%. Signal: gameres 2025-01.
5. Adapted US hits: unvalidated here; candidate US casual formats (merge, sort puzzle, party-trivia) should be checked in 阿拉丁/DataEye top lists before building (not done in this brief).

## 4. Risks / saturation / policy
- Inducement-share enforcement: rules not enumerated; rewarding shares can get the game restricted. Social-feed visibility of game share cards also depends on platform changes. Verify current 运营规范.
- UA arms race: hybrid/IAP leaders dominate bids; pure IAA is minority of buying; small studios can't win on paid.
- eCPM figures unverified and likely vary heavily; do not budget from the blog numbers.
- Older/low-gamer audience is not necessarily the same demographic as US hit audiences; check localisation.
- Data stale: case studies 2017-2022; K-factor benchmarks old.
- IP/复制: 版号 not needed for IAA-only mini games per search summaries (stale); in-app purchases require 版号 per general rules (UNVERIFIED, check). Copycat rejections of US clones possible.
- Content/security review and ICP filing needed for release (not researched).

## 5. Open questions
- Current 流量主 revenue split and settlement terms (official).
- Real eCPM by ad type for casual puzzle games in 2026; typical D1/D7/D30 and LTV for IAA casual; UA cost per install/registration.
- Exact current text of 小游戏运营规范 on 诱导分享; does a "share for bonus" pass review?
- Is the open data domain / friend cloud storage still unrestricted, and what changed in the 2026 developer conference (2026-05-27)?
- Is 实时对战 (frame sync) still supported and priced?
- Which engine does apps/cheatshaizi use, and what is its main package size?
- Any 2025-2026 title with demonstrated organic social growth (ask 阿拉丁/DataEye)?

## Sources
- https://www.ithome.com/0/956/526.htm (2026-05-28)
- https://www.gameres.com/910385.html (2025-01-10)
- https://news.17173.com/content/12252025/155022114.shtml (2025-12-25)
- https://news.qq.com/rain/a/20250625A07XSG00 (2025-06-25)
- https://eastondev.com/blog/zh/posts/media/20260524-mini-game-monetization/ (2026-05-24, low confidence)
- https://eastondev.com/blog/zh/posts/dev/20260522-cocos-wechat-mini-game-build/ (2026-05-22)
- https://docs.cocos.com/creator/3.8/manual/en/editor/publish/subpackage.html
- https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share/share.html (fetched 2026-10-14)
- https://gitee.com/zzhcodes/WxOpenDataProject (2025-08)
- https://www.woshipm.com/it/5615840.html ; https://www.digitaling.com/articles/840790.html ; https://m.huxiu.com/article/661624.html (2017-2022, stale)
- https://www.jiemian.com/article/12989195.html (date unconfirmed)
