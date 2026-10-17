# 传画接龙《用户服务协议》: DRAFT (rev. 3)

> **DRAFT. Not approved. Not published.** This is a legal document drafted by product-ux (an AI agent) on 2026-10-15. **Rev. 3 (2026-10-15)** brings every factual statement in line with the rebuilt app (spec rev. 2, decisions F-2 to F-5, PO-34 to PO-51, TD-103 to TD-140), checked against `game/core/config.js`, `core/allowance.js`, `core/room.js` and the cloud functions `report`, `deleteMyStep`, `cleanup` and `roomSweeper`.
>
> The **founder, or the founder's counsel, must review, edit and accept it** before it is shown in the game or attached to a submission. Publishing it is a founder action in the Founder Handoff (H6; counsel points under H10). Until then, the terms screen shows this draft with its draft notice, and `node tools/build-terms.js --release` refuses to build while the draft line or any 【…】 placeholder remains.
>
> JS-ready plain-text copy: `docs/chuanhua/release/user-agreement.txt`. It has the same wording, no Markdown, and its first line is a draft notice that must be deleted when the text is approved. The file contains no backticks, no `${`, no backslashes and no ASCII quotes, so `tools/build-terms.js` can convert it (or it can be pasted into a JS template literal). Highlighted clauses are prefixed with 【重要】.

## Change note: rev. 3 vs the previous draft

The previous draft was a rev. 2 `.md`. Its `.txt` was still the v1 text: one mode, 每天最多传 40 棒, no rooms, async image checks "通常几分钟", and no markers. Both files now carry the rev. 3 text below. Changes:

| Clause | Change | Build source |
|---|---|---|
| Preamble | The 公约 is shown before the **first** 开一局 / 加入 / 慢慢传 / 接棒, and again after a material change (it was worded as if shown every time) | spec §8.2 |
| §一.2 | Live room: up to 4 rounds after the prompt; nobody works on the same chain twice; final step first; 再来一局 never pulls anyone in. 慢慢传: works with 2 players | config `room.maxRounds` 4; spec §3A.4, §8.8; PO-46 |
| §一.3 | The lobby closes after 30 min idle; one room at a time | config `room.lobbyIdleMin`; spec §3A.9 |
| §一.4 | Teaser split by mode: 慢慢传 = prompt, last sentence, count; 开一局 = number of chains, each 起点 → 终点, 「（一幅画）」 if the end is a drawing | spec §3A.8, §8.10 |
| §一.6 | Live round 0: at time-up the selected (else first) rolled prompt is used; an own prompt counts only if already sent and passed | spec §4.2, TD-106, TD-132 |
| §一.7 【重要】 | Forced send restated. Added: in 慢慢传, a player who leaves without sending loses the 棒 after about 2.5 min (it reopens, no marker) | spec §3.5, §5.8; config `chain.claimTtlMs` 150 s |
| §一.8 | Timers now listed for 慢慢传 too. Added: 20-min game cap; a started game is never cut off by the 80-turn cap; 3-棒 cap includes markers. **80 棒 per day** (the old `.txt` said 40), 10 rooms created, 30 joined | config `allowances`, `room.gameMaxMin`; allowance.js; spec §3.9 |
| §一.11 | Ads: none on the pick, draw, describe, lobby or round-wait screens; the interstitial appears only when leaving a reveal | PO-49 |
| §一.12 | Prompt bank: AI-drafted (all of it, v1 included). The human-review words are now a **placeholder**, because they are true only after H13 | content-review.md §5 ("Human review (H13) NOT DONE"); spec §4.3 |
| §二.1 | Added "last action time in a game" to the identity uses | spec §15, privacy-notes |
| §四.1 | Synchronous checks: drawings usually within seconds; a check with no answer after about 5 s counts as not passed (no strike) | config `moderation.imageSyncTimeoutMs` 5000; spec §6.3 |
| §四.2 | **New:** work blocked before time-up and not changed is sent as an empty turn at time-up, so it shows 「（没来得及画/写）」 and is not checked again. Busy, timeout and local rejection at time-up are covered as well as blocks. Blocked content is never shown to other players; the evidence is admin-only until §九 | ctl-turn.js `payloadOf` (TD-132), TD-110, TD-111 |
| §四.6 | A game ended early by a switch fills its unsent turns with markers | spec §6.8, TD-113 |
| §四.7 | Markers cannot be reported or deleted, and do not count toward the daily 棒 | spec §5.8 |
| §五.1 | Report points by mode: live round = only the source you are working on, and never a rolled prompt or a marker; after the reveal = participants; 慢慢传 teaser = participants and group members; **room teaser = WeChat 投诉 only** | `report` function, TD-119, TD-139(2); live round: TD-140 (`report {roomId, reportRef, reason}`, shipped; it closed TD-134) |
| §五.2 | The timer keeps running while the report sheet is open; at time-up the sheet closes and the turn is sent. What happens to hidden content: not shown to other players, cannot be deleted by the author, kept until §九. A reported custom prompt: the prompt is hidden for everyone (慢慢传: the whole chain); in a live round, drawings already made from it and passed keep being passed on | spec §7.1, §6.4; `deleteMyStep` (passed steps only); QA-R2-5 (CTO decision) |
| §六.1 | No strike also for busy, error or timeout, and for markers | spec §7.3 |
| §八.1 | Deletion applies to passed, not hidden steps. 「删除全部」 skips a game still running | `deleteMyStep` |
| §八.6 | **New:** hidden or removed content follows §九, not §八 | `deleteMyStep`, `cleanup` |
| §九 | "180 天内删除" → kept 180 days, then deleted in the daily clean-up (the code deletes **after** 180 days, not before). Rooms named. Sync records 1 day after a game ends **or closes**; never-started lobbies 1 day after closing | `cleanup` (rooms by `createdAt`, chains, steps, PNG, mod_traces, mod_log ...); `roomSweeper` (`signalKeepMs` 1 day) |
| §十一.3 | Ad placement wording aligned with §一.11 | PO-49 |

