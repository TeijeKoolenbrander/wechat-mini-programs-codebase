# 点将台: store listing text and screenshots

Author: release. Date: 2026-10-15. Build `kept-ideas/v1` @ 3df1b89333d8d05b1d008ce57bfd29b2d1f46452 (the code is identical to 6582873). WeChat 小游戏 has no separate store page with free-form copy: the "listing" is the account's 基本信息 (name, 简称, avatar, 介绍), the optional 宣传图 and 版本更新说明 at submission, the 搜一搜 / 更多资料 page (built from those), and the share cards. All values below are final copy; registration-time fields are the same as in `registration/copy.md` (the account is already registered, so confirm rather than re-enter).

## 1. Fields and final text

| Field | Where | Value | Limit check |
|---|---|---|---|
| 名称 | registration (基本信息) | the accepted name (primary `点将台·三国`; fallbacks `三国点将台`, `点将台·每日军令`, `点将台`; `registration/copy.md` section 1) | 6-16 of 30 (CJK = 2) |
| 简称 | 基本信息, if asked | same as the accepted name | within 10 |
| 介绍 | 基本信息 | I1: 三国选将策略游戏。每日军令人人相同：翻令定势力与时代，点五将任主公、军师、先锋、猛将、守将，出征十二战评定战绩。 (alternative I4: 三国选将小游戏：每日同一道军令，翻令点五员武将，出征十二战评战绩。周日识人，另有群排行与好友挑战。) | I1 56 of 60 (studio limit; official 4-120); I4 49 |
| 头像 | 基本信息 | `registration/avatar/avatar-B-512.jpg` (PNG alternative; 1024 masters; A = the exact in-game stamp) | under 2 MB |
| 服务类目 | 类目 | 游戏 > 休闲 > (the console's closest third level; first choice 策略 if offered, else 益智) | see `rules-check.md` 4.4 |
| 版本更新说明 (version 1.0.0) | 提交审核 | see 2 | |
| 宣传图 (optional) | 提交审核 | `screenshots/01..06` and `09` (1080 x 1920) | no size is published; optional |
| 适龄提示 | 基本信息 | **12+ recommended** (founder confirms; `rules-check.md` 1.14) | |
| 分享标题 (in game, `js/share.js`) | share cards | daily: "我今日 10胜2负，同一手令牌，你敢来吗？"; 识人 Sunday: "识人军令，我 10胜2负，你认得几员将？"; free: "关羽+吕布才 9胜3负？不服来点将"; challenge: "同一手令牌，我 10胜2负，敢接战书吗？"; capsule menu: "点将台：同一手令牌，谁能一统天下？"; group invite: "点将台：同一手令牌，来比比谁能一统天下" | none promises a reward, none asks for a share, no fake system wording (AC 29-31, 50) |

## 2. 版本更新说明 (paste at submission; the console asks for it)
First submission (1.0.0):
```
首个版本：每日军令（全体令牌相同）、自由点将、十二战战报与复盘、周日识人军令、连续出征与往期回看、群榜与好友榜、同签挑战、保存战报图片、大字与高对比度显示。
```
Later updates: one short factual line each; never claim rewards.

## 3. Longer description (for 搜一搜 / 宣传 pages / community posts; not a console field)
```
五轮翻令，点五员大将，看你的阵容能不能十二战全胜、一统天下。
每天一道军令，所有人拿到同样的令牌：翻出势力和时代，从符合条件的武将里点一员，放进主公、军师、先锋、猛将、守将。出征后十二场战斗逐场写明胜负缘由，最后给出战绩与评语。同一手令牌，谁点得更高明？拿到群里比一比。
· 每日军令：全体同令，每人一次，约一分钟
· 周日识人：五德暂不显示，凭你对三国人物的了解点将
· 群榜与好友榜：战绩由服务器校验，看谁点将更高明
· 同签挑战：把同一手令牌发给好友应战
· 往期回看、连续出征、保存战报图片
· 大字模式、高对比度，适合所有年龄
· 不需要输入文字，不需要登录，没有内购
```
(Avoid in any listing: "最", "第一", "官方", "免费", "全国第一", prize or share-for-reward wording; "没有内购" is a statement of fact. The first four are checked in `registration/rules.md`. No other game's name or terms, no 三国志/三国杀/光荣, no stat words 武力/统率/政治/魅力, no SSR/抽卡: spec AC 7, 50. The listing text in sections 1-3 contains none of them; the roster texts pass `content-review.md` section 1.)

## 4. Screenshots (best screens and why)
Verified requirement: **none published for pixel size** (iaa.html, bbsh.html, nrjs.html read 2026-10-15; 备案 says only "size and version consistent"; 宣传图 is optional). Chosen: 1080 x 1920 PNG, 9:16, one renderer and one build. Files in `screenshots/` (see its README for the table):

1. `01-home__available_streak` (hook: the seal, 今日军令 card, 出征, the four doors)
2. `02-draft__flipped` (the whole game in one picture: faction + era tokens, the pool of up to eight generals, your lineup so far)
3. `03-draft__selecting` (the decision: five stats, role fit per slot)
4. `04-draft__readyToMarch` (a full lineup, 出征)
5. `05-result__done_streak` (the verdict: record, band, 评语, rarity line, lineup scores)
6. `06-result__done_12_0` (一统天下, the rare result)
7. `07-result__shiren_reveal2` and `08-draft__hidden_flipped` (识人 Sunday: hidden stats, then 五德揭晓)
8. `09-board__group_ready` (the social angle: 本群 ranking with lineup tiles)
9. `10-challenge__ready_daily` (战书)
10. `11-history__ready`, `12-historyIssue__ready` (往期)
11. `13-home__howto`, `14-home__settings_on`, `15-home__available_streak_large`, `16-draft__flipped_highcontrast` (explanation, privacy and display settings, accessibility)
12. Share cards: `share-daily-500x400`, `share-shiren-500x400`, `share-free-500x400` (5:4); `saved-daily-1000x800` is the album variant.

Recommended order for 宣传图: 02, 05, 09, 03, 06, 08. These are renders with fixture data; the real-device set replaces them after the device pass if the founder wants (the launch splash with 健康游戏忠告 + 适龄提示 cannot be rendered here).

## 5. Naming and wording checks already done
Original IP: the name 点将台 is cleared (D11); no 82-0/NBA, no 三国志/三国杀/光荣, no stat words 武力/统率/政治/魅力, no 抽卡/SSR; the 五德 stat set (智信仁勇严) is our own, taken from 《孙子兵法·计篇》 (public domain). Seal portraits are drawn in code: no likeness of any person and no AI image. "一统天下" is the in-game name for a 12-0 result, not a claim about the product, and no map appears anywhere. Ad-law words appear only in-game and as statements ("暂无广告，本次免费" toast, "最佳阵容" for the 复盘 feature); none is in the name, intro or listing (advisory in `rules-check.md` 1.13).
