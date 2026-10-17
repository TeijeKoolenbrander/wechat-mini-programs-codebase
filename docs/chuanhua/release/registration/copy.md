# 传画接龙: registration copy

Author: release. Date: 2026-10-15. Status: ready for the founder to paste (registration copy is founder-approved before submission, CLAUDE.md).
Sources: `docs/chuanhua/direction.md`, `docs/chuanhua/spec.md` (§1, §16 H1), `docs/chuanhua/decisions.md`, rules in `rules.md` next to this file, and the format of `docs/dianjiangtai/registration/copy.md`.

Counting convention: every character including Chinese punctuation. WeChat counts a Chinese character as 2 against the 名称 limit of 4-30 (so 2-15 Chinese characters). Intros follow the studio's ≤ 60 characters limit (as in 点将台 commit 6f5576e). The official page lists 4-120 for the 介绍, which I could not re-read today, so the stricter 60 stands [VERIFY, see rules.md].

Hard rule for everything below: no "最", "第一", "官方", "免费", "唯一", prize or reward wording, no share-for-reward wording (诱导分享), no other product's name. The names and intros were scanned for the banned-term list shown in rules.md §2.1: no hits.

---

## 1. Name (名称) and fallbacks

Uniqueness cannot be checked offline: the console's name check (名称检测) at registration is the only real test, so every row below is an estimate. The order is **the order to try them**: the product name first, then by likely availability (distinctive coined strings before generic ones). Same-主体 accounts may share a name, so our other apps are no obstacle.

| # | Name (名称) | CJK chars | Count (CJK = 2) | Short name 简称 (count) | Rationale | Uniqueness / genericness risk | Note |
|---|---|---|---|---|---|---|---|
| N1 | **传画接龙** | 4 | 8 | 传画接龙 (8) | The working title: "pass a drawing, chain it". | Medium | Four syllables, coined combination; 接龙 is generic (成语接龙, 群接龙), but the 传画 stem is not common. Note 接龙 is also the name of a WeChat chat feature (群接龙); no rule prohibits it, but a reviewer could ask about the relation [VERIFY]. |
| N2 | **画话接龙** | 4 | 8 | 画话接龙 (8) | Spec fallback: 画 (draw) + 话 (words), reflects the draw/write alternation. | Medium | Plausible and distinctive. |
| N3 | **一笔传一笔** | 5 | 10 | 一笔传一笔 (10) | Spec fallback: "one stroke passes to the next", the baton idea. | Low | Longer coined phrase; 5 characters (10 in the count), within limits. Most likely free. |
| N4 | **群里传画** | 4 | 8 | 群里传画 (8) | Spec fallback: says where it is played. | Medium | Descriptive; may exist. |
| N5 | **越传越歪** | 4 | 8 | 越传越歪 (8) | Our addition: the drift that is the reveal ("the more it passes, the more it warps"). | Low | Distinctive and funny; the name alone does not say "drawing", so the avatar (brush, doodle) and intro carry the relevance. |
| N6 | **传画画** | 3 | 6 | 传画画 (6) | Spec fallback; shortest. | High | 3 characters, cute but short names are usually taken or generic. Last resort. |

**Order to try:** Primary 传画接龙; then 一笔传一笔 (likely free), 画话接龙, 越传越歪, 群里传画, last 传画画. (Spec order was 画话接龙, 一笔传一笔, 传画画, 群里传画; reordered by likely availability.)

Rules applied (details and sources in rules.md): length (all candidates are 3-7 Chinese characters, count 6-16, inside 4-30); only Chinese characters, plus a middle dot only in rows that show one; no infringing, trademark-like, celebrity, political or misleading terms; not a generic-only name (each combines a stem with a qualifier or is a coined phrase); name matches the content and icon (direction §8); no "微信", "腾讯" or look-alikes.

**What to do with a rejection.** If the name is "already used" the form shows the other account; do **not** file an infringement complaint for this (7 working days plus a 7-day wait): just take the next name. If it asks for extra materials (a protected word), stop and use the next name, unless it asks for something you already hold. The name is locked before 备案 (changing it later forces a filing update, rules.md S3 5.35).

## 2. Introduction (介绍 / 简介), ≤ 60 characters

Must describe the real gameplay; review rejects vague marketing. Paste I1 unless the form shows a smaller limit.

**I1 (recommended), 49 字 (42 without punctuation)**
> 群聊传话画画：画一幅、写一句、再画一幅，每人只看上一棒，揭晓时一起看原句变成了什么。画得丑没关系。

Why: States the loop (draw, write, draw), the one rule (only the previous 棒), and the payoff (the reveal). Recommended.

**I2, 48 字 (42 without punctuation)**
> 在群里开一条接龙：你画我写，一棒传一棒，只看上一棒，揭晓时一起看原句被传成了什么。内容先审后传。

Why: Adds "内容先审后传", which tells the reviewer the UGC is pre-moderated (spec §6). Use this one if the reviewer questions UGC.