## Placeholders the founder must fill in

| Placeholder | What goes there |
|---|---|
| 【运营主体名称】 | The full legal name of the company that owns the AppID (spec H1: the Beijing company) |
| 【运营主体注册地址】 | Its registered address |
| 【联系邮箱】 | A monitored contact email for agreement, content and minors questions |
| 【生效日期】 | The date the approved version takes effect, which is also the "updated" date |
| 【运营主体所在地】 | The place whose people's court has jurisdiction (§15), normally the operator's registered district, e.g. 北京市某区 |
| 【H13 审核完成后填入：并经人工逐条审核修改】 (§一.12) | **Only after the H13 human review of the whole bank is signed** (`docs/chuanhua/content-review.md` §5.5), replace it with 「并经人工逐条审核修改」, so the sentence ends 「……在人工智能辅助下起草，并经人工逐条审核修改。」. Until then the claim is false. Submission waits on H13 anyway (spec §4.3). |

## Notes for the founder and the CTO (not part of the agreement)

> Change note (2026-10-16, TD-152): 换一批 limit in §一.6 changed from 1 to 5 per pick (spec rev. 2.1, TD-151). Only that fact changed; still DRAFT, no rulesVersion bump (unpublished 第 1 版).

**Every promise traces to the spec or the build:**

