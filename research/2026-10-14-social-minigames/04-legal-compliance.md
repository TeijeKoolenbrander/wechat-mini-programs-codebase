# Legal and compliance: adapting "82-0" and similar Western casual games into WeChat mini games

Date: 2026-10-14. Author: market-researcher (legal/compliance angle). NOT legal advice. Engage PRC counsel (IP and games regulatory) before build and before release. Many sources below are second-hand (blogs, press); official texts were mostly not retrievable. Those items are marked "verify".

## 1. Key findings
1. 82-0 is a basketball roster-draft "pick'em" web game at 82-0.com. You spin a random team and decade, pick players for a starting five, and the site simulates a season, aiming for 82-0. It went viral around June 2026 after Tyrese Haliburton posted about it. Creator: Roy Saar. Israeli company PlayVault (CEO Bar Almog) has partnered with him. The iOS app lists Vaulty Studios Inc. as developer and © owner. Ownership of the app versus the web game is not reconciled in sources.
2. Verdict: path (a), a mechanic-inspired ORIGINAL game, is the legally viable path. Path (b), a license or partnership, is the safest and may be worth one email. Path (c), a direct port, is a bad idea: it has high takedown and infringement risk, and the NBA and player-name layer adds more.
3. Chinese law protects expression (art, text, UI, code, names, characters), not abstract rules or ideas. Courts have wavered on game rules. Suzhou court (Taiji Panda v Hua Qian Gu) found infringement through a set of rules plus UI similarity. The Guangdong High Court in the Lushi/SGZ case said rules are ideas. Unfair competition (反不正当竞争法) is the fallback for blatant copying. A pick-a-team-and-draft loop is a thin, generic idea (fantasy drafting, "NBA 5 pick"), so copying the loop alone is low risk. Copying UI, art, naming and copy, or the exact presentation, is where the risk sits.
4. Use of real NBA and CBA names, logos and player likenesses is the biggest hidden issue. A Chinese mini game with NBA player names and photos needs licences or it risks trademark, name-rights and portrait-rights claims. Mitigation: use fictional players and teams, or a license.
5. 版号: reported consensus (blogs, not official text) is that IAP games need one and IAA-only games do not. Only a Chinese entity can hold one. So an IAA-only social casual game is the route that avoids it. This is worth verifying with counsel because policy can tighten.
6. Hard prerequisites for any mini game, IAA included: 小程序备案 (ICP-style filing, mandatory since the 2023-2024 MIIT campaign), 软著 and self-review report (verify), privacy policy and 用户隐私保护指引, and real-name/anti-addiction integration (verify current form).
7. Foreign-founder angle: the mini game category appears effectively limited to mainland entities or individuals with a mainland ID. Overseas companies can register mini programs but reportedly not the game category (single 2026 blog source; verify). Practical routes: a mainland partner or publisher, or a WFOE or JV.
8. 流量主 (ad revenue share) needs an entity that can open it and receive payment in RMB. There is no hard official evidence that overseas entities can. Plan to take ad revenue through the mainland entity.

## 2. Evidence

### 2.1 What 82-0 is
- Apple App Store listing, "82-0.com" by Vaulty Studios Inc. Roster-building game: spin a team and decade, draft players, build five, simulate a season, goal 82-0. Copyright line is "© Vaulty Studios Inc." The listing carries no trademark notice. Apple's "Featured In" blurb calls it an "NBA team-building phenomenon"; the description itself does not say NBA. https://apps.apple.com/us/app/82-0-com/id6780195090 (fetched 2026-10-14; year of 1.0.0 shown only as "Jun 24"; likely June 2026, inference).
- Search summary of a June 2026 Tim Cato interview with Bar Almog (PlayVault): the viral turn was Haliburton's post (77-5 grade); PlayVault partnered with creator Roy Saar; leaderboards are planned. I could not open the original; the summary is via https://thednvr.com/?p=267747 and https://allchgo.com/?p=144231 (mirror sites, low quality; verify against the original article).
- Clones already exist: a football version "38-0-0" was built with Claude Code and reached #1 on the UK iOS chart. https://mobilegamer.biz/the-uks-number-one-ios-game-38-0-0-was-built-overnight-by-an-amateur-using-claude-code/ (undated in fetch). The developer says "we all took inspiration from the NBA version". Inference: the market treats the mechanic as freely re-implementable; the original owners have not (found) litigated.
- Other sites: 82-0-challenge.com exists (relationship to the creator unknown; likely another clone or fan site).
- Trademarks: no registered trademark found; USPTO/CNIPA search was not possible in my tools. Not found. Action: have counsel run CNIPA (Class 9, 41) and USPTO/WIPO searches for "82-0" and variants, and register our own mark early.

