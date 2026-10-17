# 用户隐私保护指引: additions for the release engineer

Source of truth for the inventory is spec §15. QA-11: the inventory omitted the unsent-turn draft kept on the device (TD-43,
spec 17.21). Add the row and the sentence below to the 用户隐私保护指引 (free-text sections) and to spec §15's table.

## What is stored, where, why, how long

| | |
|---|---|
| What | The turn the player is working on and has not yet sent: for a 画 turn the strokes (points, colours, sizes, undo count); for a 猜 turn the text typed so far (at most 80 characters); plus which chain and step it belongs to (chain id, claim id, step number), the chosen colour and brush size, and two timestamps (when the turn started, when the draft was last saved). No OpenID, no name, no contact data. |
| Where | On the player's own device only: the mini game's local storage (`wx.setStorageSync`, key `chuanhua_state_v1`, field `turn`). It is not uploaded as a draft. The cloud only ever receives the finished turn when the player sends it, which is already covered by the rows for drawings and text. |
| Why | So that if the game is closed, killed or interrupted mid-turn (a phone call, switching apps), the player gets their unsent drawing or sentence back instead of losing it (TD-43). The saved claim id lets the game resume the same turn with the remaining time. |
| How long | Until the turn ends: it is deleted when the player sends the turn, leaves the turn, the time runs out and the turn is closed, the claim is lost to another player, or the server reports the chain gone. Otherwise it stays until the player clears the mini game's data or removes the mini game; there is no other expiry. At most one draft exists at a time (it is replaced by the next turn). 「删除我的全部接龙内容」 in 设置 deletes server-side content; it does not need to touch the draft because the draft is local and short-lived. |
| Shared with | Nobody. Not sent to us, to WeChat's content-security service, or to any third party until the player sends the turn. |
| Legal basis / consent | Necessary to provide the function the player is using (a local copy of their own work in progress); no separate consent prompt is needed. |

## Exact text to add to the 用户隐私保护指引

> **本地草稿。** 当你正在画或写一棒、还没有发送时，为了在你退出、被打断后能帮你找回，我们会把这一棒的草稿（画的笔迹或已输入的文字，以及所属接龙和第几棒、画笔颜色和粗细、保存时间）保存在你手机上本游戏的本地存储中。这份草稿只保存在你的设备上，不会上传，也不会提供给任何第三方；你发送这一棒、放弃这一棒、这一棒已经超时或被他人接走时，草稿会被删除；你清除本游戏的数据或删除本游戏，草稿也会被一并删除。你发送后的内容，按本指引中「画和文字」部分处理。

## Inventory row (spec §15 format)

| Data | Purpose | Source | Stored | Retention |
|---|---|---|---|---|
| Unsent-turn draft (strokes or text, chain id, claim id, step, colour, size, timestamps) | restore the player's unsent work after the game is closed or interrupted | the player's input | device storage only (`chuanhua_state_v1.turn`), not uploaded | until the turn is sent, abandoned, timed out or lost, or the player clears the game data; one draft at a time |

## Notes for the form

- This is local storage, not a WeChat "privacy interface" (隐私接口), so it does not add an item to the MP 用户隐私保护指引 structured list; it belongs in the free-text part, like the display and sound settings row that already exists.
- The same storage key also holds an install id (random UUID, generated locally and never sent anywhere, not used for analytics), first-use date, tutorial flags, the 今日彩笔 and ad-cap counters, the ids of the reveals already watched (`revealsSeen`, see "Reveals already watched" below) and a cached list of the player's own chains (`albumCache`: your own prompts and sentences, cached locally, up to 60 rows of at most 80 characters; see "Wording gaps closed" below). None of these contain contact data. If the release engineer lists the key's contents once, list them together with the draft.
- The user agreement (section 九) says what is retained on the server; the draft is deliberately not in that section because it never reaches the server. Do not bump `rulesVersion` for this addition alone unless the agreement text itself changes (see game/RELEASE.md).
- Rev. 2: the draft is keyed by claim (慢慢传) or by room + round (live). Same rules.

---

# Rev. 2 additions (2026-10-15, founder decisions F-2 to F-5): live rooms and prompt rolls

Source of truth: spec §15. Add both rows to the 用户隐私保护指引 free-text sections. Neither uses a WeChat privacy interface (隐私接口), so neither adds an item to the structured list.

## Room membership and presence