| Agreement clause | Source |
|---|---|
| Live rooms (default): 3-10 players from one group, joined via the group's card, up to 4 rounds after the prompt, nobody gets their own chain or the same chain twice, all revealed at once to the members seated at the start, final step first | spec §3A.1-3A.4, §3A.8; config `room` |
| Lobby closes after 30 min idle; game force-finished 20 min after start; one room at a time; 再来一局 moves nobody | config `room.lobbyIdleMin`, `room.gameMaxMin`; `roomSweeper`; spec §3A.9, §8.8 |
| 慢慢传 (async): group-only chains, 6 棒, 48 h, only the previous 棒 visible, participant-only reveal, 2 players are enough; teaser = prompt, final sentence, count | spec §3.1-3.7, §8.10; config `chain` |
| Room teaser = chain count, 起点 → 终点 or 「（一幅画）」 | spec §3A.8, §8.10 |
| Prompts rolled at random on the server, 3 from 3 categories, up to 5 换一批 per pick, own prompts allowed and checked; live round 0 fallback to the selected or first rolled prompt | spec §4.1-4.2; TD-106, TD-108, TD-132; config `roll` |
| Time-up: the turn is sent automatically; empty turns show 「（没来得及画）」/「（没来得及写）」; a turn not passing at time-up shows 「（这一棒没传过来）」 (live) or the 棒 reopens (慢慢传); unchanged blocked work goes out as an empty turn | spec §5.8; TD-110, TD-132; `ctl-turn.js#payloadOf` |
| 慢慢传: a player who disappears loses the claim after 150 s, the 棒 reopens, no marker | spec §3.5; config `chain.claimTtlMs` |
| No names or avatars; identity is the OpenID; the lobby shows numbered seats | spec §7.6, §15, AC 73-74 |
| Daily numbers: 3 + 2 慢慢传 starts, 10 rooms created, 30 joined, 80 turns (markers excluded; a started game is never cut off), 3 棒 per person per chain (markers included); timers 30 s / 60 s / 45 s | config `allowances`, `room`, `timers`, `chain.maxPerPerson`; allowance.js `checkRoomCreate` / `checkRoomJoin`; spec §3.4, §3.9 (config can change them, hence "以游戏内显示为准") |
| Pre-moderation, fail closed, drawings rendered from strokes and checked **synchronously** before delivery (5 s cut-off, busy = not delivered, no strike); in the fallback mode about 1 h until void and live rooms off | spec §6.2-6.3, §6.9-6.10; config `moderation` |
| Blocked content never reaches other players; evidence (PNG, text copy, verdict) admin-only for 180 days | spec §6.2 item 4; TD-111; `cleanup` |
| Room presence (joined, left, last action) and prompt roll history | spec §15; privacy-notes |
| Human review of reports and random samples | spec §7.2 (`listReports`, `sample`) |
| Report points: live source of the current turn only (custom prompt yes, rolled prompt and markers no); 慢慢传 source while holding the claim; every step after the reveal (participants); 慢慢传 teaser (participants and group members); room teaser only via WeChat 投诉 | `cloudfunctions/report/index.js`; TD-119, TD-139(2); live round via the opaque `reportRef` on the player's own source, TD-140 (spec §7.1, §13.2) |
| Report reasons, instant hide, 10 per day, one per item, not own content, reporter anonymous; timer not paused | spec §7.1; config `allowances.reportsPerDay`, `reports.reasons` |
| Strike ladder (1 warning, 2 → 24 h, 3 → 7 d, ≥ 4 → 30 d plus admin review, possibly permanent), 30-day window; `review` verdicts, local rejections, busy errors, voids and markers give no strike; a restriction that starts mid-game takes effect after that game | spec §7.3; config `strikes` |
| Licence limited to display within the game or chain, its participants and its group; drawings never in share images | spec PO-7, PO-24, PO-47, §9, §15 |
| Deletion: one step or everything; passed and not hidden steps only; not markers; not while a live game is running ("all" skips them); evidence kept admin-only until 180 days; custom prompt text is not deleted with the chain | spec §7.4; `cloudfunctions/deleteMyStep/index.js` |
| 180-day retention (deleted by the daily 04:00 `cleanup` once older than 180 days): rooms, chains, steps, PNGs, mod traces and logs, reports, reactions, subscribe grants, audit log, events; inactive players, group members and group stats after 180 days; room signals 1 day after a game ends or closes; never-started lobbies and abandoned chains after 1 day; aggregates kept | spec §7.5; `cloudfunctions/cleanup/index.js`, `roomSweeper/index.js`; config `retention`, `room.signalKeepMs` |
| No reveal notice between 22:00 and 08:00 | spec §7.6, §10.3; config `quietHours` |
| Rewards have no cash value; no IAP and no virtual currency; sharing grants nothing; no ads in pick, draw, describe, lobby or round wait; interstitial only when leaving a reveal | spec §9, §11; PO-49 |

**Build dependencies (CTO):**
1. **H13 (prompt bank human review).** See the §一.12 placeholder above. `build-terms.js --release` fails while it remains, which is the intended gate.
2. **Moderation wording (§四) depends on the device pass (spec V16).** If `mediaCheckSync` is not available and `imageMode: 'async'` is used, live rooms are off. In that case, replace §四.1's drawing bullet with "通常几分钟出结果". §四.3's fallback sentence then applies.
3. **WeChat's own complaint menu (§五.1, §五.6).** The text points to WeChat's 投诉 entry in the capsule menu, and the room teaser relies on it (TD-139(2)). Confirm that it is present for this mini game during the device pass. If it is not, delete those sentences and give non-members another route (e.g. 「设置 · 反馈」).
4. **Regenerate and re-confirm.** After any edit to the `.txt`, run `node tools/build-terms.js` (TD-88). `rulesVersion` is already 2 (TD-118). Nothing has been published yet, so this rev. 3 needs no further bump. Any edit after the first publication that changes rights or duties needs a bump (§十三.2, RELEASE.md).
5. **Version line (decided, CTO 2026-10-15).** Keep 「第 1 版」. The published agreement version counts the versions shown to users, and nothing has been shown yet. `rulesVersion` (2, TD-118) is an internal re-consent counter. The two are independent by design, so they are not to be aligned.