**I3, 45 字 (38 without punctuation)**
> 画一幅，写一句，接力传下去。群友各接一棒，只看上一棒，揭晓时看故事怎么跑偏。画得丑没关系。

Why: Playful and shortest; no moderation line.


## 3. Short name (简称)

Optional; 4-10 characters (Chinese = 2), must be taken in order from the full name; it need not be unique. Use the value in the table's "Short name" column for the name that was accepted. If the form does not ask, skip it. For the primary name: **传画接龙** (8).

## 4. Service category (服务类目)

- **Level 1: 游戏** (fixed when the account was registered as 小游戏; cannot change).
- **Level 2: 休闲** (editable until the first release, locked after).
- **Level 3 first choice:** 益智 (first choice) or the closest of 其他 / 休闲其他. **Fallback:** 答题, or the closest 休闲 option the console offers. Level 3 can be changed later in 资质管理 but needs a new review and a new released version.
- Why: Casual party/drawing game, no progression. Draw-and-pass games fit 休闲 in the official 评测标准 grouping only loosely (it lists 消除、答题、模拟经营、塔防、捕鱼、益智); the third level is chosen in the console [VERIFY]. Avoid 角色, 策略, 文化互动 and any 社交/社区 category.
- Qualification route: IAA route "情况二" (no virtual payment now or later): no 版号, no payment qualification; 软著 only if the name contains English or the word 软件, or the game involves brands or public figures (none here). Choose 情况二, no payment qualification (never apply for one: this game has no virtual payment, Constitution Art. 3.3).

### UGC: does 传画接龙 need extra category qualifications or materials?

**Short answer: not found in any official page reachable on 2026-10-15, but this cannot be closed offline. Treat it as NEEDS-FOUNDER (a console check, about 5 minutes, before paying for 认证).**

What is known:
- 小游戏 accounts have exactly one first-level category, 游戏; second level 休闲 etc.; the third level is where qualifications attach (S1 type.html). The 游戏 qualification review for IAA (no payment) asks for the materials the console form lists per third-level category and, for 情况二, **no 版号 and no payment qualification** (S2).
- No official page I could reach lists a separate UGC, 社区 or 社交 category for 小游戏, and none says drawing or user text inside a 休闲 game needs an extra licence. The pages reachable did not mention 用户生成内容 at all (search 2026-10-15). The older 小程序 (non-game) world does attach extra qualifications to 社交/社区/内容 categories; **do not pick any 社交, 社区, 论坛 or 内容 category** for this game: it would add qualification demands and does not match the 游戏 first level anyway.
- What the platform rules do require of UGC (运营规范, S3; clause numbers [VERIFY]): content security on user-published text and images (we use msgSecCheck and mediaCheckAsync, spec §6), a report / complaint path (spec §7.1), the ability to take content down (spec §7.2), and no prohibited content. Those are code and operations duties, not registration materials. They are all in the spec.
- The MIIT 小程序备案 step asks what internet services the product provides. Whether it asks about 互动交流 / user-published content and wants extra approval is not documented where I could read it. This is a legal question for counsel (spec H10) [VERIFY].

What the founder does at registration:
1. After the account exists (and ideally before 认证 is paid), open 设置 → 基本设置 / 首页 "去补充" → 添加类目, choose **游戏 > 休闲 > (third level)**. Screenshot the "所需资质" list shown. If it says no qualification or lists only items already covered by the IAA route, continue.
2. If it demands any licence (for example 网络文化经营许可证, 增值电信业务经营许可证 or anything about 用户生成内容) **stop and send the screenshot to the CTO**: that is a legal / money decision, not one to improvise.
3. In parallel, if you want certainty, ask 在线客服 (mp.weixin.qq.com, 帮助 → 联系客服) this exact question: "游戏 > 休闲 类目的小游戏，玩家可在微信群内绘制图画和输入文字，内容经 msgSecCheck/mediaCheckAsync 审核后仅向同一接龙的参与者展示，无公开广场，是否需要额外类目资质或材料？" Keep the reply (screenshot) for the release pack.

Materials worth having ready if the reviewer or 客服 asks (all produced by the release pack, none needs the founder to write anything): the 内容安全方案 one-pager (spec §6 and §7), the 接龙公约 and 用户协议 text, the report-flow screenshots, the moderation mock proof, the named ops owner (spec H9). 软著 is optional unless asked (spec H14).

## 5. Keywords / tags (8)

传话游戏 · 你说我画 · 群聊游戏 · 接龙 · 画画 · 搞笑 · 朋友聚会 · 休闲

The registration form has no keyword field that I could confirm; these are for later 搜一搜 / listing use [VERIFY]. Excluded on purpose: 你画我猜, Gartic, Telestrations, 传声筒 (direction §7/§8: saturated category and trademark risk), any scoring or contest wording, and 陌生人 / 匿名 words (we have no stranger features).