### 2.2 Chinese IP: mechanics versus expression
- 太极熊猫 v 花千骨 (Suzhou Intermediate Court, 1st instance March 2018): infringement of the adaptation right, RMB 30m damages; 29 gameplay features were substantially similar in UI layout and rules. Described as first Chinese judgment to define game rules as protectable. https://www.nbd.com.cn/articles/2018-04-12/1207462.html and https://www.tmtpost.com/6547668.html (summaries in search results; later appeal history not verified here).
- 率土之滨 v 三国志·战略版 (Guangzhou Internet Court, May 2023): found infringement, RMB 50m, but rejected the shutdown claim; found 106 rules and mechanics largely original expression. On appeal the Guangdong High Court reportedly reversed or remanded, saying game rules are ideas outside copyright; they can be protected only through concrete audiovisual expression. Final outcome and date not confirmed in my results. https://www.tmtpost.com/6547668.html, https://www.36kr.com/p/3421108241976966, https://news.pedaily.cn/202305/514517.shtml (verify with the judgment text).
- 迷你世界 case: final decision treated the matter as unfair competition rather than copyright in the game visuals, and refused to stop operation, citing the balance of interests and players. 全民枪战 v 穿越火线: the Guangdong High Court said map spatial layout under the art skin can be the core expression. April 2025 People's Court Daily report: a "re-skin" copy was held infringing, with 10m damages (game names masked; appeal outcome unknown). Source: summary of https://law.asia/zh-hans/gameplay-copyright-infringement/ and https://www.court.gov.cn/zixun/xiangqing/463511.html (search-result summaries, not read in full).
- 保卫萝卜: I did not find a judgment. Not found; do not cite it as authority until counsel confirms.
- Amended Copyright Law (2021) added a catch-all "other intellectual achievements", which some commentators say may open a route to protect rule systems (same law.asia source). This is trend commentary, not settled law.
- Synthesis (inference): 1) Idea and rules alone: low-to-medium risk and unsettled, and courts apply a substantial-similarity test across many features. 2) A close copy of the overall look, UI flow, text, assets: high risk (copyright and unfair competition). 3) A generic loop like "spin a team/era, pick 5, simulate" is thin and already cloned many times worldwide, so it is a weak plaintiff case.

### 2.3 Takedown via WeChat complaint process (侵权投诉)
- WeChat runs a rights-holder complaint channel (腾讯维权 / 微信公众平台投诉). I did not retrieve its current text; not found. In practice platforms act on a complaint with prima facie evidence, usually offline the content while the dispute is resolved, with a counter-notice route. Treat as inference from general PRC platform practice (Civil Code art. 1195 "notice and takedown"; verify with counsel).
- The mini game credit-score system penalises violations at the entity level, so a single infringement can hurt every game under our entity. https://www.woshipm.com/operate/2292651.html and others (2019 reports; may be stale).
- Mitigation: original assets and names, an asset provenance log, no use of "82-0" as title or brand without clearance, and our own trademark.