**Closed:** live-round reporting (§五.1 first bullet, the live sentence of §五.2). TD-140 shipped it: the player's own `getRoom` source carries an opaque `reportRef`, and `report {roomId, reportRef, reason}` derives chain and step from the caller's seat on the server. This closed TD-134, so §五.1 and §五.2 no longer depend on a build fix.

**Closed:** reported custom prompt in a live round (§五.2). Ruling (CTO): the agreement never promises more than the build does. The old sentence 「如果被举报的是自己出的题目，整条接龙会被隐藏。」 was broader than the live-round behaviour. The CTO decided on QA-R2-5 (spec §7.1) that drawings already made from the prompt are not retracted, because each passed its own image check. §五.2 now reads 「如果被举报的是自己出的题目，这个题目会对所有人隐藏（在「慢慢传」中，整条接龙会被隐藏）；在「开一局」中，已根据它画好并通过审核的画仍会照常传下去。」 in both the `.md` body and the `.txt`. The bracket keeps the 慢慢传 whole-chain rule, which still holds. Regenerate `terms-text.js` (item 4).

**On-device data:** the agreement names only server-side records (§二.1, §九). Data kept on the phone only (the unsent-turn draft, the ids of reveals already watched (`revealsSeen`), settings and counters) is described in the 《用户隐私保护指引》 (`privacy-notes.md`, spec §15), not here.

**Points for counsel (H10):**
- Retaining evidence of blocked, hidden and author-deleted content for up to 180 days (§四.2, §八.3, §八.6, §九).
- Wording on minors under 14 (§十).
- Jurisdiction (§十五).
- AIGC wording for the prompt bank (§一.12; whether a label is needed, spec §4.3).
- Highlighting of 格式条款 under 《民法典》第四百九十六条. Clauses that limit liability or impose consequences are **bold** below; in the `.txt` they are prefixed with 【重要】 so the renderer can emphasise them.

**Deliberately not promised**, because the build doesn't do them:
- reply deadlines;
- account deletion (there is no account; inactivity deletion applies);
- data export;
- age verification;
- penalties for false reports beyond manual restriction;
- any appeal outcome;
- that a dismissed report always restores the content (it stays hidden if restoring would break an open chain, spec §7.2);
- deletion exactly on day 180 (the sweep is daily and resumes the next day if it runs out of time).

---

# 传画接龙用户服务协议

版本：第 1 版　更新日期：【生效日期】　生效日期：【生效日期】

欢迎使用「传画接龙」！

本协议是你与【运营主体名称】（以下简称「我们」）之间关于使用「传画接龙」微信小游戏（以下简称「本游戏」）的约定。《接龙公约》是本协议的一部分。

**请你仔细阅读本协议，尤其是用加粗标出的条款：违规处理、内容授权、内容保存、免责与责任限制、争议解决。**

你第一次开一局、加入一局、开一条接龙或接一棒之前，我们会展示《接龙公约》；本协议有重大变更时，我们会再次展示（见第十三条）。你点击「同意并开始」，即表示你已阅读并同意本协议。如果你不同意，可以点击「先看看」，不参与创作。

如果你未满 18 周岁，请在监护人的陪同下阅读本协议，并在监护人的同意和指导下使用本游戏（见第十条）。

## 一、服务说明

1. 本游戏是运行在微信内的「传画」小游戏。一条接龙从一个起点题目开始，按「画一幅、猜一句、画一幅……」交替传下去。每一位接棒的人只能看到上一棒：上一棒是一句话，就把它画出来；上一棒是一幅画，就用一句话说出画的是什么。传完后，大家一起看这句话变成了什么。
2. 本游戏有两种玩法：
   - 「开一局」（默认）：同一个微信群里的 3 至 10 位群友同时在线一起玩。每人选一个题目，开始一条接龙；之后每一轮（最多 4 轮），每人同时接另一条接龙的上一棒，谁都不会接到自己开的那条，也不会两次接到同一条。最后一轮结束后，这一局的所有接龙同时揭晓，先看每条的最后一棒，再一步步往回看。揭晓后可以点「再来一局」开新的一局，其他群友需要自己点击加入，不会被自动拉进来。
   - 「慢慢传」：一条接龙由一个起点题目和 6 棒组成，群友不用同时在线，可以在 48 小时内一棒一棒地接，两个人也能玩。