## 6. Compliance flags for release [COMPLIANCE]

1. UGC game: see the "UGC" section. The founder must not skip the 内容安全 setup (spec H5) or the named ops owner (H9) before submission, even though they are not registration steps.
2. Name must not suggest a guessing contest or score: none of the options does. 你画我猜 is deliberately not used.
3. Intro I2 and I3 mention only things the build does (pre-moderation, previous-棒 only). Do not claim "安全" or "绿色" absolutes.
4. **Cross-app name check** (点将台, 比一比, 传画接龙, 群友刻度盘, 语义热冷): the five names share no stem, suffix or tagline pattern, so they do not look like a series. The only shared word-part is the generic 刻度 / 比 / 传 / 热冷 inside different strings. Avatars use five different colour families (点将台 parchment and red seal, 比一比 teal, 传画接龙 orange, 群友刻度盘 purple, 语义热冷 blue-to-amber gradient). 比一比 and 点将台 both carry a cinnabar seal motif (the seal is specified in 比一比 direction §6); it is a round badge on a teal field there and a tilted square 白文 seal on parchment in 点将台, and it is not intended as a family look.
5. **Same company** (Beijing, 企业) registers all of them: same-主体 duplicates of a name are allowed, but each account needs its **own new email** (REGISTRATION-STEPS.md, step 1).

## 7. [VERIFY] items for this app

- [VERIFY] Whether a UGC / drawing game needs any extra category qualification or materials. Nothing in the official pages reachable on 2026-10-15 says it does for 游戏 > 休闲; the console's 添加类目 screen shows the exact "所需资质" for the chosen third level (see the UGC section below). Spec V12 / H3.
- [VERIFY] Whether the 小程序备案 (MIIT) form asks about 互动交流 / user-published content and wants extra material (legal; counsel check spec H10).
- [VERIFY] 接龙 in the name vs the WeChat 群接龙 feature: expected fine; confirm on the name form.
- [VERIFY] Third-level category labels exist as options.


---

## 8. Rev. 2 re-check (release, 2026-10-15): live rooms are now the default, 今日起点 is gone

Checked every file in `registration/` against spec rev. 2 (F-2 到 F-5, PO-34 到 PO-51). Result:

| Item | Finding | Action taken |
|---|---|---|
| 今日起点 | `grep` over `registration/` finds **no** mention. I1-I3 only describe the chain | none needed |
| Intros I1-I3 | True but incomplete: they describe only the "画一幅、写一句" chain and never the default live game (一局, 3-10 人, 同时在线). A reviewer who opens the game sees 开一局 first | **R1-R3 added below; use R1** (I1-I3 stay valid as fallbacks) |
| Moderation wording (§4) | The 客服 question named `msgSecCheck/mediaCheckAsync`. The build now uses the **synchronous game APIs** `mediaCheckSync` and game `msgSecCheck` (spec §6, PO-44) | question replaced (§4 below) |
| Keywords (§5) | still true; 3 added for rev. 2 | see §8.3 |
| UGC category qualification | Still **not closable offline** (re-read the official pages today, see `../beian.md` section 4, rows U1-U5: the 游戏 qualification pages say nothing about UGC). Founder console step, with a **screenshot** | HANDOFF 0, step 5 |
| Avatar, names N1-N6 | unchanged, still valid (no text, no 今日起点) | none |

### 8.1 Introduction candidates for rev. 2 (≤ 60 characters, banned-term scan clean: 最 第一 官方 免费 唯一 今日起点 你画我猜)

**R1 (recommended), 43 字**
```
群里开一局：每人选题、轮流画和猜，传给下一位，传完一起看原题变成了什么。画得丑没关系。
```
**R2, 44 字** (adds the safety line; use it if the reviewer questions UGC)
```
3到10位群友同时在线，一人一题，轮流画和猜，传完一起揭晓。内容先审后传，不满意可举报。
```
**R3, 47 字** (names both modes)
```
群友同时在线玩一局，或用慢慢传分几天传完：画一幅、写一句，只看上一棒，揭晓时看原句变成了什么。
```
Order of trying: R1, R2, R3, then I1-I3 of §2. None mentions 今日起点, rewards, scores or sharing.

### 8.2 Question for 在线客服 (replaces the §4 text)

> 游戏 > 休闲 类目的小游戏，玩家可在同一个微信群内绘制图画和输入短句（最多 16 个字），所有图片和文字在展示给其他玩家之前，先经「小游戏图片内容安全识别 mediaCheckSync」和「小游戏文本内容安全识别」同步审核，设有举报、下架和违规限制机制，无公开广场和陌生人匹配。是否需要额外的类目资质或材料？

Keep the reply (screenshot) for the release pack.

### 8.3 Keywords

传话游戏 · 群聊游戏 · 接龙 · 画画 · 搞笑 · 朋友聚会 · 休闲 · 多人同玩 · 同时在线 · 慢慢传