### 2.4 Real athletes, teams, leagues
- NBA marks (league, team names, logos) are registered in China; unlicensed use in a commercial mini game is high risk. I did not find the register entries (not found; check CNIPA).
- Under PRC Civil Code, individuals hold name and portrait rights (arts. 1012, 1018-1019; from knowledge, verify). Michael Jordan's 2020 Supreme People's Court win against Qiaodan shows PRC courts do protect a foreign athlete's Chinese-name rights. https://iipla.org/news/china-s-supreme-court-rules-in-favor-of-michael-jordan-in-landmark-trademark-dispute (the page shows a May 2026 date, though the ruling is from 2020 per my knowledge; treat the date with caution).
- US background: NBA 2K runs under an NBPA group licence for current players; retired players need individual deals (snippet in search results, monitoring.cctv.org, low quality).
- Inference: the original 82-0 itself probably relies on US-law fair-use-style tolerance of names and stats. That does not transfer to China. For China, use fictional rosters or license the data.

### 2.5 版号 and the IAA/IAP split
- Reported rule of thumb (2026 third-party sources): IAP mini games need a 版号; IAA-only do not; individuals cannot apply for a 版号; foreign firms cannot hold one. https://developer.aliyun.com/article/1707375 (2026-01-20), https://app.cinevva.com/zh-CN/guides/publish-wechat-douyin-mini-games (2026-07-10). Neither is an official source. China approved 1,771 licences in 2025 per the Cinevva guide.
- Official WeChat docs: the review path differs by whether virtual payment is enabled. IAA path about 13-37 working days; IAP path about 9-22 working days. Filing is required before release. https://developers.weixin.qq.com/minigame/introduction/guide/ (fetched 2026-10-14). The page does not mention 版号, 软著 or anti-addiction.
- Older 36kr report: the publishing regulator wanted mini games brought into 版号 review; unlicensed non-paying games were to be filed with the provincial bureau within 10 working days; individuals needed just 软著 and a self-review report. https://www.36kr.com/p/1723638349825 (old; likely stale, verify).
- Platform incentives in 2026 (May developer conference, secondary reports): IAP first-launch games up to RMB 50m revenue with no platform cut; IAA support gives extra 40% (30-day) or 35% (90-day) ad credits on top of a 50% cash share. https://developer.aliyun.com/article/1707375 and https://eu.36kr.com/en/p/3827371744678535. Industry data: IAP overtook ads in 2025 at 68.11% of mini game revenue (CNG report, via the first search result summary; wallstreetcn https://wallstreetcn.com/articles/3773242). Implication: IAA-only is a legally lighter path, but the money is shifting to IAP, which pulls in 版号.

### 2.6 备案, 软著, privacy, minors, content
- 备案: MIIT notice of 2023-08-04 required mobile app and mini program filing. New mini programs needed it from 2023-09-01; existing ones by 2024-03-31, with removal from 2024-04-01. WeChat offers filing support. https://www.china-briefing.com/news/china-mini-programs-app-registration-end-march-2024/. For mini games: filing is mandatory before release; enterprise entities must complete WeChat verification first (official docs above).
- 软著: commonly required in the game category review (36kr report above; verify current need). Agency cost about RMB 500-1,500 (aliyun article).
- Privacy: WeChat requires a 用户隐私保护指引 and a privacy compliance integration (official guide linked from the docs, not read). Also PIPL; cross-border transfer rules if we store data overseas. Keep the backend in China (WeChat Cloud) to simplify.
- Minors: since March 2020 WeChat mini games connect to Tencent's health system with police-database real-name checks. Time limits (per NPPA Aug 2021 rule): minors only Fri/Sat/Sun and holidays 20:00-21:00. Spending caps by age band apply to IAP. https://www.ithome.com/0/574/391.htm and others. Current integration requirements for IAA games not confirmed (not found); ask WeChat support.
- Content: no gambling-like mechanics or cash prizes. Sports "prediction" or betting framing is risky. Random draw (抽奖) and loot boxes: rules on publishing probabilities for paid random items (NPPA/ MCT) apply to IAP; avoid paid randomness. Core spin-to-draft is free and non-monetary, so low risk, but do not let ads buy "rerolls" with cash-like rewards (verify).
- Operating standards: WeChat prohibits forced actions, interrupting normal function, and rewards for sharing; group-team invites and help-a-friend are allowed. Inducing sharing ("share to proceed") is a violation. https://www.ithome.com/0/483/694.htm, official spec at https://developers.weixin.qq.com/minigame/en/product (not read in full). Design implication: a share-to-friends challenge is fine, but do not gate results behind sharing.