3. 每一局、每条接龙只属于一个微信群。只有通过该群里的卡片进入过本游戏的群成员，才能加入这一局或接这条接龙。一局开始后，其他人不能再加入；等待开局时 30 分钟没有动静，这一局会自动关闭。你同一时间只能在一局中。本游戏没有公开的广场、陌生人匹配、聊天或私信功能。
4. 进行中，每个人只能看到自己要接的上一棒。揭晓后，完整内容只对参与者可见：「开一局」的参与者是开始时已加入的群友（包括中途离开的）；「慢慢传」的参与者是起点人和每一棒的作者。其他人打开揭晓卡片，只能看到文字预告：「慢慢传」显示起点题目、最后一句话和传了几棒；「开一局」显示有几条接龙，以及每条的起点和终点（终点是画时显示「（一幅画）」）。
5. 本游戏不显示昵称和头像。每一棒只显示「第几棒」，你自己的那一棒会标出「你」；等待开局时，只显示座位编号。
6. 起点题目由本游戏从题库中随机抽出 3 个供你选择，你可以换一批（每次选题限 5 次），也可以自己出题（自己出的题目同样需要审核）。在「开一局」中，如果选题时间到了，会使用你选中的题目，没有选中的就用抽到的第一个；自己出的题目只有在时间到之前交出并通过审核，才会被使用。
7. **每一棒都有时间限制。时间一到，你画好或写好的内容会自动交出，之后不能再修改。** 如果时间到时什么都没画、没写，这一棒会显示「（没来得及画）」或「（没来得及写）」，接龙照常传下去。在「开一局」中，如果你的内容在时间到时没有通过审核或没能及时送达，这一棒会显示「（这一棒没传过来）」；如果你中途离开一局或断线，你之后的回合会被自动跳过，这一局会照常进行。在「慢慢传」中，如果你接了一棒却中途退出、没能交出，大约 2 分半钟后这一棒会重新开放给群友来接。
8. 本游戏的基本规则（以游戏内显示为准，我们可能根据运营需要调整）：
   - 「开一局」：3 至 10 人，房主点击「开始」后开局；选题限时 30 秒，画一棒限时 60 秒，猜一句限时 45 秒；一局开始后最长 20 分钟，到时还没交出的回合按「没来得及」处理，并直接揭晓；每人每天最多开 10 局、加入 30 局；
   - 「慢慢传」：画一棒限时 60 秒，猜一句限时 45 秒；每天可以免费开 3 条接龙，看完激励视频最多再开 2 条；同一条接龙中，每人最多接 3 棒（自动显示「没来得及」的也算），且不能连续接两棒；一条接龙要在 48 小时内传完，传了 4 棒及以上的，可以提前揭晓或到期揭晓，不足 4 棒的，到期后视为没传完；
   - 两种玩法合计，每天最多交出 80 棒（自动显示「没来得及」的不计）。达到上限后不能再开局或加入新的一局，但已经开始的一局可以玩完。
9. 本游戏免费提供，通过广告获得收入。激励视频的奖励（多开一条「慢慢传」接龙、当天使用的「今日彩笔」）只能在本游戏内使用，没有现金价值，不能转让、兑换或提现。本游戏不出售任何道具，也没有虚拟货币。
10. 分享卡片（邀请群友、接龙卡片、揭晓卡片）完全自愿。分享不会获得任何奖励，不分享也不影响你参与。
11. 「揭晓时提醒我」（仅「慢慢传」）是自愿订阅的一次性提醒。22:00 至次日 08:00 之间揭晓的，提醒会推迟到 08:00 发送。
12. 题库中的预设题目由我们整理，这些题目在人工智能辅助下起草，【H13 审核完成后填入：并经人工逐条审核修改】。本游戏不向你提供人工智能生成内容的功能。

## 二、你的身份和个人信息

1. 本游戏不需要注册账号。我们通过微信为本游戏分配给你的标识（OpenID）识别你，用于记录你画的、写的内容，你在一局中的座位、加入和离开情况以及最近一次操作的时间，每天的次数和违规记录，以及最近给你抽过的题目（避免重复）。
2. 我们不收集你的昵称、头像、手机号、位置、通讯录或相册。我们如何处理你的信息，请阅读《用户隐私保护指引》（在接龙公约和「设置」中可以打开）。
3. 你应当对通过你的微信账号在本游戏中的行为负责。

## 三、内容规范

你在本游戏中画的画、写的一句话、自己出的题目，统称「你的内容」。你的内容会被群友看到，请遵守法律法规（包括《网络安全法》《网络信息内容生态治理规定》《未成年人保护法》等）、《腾讯微信软件许可及服务协议》及微信小游戏平台的运营规范。

