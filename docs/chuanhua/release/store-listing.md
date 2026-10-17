# 传画接龙: store listing text and screenshots

Author: release. Date: 2026-10-15. WeChat 小游戏 has no separate store page with free-form copy: the "listing" is the account's 基本信息 (name, 简称, avatar, 介绍), the optional 宣传图 and 版本更新说明 at submission, the 搜一搜 / 更多资料 page (built from those), and the share cards. Registration-time values are the same as in `registration/copy.md` (section 8 is the rev. 2 correction: **the introduction is R1, not I1**).

## 1. Fields and final text

| Field | Where | Value | Limit check |
|---|---|---|---|
| 名称 | registration (基本信息) | **传画接龙** (fallbacks in `registration/REGISTRATION-STEPS.md` step 4: 一笔传一笔, 画话接龙, 越传越歪, 群里传画, 传画画) | 8 of 30 (CJK = 2) |
| 简称 | 基本信息, if asked | 传画接龙 | 8 |
| 介绍 | 基本信息 | **R1**: 群里开一局：每人选题、轮流画和猜，传给下一位，传完一起看原题变成了什么。画得丑没关系。 | 43 of 60 (studio limit; official 4-120). Does **not** mention 今日起点 |
| 头像 | 基本信息 | `registration/avatar/avatar-512.jpg` (PNG alternative `avatar-512.png`) | under 2 MB |
| 服务类目 | 类目 | 游戏 > 休闲 > 益智 (fallbacks in copy.md §4) | `rules-check.md` 1.7 |
| 版本更新说明 (version 1.0.0) | 提交审核 | see 2 | |
| 宣传图 (optional) | 提交审核 | `screenshots/02, 04, 07, 08, 03` (1080 x 2340) | no size is published; optional |
| 适龄提示 | 基本信息 | **12+** recommended; founder confirms | `rules-check.md` 2.1 |
| 分享标题 (in game) | `js/share.js` | room invite "来一局传画接龙吗？画得丑没关系"; room reveal "我们这一局，「月亮吃月饼」传成了「外星人在吃披萨」" (or, with no safe text, "我们这一局传了 5 条接龙，来看看变成了什么"); chain invite "第 4 棒等你接，看看你能猜出什么？"; chain reveal "「…」传了 6 棒，变成了「…」" | none promises a reward (spec §9); images are our art, **no user drawings** |

## 2. 版本更新说明 (paste at submission; the console asks for it)
First submission (1.0.0):
```
首个版本：群里开一局，3到10位群友同时在线，每人选一个题目，轮流画画、猜一句，传完一起揭晓；也可用慢慢传分几天传完。所有图片和文字先审核再展示，可举报。
```
Later updates: one short factual line each; never claim rewards.

## 3. Longer description (for 搜一搜 / 宣传 pages / community posts; not a console field)
```
群里开一局传画接龙：每人从3个题目里选一个，画出来；传给下一位，ta 要把你的画猜成一句话；再传下去，句子又变成画……传完一起看，「月亮吃月饼」到底被传成了什么。
· 开一局：3到10位群友同时在线，一局约3分钟，每一棒都有倒计时，时间到自动交出
· 慢慢传：不用同时在线，一条接龙分几天传完
· 画得丑没关系，越离谱越好笑；不需要会画画，不需要登录，不需要付费
· 所有画和话先经内容审核再展示，每个他人内容都可一键举报
· 只在同一个微信群内玩，没有聊天，没有陌生人
```
(Avoid in any listing: "最", "第一", "官方", "免费", "唯一", "权威", prize or share-for-reward wording, 你画我猜, Gartic, Telestrations, 传声筒, any scoring or contest wording. "不需要付费" is a statement of fact, not the banned ad-law word 免费. No claim of 绝对安全 or 绿色.)

## 4. Screenshots (best screens and why)
Verified requirement: **none published for pixel size** (iaa.html, nrjs.html read 2026-10-15; 备案 says only "size and version consistent"; 宣传图 is optional). Chosen: 1080 x 2340 PNG (360 x 780 at 3x), one renderer and one build, rendered with the game's own preview tool in a scratch copy; see `screenshots/README.md` for the table, the method and the honest limits.

Recommended order for 宣传图: 02 (pick 1 of 3 prompts), 04 (the full-screen canvas), 07 (the whole game revealed at once), 08 (step back to the prompt), 03 (the group lobby). 10-13 show the trust points (report, 公约, 玩法, delete my content).

## 5. Naming and wording checks already done
- Original IP, no brand names, no people; the mechanic is a folk game (direction §7); nothing copies Gartic Phone or Telestrations.
- Content truthfulness: the listing says only what the build does (live rooms default, 慢慢传 secondary, pre-moderation, reports). No 今日起点, no national counts, no rankings, no save-to-album, no names.
- Registration copy corrected in this pack: intros R1-R3 added (copy.md §8), the 客服 question now names the synchronous game APIs.
- Forbidden-term scan of this file's pasted text (最 第一 官方 免费 唯一 今日起点 你画我猜): clean.