| | |
|---|---|
| What | For each live game ("一局") you join: your seat number, whether you are the host, when you joined and left, whether you left, and the time of your last action in that game. |
| Where | Server only (`rooms.seats`). A per-seat sync record (`room_signals`) holds only the game's progress (round, deadline, counts) and your OpenID as its owner. Only you can read it, and only our cloud functions can write it. |
| Why | To run the game: fixed seats, passing each chain to the next seat, skipping a player who left, letting you rejoin, and the lobby hint "可能已离开". |
| How long | Game records 180 days (deleted by the daily `cleanup` once older than that); sync records 1 day after the game ends or closes (`roomSweeper`); lobbies that never started 1 day after closing. |
| Shared with | Nobody. Other players see only numbered seats and counts, never who you are. |

**Text for the 指引:**
> **参与「一局」的记录。** 当你创建或加入一局时，我们会记录你在这一局中的座位编号、是否为房主、加入和离开的时间，以及你在这一局中最近一次操作的时间，用于安排每一轮轮到谁、跳过已离开的玩家、让你断线后回到这一局。其他玩家只能看到座位编号和人数，看不到你的身份。为了让各位玩家的画面同步，我们会为你保存一条只记录这一局进度的同步记录，只有你本人可以读取，这一局结束或关闭 1 天后删除；没有开始就关闭的一局，关闭 1 天后删除；这一局的其他记录保存 180 天，期满后删除。

## Prompt roll history

| | |
|---|---|
| What | The ids of the last 300 preset prompts shown to you, and your current roll. |
| Where | Server only (`players.seenPrompts`, `players.roll`). |
| Why | So the game doesn't show you the same prompts again, and to check that the prompt you pick was one you were offered. |
| How long | Deleted when you haven't used the game for 180 days. |

**Text for the 指引:**
> **抽题记录。** 为了不重复给你同样的题目，我们会记录最近给你展示过的预设题目编号（最多 300 个），你连续 180 天未使用本游戏后删除。

## Reveals already watched (on the device, QA rev. 2)

QA rev. 2 (ac-matrix "Privacy inventory vs code") found this device-storage field missing from the inventory. Spec §15 now has the row.

| | |
|---|---|
| What | The ids of the chains (慢慢传) and games (一局) whose reveal the player has already opened on this phone (`revealsSeen`: id -> true). At most 200 ids; older ones are dropped. Ids only: no drawing, no text, no OpenID, no group id. |
| Where | On the player's own device only: the mini game's local storage (key `chuanhua_state_v1`, field `revealsSeen`). It is not uploaded. |
| Why | So that one reveal counts only once toward the "after a reveal" interstitial gate (spec §11, TD-139(6)), and a reveal already watched no longer shows the "new" dot. |
| How long | Until the player clears the mini game's data or removes the mini game (capped at 200 ids). 「删除我的全部接龙内容」 does not touch it: it holds no content. |
| Shared with | Nobody. |
| Legal basis / consent | Necessary for the function the player uses; no separate consent prompt. Local storage, not a 隐私接口: free-text section only. |

**Text for the 指引:**
> **已看过的揭晓。** 为了让同一次揭晓只计算一次（用于控制广告出现的频率），并且不再把已经看过的揭晓标为「新」，我们会在你手机上本游戏的本地存储中记录你已经打开过的接龙和对局的编号（最多 200 个，只有编号，不含任何画、文字或你的身份信息）。这份记录只保存在你的设备上，不会上传，也不会提供给任何第三方；你清除本游戏的数据或删除本游戏时会被一并删除。

**Inventory row (spec §15 format):**

| Data | Purpose | Source | Stored | Retention |
|---|---|---|---|---|
| Reveals already watched (`revealsSeen`: chain and room ids, at most 200) | count a reveal once toward the interstitial gate; no "new" dot on a reveal already seen | derived from the player's own taps | device storage only (`chuanhua_state_v1.revealsSeen`), not uploaded | until the player clears the game data or removes the game |

---

# Wording gaps closed (privacy-guide.md section 4, items 5, 6, 7, 9)

Spec §15 now has the rows; the same facts for the 指引 free text:

- **albumCache.** Your own prompts and sentences from your finished chains, cached locally on the device (`chuanhua_state_v1.albumCache`) so the album opens fast: up to 60 rows, at most 80 characters each. Not uploaded. Kept until replaced by a newer first page or until the player clears the game data.
- **installId.** A random UUID generated locally on first start and stored in the same local key. It is never sent to any server and is not used for analytics (an earlier wording said "analytics session grouping"; that was wrong).
- **Feedback text.** If the player chooses to send feedback, the text is entered in and sent through WeChat's own feedback component (`wx.createFeedbackButton`). It reaches the operator in the MP console (反馈管理); the game does not read it and does not store it in its own database.
- **`step_submit` statistics.** The analytics event carries counts only (strokes, points, undo count), durations, canvas height and flags: no strokes, no text, no OpenID.