**你不得画出或写出以下内容：**

1. **政治类**：反对宪法基本原则、危害国家安全和统一、损害国家荣誉和利益的内容；国家领导人和其他真实政治人物；国旗、国徽、地图等国家标志；政治事件和政治口号。
2. **色情低俗**：裸体、性器官、性行为、性暗示；任何涉及未成年人的性内容。
3. **暴力血腥恐怖**：杀人、伤害、虐待；自残、自杀；枪支等武器；恐怖主义、极端主义。
4. **辱骂攻击和歧视**：侮辱、诽谤、威胁他人；因地域、民族、种族、宗教、性别、残障、性取向、年龄、职业、长相等歧视或嘲笑他人。
5. **违法活动**：赌博、毒品、诈骗、违禁品，以及教唆、宣传这些行为。
6. **广告和联系方式**：微信号、QQ 号、电话、群号、网址、二维码等联系方式或引流信息，以及推销、广告。为保护未成年人，含 5 位以上数字、网址或联系方式字样的文字，会被直接拦截。
7. **侵犯他人权益**：未经同意画出或写出他人的真实姓名、隐私或肖像；侵犯他人著作权、商标权、名誉权等合法权益。
8. **宗教和迷信**：宣扬邪教、封建迷信的内容。
9. **谣言和虚假信息**。
10. **其他违反法律法规、公序良俗或微信平台规则的内容。**

你也不得：

- 用谐音、拆字、变形图案等方式绕开审核；
- 使用外挂、脚本或其他非正常方式参与；
- 恶意举报他人；
- 试图获取不应由你看到的接龙内容。

## 四、内容审核

1. **先审后传。** 你的内容在通过审核之前，除你自己以外，任何人都看不到。
   - 一句话和自己出的题目：会先经过本游戏的文字检查，再由微信提供的内容安全服务即时检测。
   - 画：我们的服务器会根据你的笔迹生成一张图片，提交微信内容安全服务即时检测，通常几秒内出结果；大约 5 秒内没有结果的，按没有通过处理，但不记违规。
2. **审核没通过的内容不会传出去，其他群友也不会知道原因。**
   - 时间还没到时没通过：你可以在剩下的时间里修改后重新交出。如果你没有修改，时间到时这一棒会按没画、没写处理，显示「（没来得及画）」或「（没来得及写）」，不会再次提交审核。
   - 时间到时没通过（包括审核繁忙、出错或超时）：在「开一局」中，下一位会看到「（这一棒没传过来）」；在「慢慢传」中，这一棒会重新开放给群友（包括你）来接。
   - **没通过审核的内容不会展示给其他任何玩家。审核用的图片、文字副本和审核记录仅供我们的管理人员处理内容安全事务时查看，到第九条规定的期限后删除。**
3. 审核服务繁忙或出现故障时，内容不会传出去（在「开一局」中会显示「（这一棒没传过来）」）。如果即时检测暂时不可用，我们可能暂停「开一局」，只保留「慢慢传」；这时一幅画可能需要几分钟才有结果，如果长时间（约一小时）没有审核结果，这一棒作废，不计入你的次数。
4. 机器审核可能出错，可能把正常内容拦下，也可能漏过违规内容。如果你认为审核有误，可以通过「设置 · 反馈」告诉我们。
5. 为了内容安全，我们的工作人员会人工查看被举报的内容，并抽查已通过审核的内容。
6. 遇到内容安全风险、服务故障或维护时，我们可以暂停开局、开新接龙和接棒，提前结束正在进行的一局（还没交出的回合按「没来得及」处理，已交出的内容照常揭晓），或暂停展示内容。
7. 「（没来得及画）」「（没来得及写）」「（这一棒没传过来）」是本游戏自动显示的固定文字，不是任何人的内容，不能举报或删除，也不计入每天的棒数。

## 五、举报

1. 看到不合适的内容，请点「举报」，并选择理由：色情低俗、政治敏感、辱骂攻击、广告引流、其他不适。可以举报的地方包括：
   - 「开一局」进行中：你正在接的那一棒的上一棒（群友自己出的题目也可以举报；随机抽到的题目不能举报）；
   - 「慢慢传」中：你接这一棒时看到的上一棒；
   - 揭晓后：参与者可以举报其中的每一棒；
   - 「慢慢传」揭晓预告中的文字。如果你不是某一局的参与者，看到「开一局」的揭晓预告中有不合适的文字，请使用下面第 6 项的微信投诉功能。