### 2.7 Entity types and 流量主
- Individual: free, mainland ID, mobile and bank card; reportedly no IAP and no 版号 route; ad monetization possible via 流量主 (aliyun, 2026-01). Enterprise: WeChat verification RMB 300/year; needed for IAP (aliyun).
- Overseas: reportedly may register mini programs but the game category is essentially domestic-only; mainland-ID holders abroad can use individual route; others need a mainland entity or publisher. https://app.cinevva.com/zh-CN/blog/2026-07-19-overseas-chinese-game-developers (single blog, unverified). Cinevva guide says Chinese publisher holds 版号, payments, and takes a cut.
- 流量主 old threshold: 1,000 cumulative UV and no serious violations (2018-2019 articles, probably stale). Mini game ad share about 50% (Cinevva, approximate; extra credits in 2026 as above). Which entity types can withdraw ad revenue and in what currency: not found; ask WeChat or counsel.

## 3. Opportunities
- Mechanic-inspired original: draft-and-simulate for a Chinese-relevant domain, using fictional or licensed-free subjects. Signals: the 82-0 virality, 38-0-0 and the many clones, plus social sharing (rank cards, challenge a friend) that fits WeChat's group mechanics.
- Domains with fewer licensing issues: historical or generic "all-star team" with invented players; CBA is a separate licence; football with fictional clubs; non-sport themes (Three Kingdoms heroes, cuisine, K-pop style idols, idiom) where public-domain characters avoid likeness issues. Signal: the mechanic is theme-agnostic (inference).
- Licensing approach: PlayVault is open to partnerships (Almog interview), so a China-rights licence for the mechanic and brand is plausible. Signal: they are monetising the IP now. Keep it non-exclusive and cheap, or skip it.
- Defensive: register our own mark in CNIPA Classes 9, 41 and 28 early, in Chinese and English, to pre-empt squatters.

## 4. Risks
- Unsettled game-rule law; first-instance rulings can be harsh (RMB 30m and 50m). A weak claim is still enough to trigger a takedown.
- Complaint-based takedowns hit the whole entity's credit score.
- Trademark squatting in China: "82-0" could be filed by a third party at any time. Not found whether it already has been.
- NBA, NBPA and player likeness risk if we use real names. Avoid.
- Policy drift: 版号 for IAA could tighten (sources mention tightening trend). The commercial upside is in IAP, which needs a 版号 and a licensed Chinese operator.
- Source quality is weak in this report. Official regulations were not retrieved.
- Gambling-like mechanics and sharing-induction violations in the operating standards.
- Fast-follower saturation: the mechanic was cloned within weeks globally; Chinese developers will do the same quickly (inference).

## 5. Open questions
1. Is "82-0" registered as a trademark anywhere (CNIPA, USPTO, WIPO)? Who owns the IP, Roy Saar, PlayVault or Vaulty Studios?
2. Is IAA-only 版号-exempt in 2026 per an official source (NPPA or WeChat notice)? Obtain the text.
3. Can a foreign-owned entity or WFOE register the game category and open 流量主? Which entity types can collect ad revenue?
4. What is the current 软著 and self-review requirement for IAA games on WeChat?
5. What is the exact anti-addiction integration requirement for IAA-only games?
6. Final result of the Lushi/SGZ case on rules protection, and any 2025-2026 cases on "other intellectual achievements".
7. Does WeChat's complaint process accept mechanic-only claims, and what is the counter-notice timeline?
8. Do we want to approach PlayVault for a licence, and what would they want?
