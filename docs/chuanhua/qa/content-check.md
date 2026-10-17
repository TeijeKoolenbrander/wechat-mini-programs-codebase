# 传画接龙 content check (QA second review, build 10e3b18)

Scope: all 423 prompts in `apps/chuanhua/game/core/content/prompts.v1.js` (spec Appendix B, AC 87, rules of spec 4.2) and `core/content/blocklist.v1.js` (spec 5.6, AC 34/35). This is a second review by QA, not the human sign-off that H13 requires (bug QA-8). The bank and the list were drafted with AI assistance.

## Method
1. **Parity:** parsed Appendix B of the spec and compared id by id with the shipped module: 423 / 423 identical (`qa-content.test.js`).
2. **Read every prompt** once for the spec 4.2 categories: politics and national symbols, military and police, religion and 封建迷信, real people and brands, regions and ethnic groups as jokes, disasters, illness and death, violence, alcohol, tobacco, gambling, romance and bodies, mockery of a group.
3. **Independent term scan** with QA's own term lists (politics, religion, vice, body, violence, 24 brands, real persons): 0 hits (`qa-content.test.js`, "none of the 423 prompts ..."). A wider scan of about 150 single characters and words was read by hand (hits such as 蛋, 泡, 吹, 骑, 龙 are all innocent).
4. **Format:** every prompt is pure CJK (no digits, Latin or punctuation, so the contact filter can never fire on a preset), 2-12 code points, unique, 12 categories (11 x 35 + 38).
5. **Blocklist probe:** about 330 abuse terms across sexual, insult, political, drugs, gambling, violence / self-harm, slurs, contact and number forms were sent through `core/text.js#validate`; the misses are listed below.

## Result for the prompts: no failures, nothing to remove
No prompt breaks a spec 4.2 rule. None names a person, brand, flag, map, currency, religion, ghost, fortune-telling, alcohol, tobacco, gambling game, disaster, illness, injury, death or weapon. Professions (农民, 清洁工, 外卖小哥, 小丑, 售货员) are shown doing a job, not mocked. Regional foods and customs (煎饼果子, 冬至吃饺子, 咬春饼, 划龙舟) are neutral. No prompt carries a mocking angle on age, body or job.

### Advisories (all Low; not blocking; swap if the content owner agrees)
Drawings are pre-moderated and a bad drawing is hidden, so the point is to avoid prompts that make the crude joke the obvious drawing:

| Id | Prompt | Why |
|---|---|---|
| B23 | 剥香蕉 | classic innuendo; the likeliest prompt in the bank to be drawn crudely. Suggest swapping (e.g. 剥橘子) |
| I34 | 汽车洗泡泡浴 | bath / bubbles invite a bathing figure; suggest 汽车洗澡 or 小鸭子泡泡浴 |
| I33 | 煎蛋晒日光浴 | sunbathing invites a body drawing; low |
| B34 | 棒棒糖 | phallic-shape joke; low |
| G20 | 挤牙膏 | mild; low |
| B04 | 糖葫芦 | stick of fruit; low |
| L05 | 美人鱼唱歌 | mermaid invites bare-chest drawings; low |
| K28 | 跳交谊舞 | couple dance (spec bans romance); neutral as worded; low |
| F14 | 七夕看银河 | a romance festival; neutral as worded; low |
| G09 | 赖床 | bed setting; low |
| F29 | 端午挂艾草 | folk-belief custom (warding off evil); the spec bans 封建迷信 (ghosts, fortune telling); this is customary and benign, confirm with the owner |
| D19 | 潜水艇 | can be read as military; a toy / civilian sub is the intent |
| D09 | 火箭发射 | space or missile; civilian intent |
| L09 | 藏宝图 | "map" is a banned drawing subject (national maps); a treasure map is a prop. Low |
| J13 | 写作业到深夜 | late-night framing in a game with minors; neutral wording, but consider 写作业 |
| J01 | 上课传纸条 | mild school-rule joke |

Brand-adjacent generics checked and fine as generic nouns: 珍珠奶茶, 披萨, 汉堡, 魔方, 积木, 自拍, 视频会议, 南瓜马车, 糖果屋.

## Result for the blocklist: gaps (bug QA-4, QA-5)
The list is conservative and correct where it speaks: NFKC and case folding, punctuation / spacing removal (`傻 逼`, `傻.逼`, `傻Ｂ`), whole-word Latin tokens (so `sb` does not hit `sbo`). Evasions it handles are tested (`qa-content.test.js`, "evasions the list DOES handle"). No prompt matches it.

**Misses (QA probe, wrapped as `一只<term>的猫`, all accepted locally):**
- sexual / minors: 草泥马, 妈逼, 屄, 大鸡吧, 嫖 / 嫖客, 妓院, 迷奸, 幼女, 恋童, 脱光, 强上, 下体, 私处, 生殖器, 色图, 开房, 三陪
- insult: 狗日的, 日了狗, 傻x, shabi, caonima, 他娘的, 我草, 操 (alone), 死爹, 废物, 神经病
- political: 共党, 反党, 习总, flg, 台湾独立, 新疆集中营, 8964, 国歌, 中南海
- self-harm: 想死, 不想活, 轻生, 自焚, 自尽
- violence / hate: 纳粹, 希特勒, 法西斯, 炸学校, 炸地铁, 爆头, 割喉, 毒死
- drugs: 大烟, 溜冰, k他, 神仙水, 开心水, 吸粉
- gambling: 押宝, 买码, 赌马, 赌注, 德州扑克 (single 赌 is deliberately not matched)
- slurs: 小鬼子, 倭寇, 黑猪, 洋鬼子, 回回
- contact: v我, 薇我, 加薇, `w x`, `wei xin`, Q群, dd我, 私我, 戳我
- Latin spaced forms: `s b`, `s.b` (tokens are matched on letter runs, so spacing splits them)

The must-fix subset is encoded as `todo` tests (sexual / minors, self-harm, the insults and politics above, slurs). Everything missed still goes to `msgSecCheck` and fails closed, so this is a quality gap, not a hole; the pre-publish quota (100 calls a day) makes the local list matter more during the device pass.

**False positives (substring matching; one retype, no strike):** `他妈妈在做饭` (hits 他妈), `一个大麻袋` (hits 大麻), `中共同参与` (hits 中共). Acceptable and pinned by a test so a future tuning is noticed. When adding terms avoid generic substrings (e.g. 杀, 枪, 刀, 死, 毒) which would block 杀菌, 枪..., 刀叉, 电脑死机, 毒蘑菇 style drawings.

## AIGC and review status
- Runtime: no generative-AI feature in the game or the backend (code search). Players' content is user-generated, moderated by WeChat's content security.
- The 423 prompts and the blocklist were AI-drafted. Spec 18 H13 requires a human content sign-off before submission; none is recorded (QA-8). Recommended record: `docs/chuanhua/content-review.md` with reviewer, date, the advisories above accepted or swapped, and the QA-4 additions.
- Constitution Art. 9.2 (AIGC labelling): the spec specifies no label; no AI output is shown to players as such. Counsel (H10) to confirm that AI-assisted drafting of the bundled, human-reviewed bank needs no disclosure, and that the registration introduction does not describe AI features.