2. **举报提交后，该内容会立即对所有人隐藏。** 在「开一局」中，你会看到「（该内容已被举报隐藏）」，可以继续自由发挥完成这一棒；举报时计时不会暂停，时间到时举报窗口会关闭，这一棒照常自动交出。在「慢慢传」中，如果被举报的是一条进行中接龙的最新一棒，这一棒会重新开放给群友来接。如果被举报的是自己出的题目，这个题目会对所有人隐藏（在「慢慢传」中，整条接龙会被隐藏）；在「开一局」中，已根据它画好并通过审核的画仍会照常传下去。**被隐藏的内容不再向其他玩家展示，作者会看到「这一棒已被举报隐藏」，不能再自行删除；相关记录到第九条规定的期限后删除。**
3. 我们不会向任何人透露举报人。
4. 每人每天最多举报 10 次，同一内容只能举报一次，不能举报自己的内容。
5. 我们会核实举报。举报成立的，内容保持隐藏，并对作者记违规一次；不成立的，内容可能恢复显示。
6. 你也可以通过微信提供的投诉功能（右上角菜单中的「投诉」）向微信平台投诉。
7. **对于恶意举报等滥用行为，我们可以限制相关用户参与接龙。**

## 六、违规处理

1. **以下情况，每次记违规一次：**
   - 你的内容被微信内容安全服务判定为违规；
   - 举报经我们核实成立。

   以下情况不记违规：被本游戏文字检查直接拦截的、审核结果为「需复审」的、审核服务繁忙、出错或超时的、审核超时作废的，以及自动显示的「没来得及」等固定文字。
2. **违规次数按最近 30 天计算：**
   - 1 次：下次打开游戏时提醒你遵守接龙公约；
   - 2 次：限制参与 24 小时；
   - 3 次：限制参与 7 天；
   - 4 次及以上：限制参与 30 天，并由我们人工复核。情节严重的，可以永久限制。
3. **被限制期间，你不能开局、加入一局、开接龙、接棒或提交内容**，但仍然可以查看你参与过的揭晓、「我的接龙」和「设置」。限制开始时你正在进行的一局，可以玩完。限制针对的是你的微信账号在本游戏中的身份。
4. **我们可以隐藏违规的单棒内容，移除整条接龙或整局。** 涉嫌违法犯罪的，我们会依法保存有关记录，并向有关主管部门报告。
5. 如对处理结果有异议，可以通过「设置 · 反馈」联系我们。

## 七、内容的权利和授权

1. 你的内容的著作权归你（或依法享有权利的人）所有。
2. **为了运营本游戏，你授予我们一项免费、非独占的许可，在本协议约定的保存期限内，仅在以下范围内使用你的内容：**
   - 存储你的内容，根据你的笔迹生成审核用图片，并提交微信内容安全服务检测；
   - 把你的内容展示给同一条接龙中接下一棒的群友，并在揭晓时展示给这一局或这条接龙的参与者；
   - 如果你的一句话是揭晓时的最后一句话，或者你自己出的题目是起点题目：这些文字会出现在揭晓预告、「本群接龙」列表，以及参与者主动分享的揭晓卡片中，打开的人（通常是同一个群的成员）可以看到；
   - 处理举报、人工抽查和依法留存记录。

   为提供上述服务，我们使用微信云开发和微信内容安全服务，它们按照微信的规则处理相关数据。
3. **我们不会：**
   - 把你的画放进分享卡片的图片；
   - 把你的画展示给这一局或这条接龙的参与者以外的人；
   - 把你的内容用于广告宣传；
   - 出售你的内容。

   「本群一共玩了多少局」这类统计只是数字，不包含你的内容。
4. 你保证你的内容是你自己创作的，或者你有权这样使用，不侵犯任何人的合法权益。
5. 群友可能截屏保存他们看到的内容，这超出我们的控制范围。请不要画出或写出你不希望被群友看到或保存的内容。
6. 本游戏的名称、界面、美术、预设题目和程序等，相关权利归我们或相关权利人所有。

## 八、删除你的内容

1. 在「我的接龙」中，你可以对自己已通过审核、没有被隐藏的任一棒点击「删除这一棒」；在「设置」中，你可以选择「删除我的全部接龙内容」。正在进行中的一局，要等揭晓后才能删除其中的内容（「删除我的全部接龙内容」也不包括正在进行中的一局，揭晓后可以再删一次）；「（没来得及画）」等自动文字不是你的内容，不需要删除。
2. 删除后：
   - 这一棒立即不再向任何人展示，原位置显示「作者已删除这一棒」；
   - 笔迹和文字会从游戏数据中删除；
   - 如果它是一条进行中的「慢慢传」接龙的最新一棒，这一棒会重新开放给群友来接。
3. **为履行内容安全记录方面的法定义务，审核用的图片、文字副本和审核记录会继续保存，仅供我们的管理人员处理内容安全事务时查看，到第九条规定的期限后删除。**
4. **你自己出的题目，在接龙开始后会作为整条接龙的起点保留，不能单独删除。** 如需移除，请通过「设置 · 反馈」联系我们。
5. 已被他人看到或截屏的内容，删除后无法从他人处收回。
6. **被举报隐藏或被我们移除的内容，不再向其他玩家展示，按第九条规定的期限删除。**

## 九、保存期限

1. **每一局的记录（包括座位、加入和离开情况）、接龙、每一棒的内容、审核用图片和审核记录（包括没通过审核、被隐藏或被作者删除的内容所留存的部分）、举报记录、「笑」的记录、提醒订阅记录和操作记录等，保存 180 天，期满后由我们每天的定期清理删除。**
2. 与你有关的身份和计数记录（包括 OpenID、每天的次数、违规和限制记录、群成员关系、最近给你抽过的题目），在你连续 180 天没有使用本游戏后删除。
3. 用于同步一局进度的临时记录，在这一局结束或关闭 1 天后删除；没有开始就关闭的一局，关闭 1 天后删除；开了但第 1 棒没有提交的接龙，1 天后删除。
4. 不包含个人信息和内容的汇总统计数字，可以长期保存。
5. 更多说明见《用户隐私保护指引》。

## 十、未成年人保护

1. 我们不收集你的年龄。**如果你未满 18 周岁，请在监护人的同意和指导下使用本游戏；如果你未满 14 周岁，必须由监护人阅读并同意本协议和《用户隐私保护指引》后，才能使用本游戏。**
2. 为保护未成年人，本游戏对所有用户采取以下措施：
   - 所有内容先审后传；
   - 没有私信、聊天、陌生人匹配和公开广场，一局只能由同一个群的群友加入，等待开局时只显示座位编号；
   - 拦截联系方式；
   - 被举报内容立即隐藏；
   - 夜间（22:00 至次日 08:00）不发送提醒。
3. 微信平台对小游戏的未成年人保护和防沉迷措施同样适用于本游戏。
4. 监护人发现未成年人在本游戏中的内容或经历存在问题，可以通过「设置 · 反馈」或【联系邮箱】联系我们，我们会核实并处理，例如隐藏相关内容。

## 十一、广告

1. 本游戏中的广告由微信广告平台提供，广告内容由广告主负责。
2. 激励视频需要完整观看才能获得奖励。广告加载失败时，每天每类奖励可以免费获得一次。
3. 我们不会在你选题、画、猜、等待开局或一局进行中展示广告；插屏广告只会在你离开揭晓页面时出现。

## 十二、免责与责任限制

1. **本游戏可能因网络、微信平台、内容安全服务、系统维护或不可抗力等原因中断或出错。接龙也可能因为超时、审核或举报而没有传完或被隐藏。在法律允许的范围内，我们不对由此造成的游戏进度或体验损失承担责任。**
2. **你的内容由你自己负责。我们会审核和处理违规内容，但无法保证所有违规内容都被及时发现。**
3. 微信等第三方提供的服务，按照其自身的规则提供。
4. 本条不免除因我们的故意或重大过失造成你损失的责任，也不免除法律规定不得免除的其他责任。

## 十三、协议变更

1. 我们可能根据法律法规、平台规则或游戏功能的变化修改本协议。修改后的协议会在本游戏中公布，并更新顶部的日期。
2. 有重大变更时，我们会在你下一次开局、加入一局、开接龙或接棒前，再次展示《接龙公约》并请你确认。
3. 如果你不同意修改后的协议，可以停止使用本游戏，并按第八条删除你的内容。

## 十四、联系我们

- 游戏内：「设置 · 反馈」
- 邮箱：【联系邮箱】
- 运营主体：【运营主体名称】
- 地址：【运营主体注册地址】

## 十五、法律适用与争议解决

1. 本协议适用中华人民共和国法律（为本协议之目的，不包括香港特别行政区、澳门特别行政区和台湾地区的法律）。
2. **因本协议产生的争议，双方应先友好协商；协商不成的，任何一方可以向【运营主体所在地】有管辖权的人民法院提起诉讼。**
