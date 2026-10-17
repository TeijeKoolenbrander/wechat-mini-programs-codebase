# 传画接龙: content change list for prompt bank v2 (independent review)

Date: 2026-10-15. Reviewer: product-ux (AI agent, independent of the drafter). Review record: `docs/chuanhua/content-review.md` §5.7.
Status: **proposed. Not applied.** `apps/chuanhua/game/core/content/prompts.v2.js` was not edited. The CTO assigns minigame-dev to apply the changes. **A human review of every prompt (Handoff H13) is still required before release.**

Scope: all 1,829 new prompts (`<cat>1001`+) read one by one, plus a 10% spot-check of the 423 v1 prompts (§6).

---

## 1. How to apply (read first)

- **FIX** = replace `text` in place. The id and `cat` stay the same. This is allowed because nothing has been released yet (spec §4.3 step 5 only applies after release).
- **DROP** = add `retired: true` to the entry. **Do not delete it.** `tests/content-prompts-v2.test.js` requires new ids to be contiguous from 1001 in each category, and it counts category minimums on the non-retired prompts. Retiring keeps the ids stable and keeps the test valid. (If the CTO prefers to delete entries before release, the id-contiguity test and the "never renumber" header comment must change first. Not recommended.)
- Every replacement text was checked by hand against the whole file and against the other replacements. I had no shell, so no script was run. The checks were:
  - 3-12 CJK ideographs, with no punctuation, digits or Latin;
  - unique, with no exact or normalised duplicate;
  - none of the test's `ISSUE_CLASSES` substrings (for example 脚, 澡, 晒太阳, 秧歌, 击, 币, 神, 爱);
  - no containment with ≤ 2 extra characters after `norm()`;
  - no bigram Dice ≥ 0.75;
  - no first-two-character family above 12. Retired prompts still count toward that limit; the tightest families are 春节 at 11 and 冬天 at 10.
- **After applying, run `node --test apps/chuanhua/game/tests/` and fix any heuristic hit before H13 starts.**
- Then update the counts in `content-review.md` §5.6 ("Final counts") and spec Appendix B if it lists v2 texts.

## 2. Result

| Category | New prompts reviewed | OK | FIX | DROP | Active before | **Active after** |
|---|---|---|---|---|---|---|
| A 动物 | 159 | 148 | 3 | 8 | 194 | **186** |
| B 美食 | 180 | 142 | 8 | 30 | 215 | **185** |
| C 职业 | 172 | 142 | 5 | 25 | 207 | **182** |
| D 出行 | 172 | 152 | 2 | 18 | 207 | **189** |
| E 运动 | 112 | 90 | 10 | 12 | 147 | **135** |
| F 节日与四季 | 105 | 65 | 32 | 8 | 140 | **132** |
| G 家里 | 134 | 107 | 12 | 15 | 169 | **154** |
| H 自然与天气 | 129 | 85 | 24 | 20 | 164 | **144** |
| I 奇思妙想 | 195 | 165 | 15 | 15 | 233 | **218** |
| J 校园与办公室 | 167 | 129 | 16 | 22 | 202 | **180** |
| K 爱好 | 168 | 129 | 14 | 25 | 203 | **178** |
| L 童话与想象 | 136 | 107 | 17 | 12 | 171 | **159** |
| **Total** | **1,829** | **1,461** | **158** | **210** | **2,252** | **2,042** |

- The bank stays ≥ 2,000. The smallest categories are F at 132 and E at 135, so every category stays ≥ 120. F loses only 8; its other problems are fixed by replacement.
- **Headroom left for H13:** 42 prompts in total; 12 in F and 15 in E. If the human reviewer wants to drop more than that, they should replace instead (use §5 as the pool).

Issue-class codes used in the tables:

| Code | Meaning |
|---|---|
| BODY | body, sexual innuendo, bathing or swimwear |
| ROM | romance |
| COPY | brand or copyrighted-character look-alike |
| POL | politics, flags, maps, territory, military |
| MONEY | money or currency |
| FOLK | religion, folk belief, death |
| VICE | alcohol or gambling association |
| SAFE | safety or minors |
| VULG | vulgar homophone |
| UNCL | unclear or undrawable for a 40+ player (abstract, sound, smell, taste) |
| BORE | bare noun or empty scenery with no drawing fun or drift |
| DUP | near-duplicate of the id given |

---

## 3. Change list

### A 动物 (3 FIX, 8 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| A1088 | 羊驼吐口水 | 小毛驴不肯走 | VULG | 羊驼 is the "草泥马" meme animal. The obvious description is a vulgar homophone (it is in the QA blocklist-miss list). |
| A1098 | 小白兔磨蘑菇 | 小白兔竖起耳朵 | FOLK, UNCL | "Grinding mushrooms" is unclear, and a rabbit grinding reads as 玉兔捣药, which the drafter's own filter excludes. |
| A1104 | 麻雀排电线 | 电线上站满麻雀 | UNCL | Ungrammatical. A 40+ player will stumble on 排电线. |
| A1016 | 海狮表演杂技 | DROP | SAFE, DUP A1015 | Animal performance. The drafter dropped 驯兽师 for animal welfare, so keeping this is inconsistent. It is also a near-duplicate of A1015 海豹顶皮球. |
| A1079 | 狐狸偷葡萄 | DROP | DUP A1127 | Same fable as A1127 狐狸看着葡萄发呆, which is funnier. |
| A1101 | 麋鹿戴围巾 | DROP | DUP A04 | Third "animal in a scarf" (A04 长颈鹿戴围巾, A1049). |
| A1110 | 小鸭坐小船 | DROP | DUP A1111 | Same as A1111 鸭子划小船. |
| A1146 | 河马叼着西瓜 | DROP | DUP A1115 | Same as A1115 河马吃西瓜. |
| A1045 | 松鼠爬树 | DROP | DUP A1122 | Bare. Covered by A1122 松鼠教猴子爬树 and A1002. |
| A1096 | 兔子睡大觉 | DROP | DUP A1119 | Covered by A1119 乌龟教兔子睡觉 and A16 树懒睡午觉. |
| A1100 | 麋鹿拉雪橇 | DROP | FOLK, DUP D23 | Christmas reindeer (a religious festival), and a near-duplicate of D23 狗拉雪橇. |

### B 美食 (8 FIX, 30 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| B1103 | 馄饨像小元宝 | 馄饨在汤里打滚 | MONEY | 元宝 is a gold ingot (currency). |
| B1119 | 胡萝卜戴绿帽子 | 胡萝卜顶着绿头发 | ROM | 戴绿帽子 means "cuckolded". It is the obvious group-chat joke. |
| B1178 | 一碗面条两双筷子 | 一碗面条好多双筷子 | ROM, COPY | Two people sharing one bowl of noodles is the 小姐与流浪汉 spaghetti-kiss scene. Many pairs of chopsticks makes it a family fight. |
| B1176 | 小朋友舔棒棒糖 | 小朋友啃大玉米 | BODY | 舔 plus 棒棒糖 is the innuendo QA flagged for B34, and here it is with a child. |
| B1122 | 筷子夹不起来 | 筷子夹不住花生米 | UNCL | No object, so nothing to draw. |
| B1128 | 大排档的夜宵 | 夜市的糖画摊 | VICE | A 大排档 drawing defaults to beer bottles. |
| B1172 | 面包树 | 吐司跳出面包机 | UNCL | Either a real tree (breadfruit) that 40+ players don't know, or a whimsy that duplicates I14. |
| B1173 | 点心盒子里的惊喜 | 饼干罐被偷吃光了 | UNCL | "A surprise" can't be drawn. |
| B1077 | 拍黄瓜 | DROP | BODY | A cucumber is the same phallic doodle as the banana (v1 B23), and the dish involves smashing it with a cleaver. |
| B1076 | 凉拌黄瓜 | DROP | BODY, DUP B1077 | Same as above. |
| B1047 | 菊花茶 | DROP | BODY, FOLK | 菊花 is crude slang, and chrysanthemums are funeral flowers. |
| B1080 | 辣椒酱 | DROP | COPY | A chilli-sauce jar is drawn and described as 老干妈 (a brand). |
| B1026 | 芝麻糊 | DROP | COPY, UNCL | Strong 南方黑芝麻糊 ad association. It is also a brown bowl. |
| B1022 | 八宝粥 | DROP | COPY, UNCL | Drawn as the 银鹭 can. Otherwise it is a bowl. |
| B1110 | 鸡蛋壳里的小鸡 | DROP | DUP A10 | Not food. Same as A10 小鸡破壳而出. |
| B1117 | 南瓜变成马车 | DROP | DUP I26, COPY | Same as I26 南瓜马车, with a Cinderella film association. |
| B1114 | 蘑菇伞下躲雨 | DROP | DUP I1035 | Not food. Same idea as I1035 蘑菇撑伞. |
| B1157 | 棉花糖像云朵一样 | DROP | DUP H18 | Mirror of H18 棉花糖一样的云. |
| B1143 | 夏天里的冰西瓜 | DROP | DUP F11 | Same as F11 夏天吃西瓜. |
| B1050 | 烤地瓜 | DROP | DUP B13 | 烤地瓜 is 烤红薯 (B13). |
| B1088 | 葡萄串 | DROP | DUP B22 | Same as B22 一串葡萄. |
| B1140 | 烤红薯冒热气 | DROP | DUP B13 | B13 烤红薯 plus steam. |
| B1141 | 糖炒栗子香喷喷 | DROP | DUP B14 | B14 糖炒栗子 plus a smell, which can't be drawn. |
| B1096 | 蛋糕上插满蜡烛 | DROP | DUP B09 | Same as B09 蛋糕插蜡烛. |
| B1106 | 奶茶里的珍珠 | DROP | DUP B16 | Same as B16 珍珠奶茶. |
| B1162 | 巨型三层汉堡 | DROP | DUP B20 | Same as B20 巨大的汉堡. |
| B1025 | 芝麻汤圆 | DROP | DUP B12 | Same drawing as B12 汤圆. |
| B1058 | 寿司卷 | DROP | DUP B29 | Same as B29 寿司. |
| B1165 | 筷子夹起一整根面 | DROP | DUP B1091 | Same as B1091 面条挂在筷子上. |
| B1170 | 蒸出来的胖馒头 | DROP | DUP B1094 | Same as B1094 馒头蒸胖了. |
| B1041 | 橙子榨汁 | DROP | DUP B1168 | Same as B1168 榨汁机里的橙子. |
| B1018 | 玉米汁 | DROP | UNCL | A glass of yellow liquid. Nobody can tell what it is. |
| B1019 | 红豆沙 | DROP | UNCL | A bowl of brown paste. |
| B1023 | 皮蛋瘦肉粥 | DROP | UNCL | A bowl. Also regional (Cantonese breakfast). |
| B1029 | 杏仁豆腐 | DROP | UNCL | White cubes in a bowl. Little known to many 40+ players. |
| B1030 | 双皮奶 | DROP | UNCL | A white bowl. Regional (Guangdong). |
| B1071 | 南瓜粥 | DROP | UNCL | A bowl. One of five porridges or soups that look the same. |
| B1072 | 玉米粥 | DROP | UNCL | A bowl. Same as above. |

### C 职业 (5 FIX, 25 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| C1162 | 卖花姑娘提花篮 | 卖棉花糖的大叔 | POL, COPY | **Filter miss.** 卖花姑娘 is the North Korean revolutionary film the drafter itself listed as excluded in §5.6. It survived inside a longer prompt. |
| C1172 | 摆渡人划船 | 老船夫撑竹篙 | COPY, FOLK | 摆渡人 is a best-selling novel and film title about a ferryman of dead souls. |
| C1079 | 裁缝量尺寸 | 裁缝踩缝纫机 | BODY | Measuring a body invites chest and waist drawings. |
| C1143 | 宇航员在月亮上种菜 | 宇航员在太空吃面条 | DUP I32 | Same as I32 月球上种菜. |
| C1138 | 清洁工擦大象的窗户 | 清洁工擦摩天轮 | UNCL | "The elephant's window" makes no sense. |
| C1094 | 救生员 | DROP | BODY, SAFE | Swimwear, and drowning is implied. |
| C1095 | 游泳教练 | DROP | BODY | Swimwear. |
| C1102 | 体操运动员 | DROP | BODY | Leotard. It also belongs in E. |
| C1056 | 秘书整理文件 | DROP | BODY | "小秘" carries a sexual-affair connotation in Chinese office humour. |
| C1059 | 翻译对话 | DROP | UNCL | Two people talking. Nothing makes it "translation". |
| C1060 | 讲解员 | DROP | UNCL | A person pointing. Undrawable as this job. |
| C1069 | 配音演员 | DROP | UNCL | Voice acting can't be drawn. |
| C1101 | 篮球解说员 | DROP | UNCL | Commentary can't be drawn. |
| C1170 | 驾驶员停好车 | DROP | UNCL, BORE | A parked car. |
| C1158 | 环卫工人扫落叶 | DROP | DUP C23 | Same as C23 清洁工扫落叶. |
| C1043 | 园林工人 | DROP | DUP C13 | Bare. One of 5 gardener prompts (C13, C1098, C1108, C1134). |
| C1098 | 园艺师 | DROP | DUP C13 | Same as above. |
| C1108 | 花园里的园丁 | DROP | DUP C13 | Same as above. |
| C1072 | 烘焙师 | DROP | DUP C11 | Bare. Same drawing as C11 面包师揉面. |
| C1073 | 糕点师 | DROP | DUP C11 | Same as above. |
| C1074 | 糖人师傅 | DROP | DUP C1126 | Same as C1126 吹糖人. |
| C1075 | 剪纸艺人 | DROP | DUP K11 | Same as K11 剪纸. |
| C1078 | 书法家 | DROP | DUP K10 | Same as K10 写毛笔字. |
| C1084 | 钟表匠 | DROP | DUP C1141 | Bare version of C1141. |
| C1039 | 吊车司机 | DROP | DUP C1115 | Same as C1115 开吊车. |
| C1166 | 超市理货员搬箱子 | DROP | DUP C1004 | Same as C1004 理货员摆货架 and C1109. |
| C1127 | 厨师把锅抛得很高 | DROP | DUP C01 | Same as C01 厨师颠勺. C1147 is kept for the big-pan joke. |
| C1142 | 乐队指挥挥动手臂 | DROP | DUP C32 | Same as C32 指挥家挥棒. |
| C1152 | 厨娘揉面团 | DROP | DUP C11 | Same as C11 面包师揉面. |
| C1165 | 邮局里的邮递员 | DROP | DUP C12 | Same as C12 邮递员送信. |

### D 出行 (2 FIX, 18 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| D1057 | 小飞机拉横幅 | 小飞机给大雁让路 | POL | A banner invites a written slogan. In China 横幅 strongly evokes protest banners. |
| D1155 | 摩托车载着一家人 | 摩托车后座的大白鹅 | SAFE | An overloaded motorbike is illegal and unsafe. Don't model it in a game with minors. |
| D1161 | 游轮甲板上的泳池 | DROP | BODY | Pool, swimwear, bathing. |
| D1089 | 晕车了吹风 | DROP | BODY, SAFE | Motion sickness invites a vomit drawing. |
| D1108 | 搭顺风车 | DROP | SAFE | Hitchhiking. 顺风车 is also tied to widely reported ride-share crimes. |
| D1045 | 地铁换乘 | DROP | UNCL | Changing lines can't be drawn. |
| D1054 | 空中看风景 | DROP | UNCL | No subject. |
| D1086 | 导航说话 | DROP | UNCL | A voice can't be drawn. |
| D1170 | 轨道车 | DROP | UNCL | Unclear what vehicle is meant. |
| D1009 | 公交车站台等车 | DROP | DUP D12 | Same as D12 雨中等公交. |
| D1014 | 十字路口堵车 | DROP | DUP D02 | Same as D02 堵车. |
| D1023 | 开着敞篷车 | DROP | DUP D1158 | Same as D1158 敞篷车兜风. |
| D1129 | 货车运着大西瓜 | DROP | DUP D1025 | Same as D1025 卡车运西瓜. |
| D1035 | 婴儿车里的宝宝 | DROP | DUP D31 | Same as D31 推婴儿车. |
| D1050 | 飞机降落 | DROP | DUP D1049 | Same drawing as D1049 飞机起飞. |
| D1051 | 飞机窗外的云海 | DROP | DUP D18 | Same as D18 坐飞机看云. |
| D1067 | 缆车升上山顶 | DROP | DUP D10 | Same as D10 坐缆车. |
| D1068 | 索道上看风景 | DROP | DUP D10 | Same as above. |
| D1136 | 车厢里的人睡着了 | DROP | DUP D1087 | Same as D1087 乘客睡着了 and D05. |
| D1167 | 火车站台上的老钟 | DROP | DUP D1100 | Same as D1100 车站里的时钟. |

### E 运动 (10 FIX, 12 DROP; E has the least room, so most issues are fixed by replacement)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| E1042 | 定向越野 | 穿着雨衣跑步 | POL, UNCL | Orienteering is drawn with a map (maps are banned), and 40+ players rarely know it. |
| E1064 | 入场式 | 运动员绑鞋带 | POL | An opening parade is led by flags. |
| E1063 | 运动会开幕 | 穿玩偶服赛跑 | POL | Opening ceremony means flag-raising. |
| E1037 | 骑马比赛 | 骑木马比赛 | VICE | Horse racing is 赛马, a gambling association. |
| E1036 | 八段锦 | 公园里打门球 | UNCL, FOLK | Hard to draw or recognise, and on the 气功 edge. 门球 is a familiar 40+ pastime. |
| E1033 | 普拉提 | 平板支撑撑不住 | UNCL | Unknown to many 40+ players, and it looks like E19 做瑜伽. |
| E1062 | 运动鞋 | 跑鞋跑掉了一只 | COPY, BORE | A bare sneaker drifts to a drawn tick or three stripes (brand marks). |
| E1022 | 自由泳 | 滚雪球比赛 | BODY, DUP E07 | Swimwear, and the same drawing as E07 游泳. |
| E1102 | 球场边的饮料 | 球场边的小狗捡球 | VICE, BORE | "A drink" drifts to beer. Otherwise it is a bottle. |
| E1072 | 海豹玩顶球 | 企鹅打冰球 | DUP A1015 | Same as A1015 海豹顶皮球. |
| E1052 | 沙滩排球 | DROP | BODY | Bikini volleyball is the default image. |
| E1020 | 跳水入水 | DROP | DUP E10 | Same as E10 跳水. |
| E1023 | 冲浪板 | DROP | DUP E16 | Same as E16 冲浪. |
| E1026 | 滑雪下坡 | DROP | DUP E11 | Same as E11 滑雪. |
| E1029 | 攀岩墙 | DROP | DUP E15 | Same as E15 攀岩. |
| E1046 | 拔河比赛 | DROP | DUP E12 | Same as E12 拔河. |
| E1091 | 接力赛掉棒 | DROP | DUP E1065 | Same as E1065 接力棒掉了. |
| E1066 | 终点撞线 | DROP | DUP E08 | Same as E08 冲过终点线 and E1097. |
| E1079 | 爷爷打太极 | DROP | DUP E14 | Same as E14 打太极拳. |
| E1098 | 跳高过杆 | DROP | DUP E18 | Same as E18 跳高. |
| E1107 | 公园里踢毽子 | DROP | DUP E02 | Same as E02 踢毽子. |
| E1045 | 跳绳比赛 | DROP | DUP E01 | One of 6 jump-rope prompts (E01, E1069, E1080, E1089, E1106). |

### F 节日与四季 (32 FIX, 8 DROP; F is at 140, so replacement is the default)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| F1068 | 元宵节放花灯 | 元宵节踩高跷 | FOLK | Floating river lanterns are a wish and 中元 (ghost-festival) custom. |
| F1066 | 春节大红灯笼高高挂 | 春节捂着耳朵看烟花 | COPY | 《大红灯笼高高挂》 is a famous film title (with a concubine plot). |
| F1088 | 年终聚餐 | 新年第一天睡懒觉 | VICE | A year-end company dinner defaults to toasting with alcohol. |
| F1091 | 夏天的蝉和知了 | 夏天院子里打水仗 | UNCL | 蝉 and 知了 are the same insect, so the prompt reads as an error. It also duplicates F20. |
| F1075 | 中秋节桂花香 | 中秋节月饼做成兔子 | UNCL | A smell can't be drawn. |
| F1020 | 新年愿望 | 新年挂新日历 | UNCL | Abstract. |
| F1084 | 新年伊始许愿 | 新年给雪人系红围巾 | UNCL | Abstract, and 伊始 is formal wording. |
| F1044 | 周年庆 | 生日会戴纸皇冠 | UNCL | Abstract and commercial (store anniversary). |
| F1096 | 秋天满地金黄 | 落叶堆里跳来跳去 | UNCL, BORE | No subject. |
| F1027 | 假期去旅行 | 暑假午睡被蝉吵醒 | UNCL | Too vague to draw. |
| F1015 | 摆果盘 | 春节嗑瓜子聊天 | FOLK, BORE | A New Year fruit plate is also an ancestor offering. Otherwise it is a bare bowl. |
| F1065 | 春节全家一起看电视 | 春节贴对联贴歪了 | COPY, DUP F1018 | The drafter dropped 春晚看电视 for the 春晚 association; this is the same scene. It also duplicates F1018 守岁看电视. |
| F1055 | 沙滩玩沙子 | 暑假趴在凉席上 | BODY, DUP K24 | Beach swimwear. Same as K24 堆沙堡. |
| F1008 | 门口挂红灯笼 | 春节孩子数糖果 | DUP F04 | Same as F04 挂灯笼. F has 9 lantern prompts. |
| F1009 | 家家扫尘 | 春天孩子放纸风车 | UNCL, DUP F1028 | 扫尘 is a literary or regional term. Cleaning is already F1028 劳动节大扫除. |
| F1087 | 年底大扫除 | 冬天给小狗穿毛衣 | DUP F1028 | Third cleaning prompt. |
| F1010 | 备年货 | 冬天堆一排小雪人 | DUP F1011 | Same as F1011 办年货挤超市. |
| F1014 | 炸年糕 | 冬天糖葫芦冻硬了 | DUP F1012 | Same as F1012 蒸年糕 and B1007. |
| F1019 | 新衣服 | 春节舅舅变魔术 | BORE, DUP F1064 | Bare, and covered by F1064 春节孩子们换新衣. |
| F1023 | 回家的火车 | 春节小猫抓彩带 | DUP F1022 | Same as F1022 春运回家. |
| F1072 | 端午节龙舟鼓声 | 端午节吃咸鸭蛋 | UNCL, DUP F1025 | A sound can't be drawn. Dragon boats are already in F1025 and D27. |
| F1031 | 六一合唱团 | 儿童节脸上贴小星星 | DUP J22 | Same as J22 音乐课合唱. |
| F1079 | 母亲节画一朵花 | 母亲节给妈妈做早餐 | DUP F1032 | Same as F1032 母亲节送花. |
| F1040 | 吹蜡烛 | 生日蛋糕抹了一脸 | DUP F1039 | Same as F1039 生日蛋糕许愿 and B09. |
| F1081 | 毕业季抛学士帽 | 毕业季在校服上签名 | DUP J19 | Same as J19 毕业抛帽子. |
| F1051 | 郊外踏青 | 春天田里放牛 | DUP F34 | Same as F34 踏青. |
| F1056 | 秋风吹落叶 | 秋天收大白菜 | DUP F09 | Same as F09 秋天的落叶. |
| F1057 | 秋游野餐 | 秋天打枣子 | DUP F23 | Same drawing as F23 春游野餐. |
| F1059 | 冬天吃烤红薯 | 冬天两只手揣进袖子 | DUP B13 | Same as B13 烤红薯. |
| F1061 | 冬天围着火炉 | 冬天被窝里看书 | DUP F26 | Same as F26 围炉煮茶. |
| F1089 | 年会舞台 | 春节踩气球游戏 | DUP J28 | Same as J28 年会表演节目. |
| F1092 | 夏天雷雨后的蜗牛 | 夏天雷雨来收衣服 | DUP H28 | Same as H28 雨后的蜗牛. |
| F1070 | 元宵节满街灯笼 | DROP | DUP F1002 | Lantern number 9. |
| F1063 | 春节门口两个大灯笼 | DROP | DUP F04 | Lantern prompt. |
| F1076 | 中秋节提着兔子灯 | DROP | DUP F1003 | Same as F1003 灯会上的兔子灯. |
| F1071 | 端午节包粽子比赛 | DROP | DUP F1024 | Same as F1024 端午包粽子. |
| F1069 | 元宵节猜灯谜 | DROP | DUP F12 | Same as F12 猜灯谜. |
| F1077 | 中秋节在院子里赏月 | DROP | DUP F06 | Same as F06 赏月 and F1073. |
| F1105 | 春天草地上野餐 | DROP | DUP F23 | Same as F23 春游野餐. |
| F1101 | 春天的小燕子 | DROP | DUP F1048 | Same as F1048 燕子回来了. |

### G 家里 (12 FIX, 15 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| G1013 | 门口的地垫 | 门口的鞋子乱成一团 | BORE | A bare mat. |
| G1020 | 厨房里的锅 | 锅盖被蒸汽顶起来 | BORE | A bare pot. |
| G1031 | 洗碗池 | 洗碗池堆成小山 | BORE | A bare sink. |
| G1032 | 洗碗布 | 洗碗泡泡飞满厨房 | BORE | A rag can't be recognised. |
| G1037 | 拖把桶 | 拖把当吉他弹 | BORE | A bare bucket. |
| G1041 | 沙发垫 | 沙发垫搭成小城堡 | BORE | A bare cushion. |
| G1052 | 电脑桌 | 转椅上转晕了 | BORE | A bare desk. |
| G1065 | 床头柜 | 床头的台灯被猫碰倒 | BORE | A bare cabinet. |
| G1068 | 儿童房 | 儿童房满地小汽车 | BORE | An empty room. |
| G1114 | 书房里的台灯 | 台灯下的小飞虫 | BORE | A bare lamp. |
| G1116 | 卧室里的大衣柜 | 试衣服堆满一床 | BORE, DUP G1004 | A bare wardrobe. Wardrobes are already in G1004. |
| G1134 | 楼下的小花园 | 楼下大爷遛鸟 | BORE | Empty scenery. |
| G1003 | 晾衣架上的衣服 | DROP | DUP G02 | Same as G02 晾衣服. |
| G1018 | 阳台晾被子 | DROP | DUP G29 | Same as G29 晒被子. |
| G1043 | 电视遥控器 | DROP | DUP G13 | Same as G13 找遥控器. |
| G1050 | 手机充电 | DROP | DUP G16 | Same as G16 手机没电了. |
| G1057 | 鱼缸里的金鱼 | DROP | DUP K14 | Same as K14 养金鱼. |
| G1046 | 灯泡坏了 | DROP | DUP G26 | Same as G26 换灯泡. |
| G1091 | 爸爸在修水龙头 | DROP | DUP G22 | Same as G22 修水龙头. |
| G1098 | 洗完衣服晾在阳台 | DROP | DUP G02 | Same as G02 晾衣服. |
| G1010 | 织围巾 | DROP | DUP G25 | Same drawing as G25 织毛衣. |
| G1077 | 找眼镜 | DROP | DUP G1103 | G1103 眼镜架在头顶上 is the same scene with the joke. |
| G1030 | 一家人吃饭 | DROP | DUP G1096 | Same as G1096 全家围着桌子吃饭. |
| G1006 | 叠衣服 | DROP | DUP G1092 | Same as G1092 妈妈在叠衣服. |
| G1059 | 仙人球 | DROP | DUP H08 | Same drawing as H08 沙漠里的仙人掌. |
| G1111 | 地毯上的积木 | DROP | DUP G1073 | Same as G1073 积木倒了 and K08. |
| G1060 | 窗台上的盆栽 | DROP | DUP G1120 | Same as G1120 窗台上的小花. |

### H 自然与天气 (24 FIX, 20 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| H1085 | 暴风雨前的天空 | 乌云下的小羊快跑 | UNCL | Abstract, with a disaster tone. |
| H1125 | 海滩上的躺椅 | 海浪冲走了拖鞋 | BODY | A deck chair drifts to a sunbather. |
| H1066 | 蘑菇圈 | 雨后冒出一堆蘑菇 | FOLK, UNCL | 蘑菇圈 (fairy ring) is obscure and tied to folk belief. |
| H1003 | 彩云追月 | 风把云吹成长条 | UNCL | An idiom and song title. Abstract. |
| H1033 | 秋高气爽 | 秋天的稻草堆 | UNCL | Idiom. Can't be drawn. |
| H1034 | 春风拂面 | 柳枝在风里跳舞 | UNCL | Idiom. Can't be drawn. |
| H1035 | 春暖花开 | 小草从雪里钻出来 | UNCL, DUP F10 | Idiom, and the same as F10 春天花开了. |
| H1029 | 夏日炎炎 | 热得小狗躲树荫 | UNCL | Idiom. Heat can't be drawn. |
| H1028 | 冬日暖阳 | 雪地上的长长影子 | UNCL | Idiom. |
| H1048 | 高山流水 | 山泉从石头缝流出来 | UNCL | An idiom about friendship and music, not scenery. |
| H1057 | 荷塘月色 | 青蛙在荷叶上看月亮 | UNCL | Essay title. Empty scenery. |
| H1014 | 大风天 | 大风天鸟飞不动 | UNCL | Wind alone can't be drawn. |
| H1032 | 闷热的夏夜 | 夏夜被蚊子咬醒 | UNCL | "Muggy" can't be drawn. |
| H1013 | 雨过天晴 | 雨停了收起雨伞 | UNCL | Idiom. |
| H1005 | 雷声轰隆隆 | 打雷吓得小狗钻床底 | UNCL, DUP H02 | A sound. Thunderstorms are already in H02. |
| H1058 | 芦苇荡 | 芦苇丛里的野鸭 | POL, DUP H1115 | 芦苇荡 is the 沙家浜 (model military opera) setting. It also duplicates H1115 河边的芦苇. |
| H1052 | 大石头 | 大石头像一只乌龟 | BORE | A bare rock. |
| H1053 | 鹅卵石 | 河边打水漂 | BORE | Bare pebbles. |
| H1042 | 白云朵朵 | 白云排队飘过山头 | BORE | Bare clouds (H18, H1043 already exist). |
| H1079 | 雨后的泥土 | 雨后蚯蚓爬出来 | BORE | Brown ground. |
| H1103 | 云上面的太阳 | 阳光从云缝照下来 | BORE | Empty scenery. |
| H1104 | 高山上的云 | 山顶戴着云帽子 | BORE | Empty scenery. |
| H1106 | 山路上的石阶 | 石阶上的小松鼠 | BORE | Empty scenery. |
| H1110 | 林间的阳光 | 树林里落满松果 | BORE, UNCL | Light can't be drawn. |
| H1128 | 海上的小岛 | DROP | POL, DUP H30 | Same as H30 小岛 (already on the territory watch list). A second one doubles the risk. |
| H1018 | 浓雾弥漫 | DROP | DUP H10 | Same as H10 大雾天. |
| H1001 | 夕阳西下 | DROP | DUP H03 | Same as H03 太阳下山. |
| H1012 | 雨后彩虹 | DROP | DUP H01 | Same as H01 彩虹. |
| H1015 | 狂风吹帽子 | DROP | DUP H1088 | Same as H1088 风吹得帽子飞走. |
| H1025 | 结冰的湖面 | DROP | DUP H1099 | Same as H1099 湖面结了薄冰. |
| H1037 | 繁星点点 | DROP | DUP H04 | Same as H04 满天星星. |
| H1039 | 流星雨 | DROP | DUP H22 | Same as H22 流星. |
| H1041 | 日出云海 | DROP | DUP H06 | Same as H06 山顶日出. |
| H1043 | 云朵像棉花 | DROP | DUP H18 | Same as H18 棉花糖一样的云. |
| H1054 | 沙滩上的贝壳 | DROP | DUP H1123 | Same as H1123 海边的贝壳. |
| H1059 | 湖边垂柳 | DROP | DUP H1114 | Same as H1114 河边的柳树. |
| H1061 | 瀑布飞泻 | DROP | DUP H07 | Same as H07 瀑布. |
| H1062 | 海面日出 | DROP | DUP H1127 | Same as H1127 海上的日出. |
| H1084 | 雨中的蜗牛 | DROP | DUP H28 | Same as H28 雨后的蜗牛. |
| H1091 | 风吹散了蒲公英 | DROP | DUP H27 | Same as H27 蒲公英飞走了. |
| H1108 | 山里的瀑布 | DROP | DUP H07 | Third waterfall. |
| H1111 | 森林里的小木屋 | DROP | DUP H23 | Same as H23 森林小屋. |
| H1124 | 海滩上的沙堡 | DROP | DUP K24 | Same as K24 堆沙堡. |
| H1126 | 海上的灯塔 | DROP | DUP H29 | Same as H29 海边的灯塔. |

### I 奇思妙想 (15 FIX, 15 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| I1028 | 茄子戴墨镜 | 土豆当足球 | BODY | An eggplant is the phallic emoji. It is also the third "wears sunglasses" prompt (I08, I1125). |
| I1127 | 穿雨衣的茄子 | 穿雨衣的小番茄 | BODY | **The highest-risk prompt found.** An eggplant in a raincoat is an obvious condom joke. |
| I1032 | 南瓜灯笼 | 南瓜里住着老鼠 | FOLK | A jack-o'-lantern belongs to Halloween, a ghost festival. |
| I1049 | 衣柜里的森林 | 抽屉里的小海洋 | COPY | A forest in a wardrobe is Narnia (C.S. Lewis, in copyright). |
| I1054 | 门自己开了 | 门把手会握手 | FOLK | A door opening by itself is the ghost-story trope. |
| I1056 | 楼梯通向云端 | 梯子搭到月亮上 | FOLK | Reads as a "stairway to heaven", a death image. |
| I1071 | 雨伞当降落伞 | 雨伞当小船 | COPY | Flying with an umbrella is Mary Poppins (Disney film). |
| I1074 | 气球带着房子飞 | 气球吊着一头牛 | COPY | A house lifted by balloons is Pixar's 《飞屋环游记》 (Up). |
| I1084 | 围巾绕地球 | 超长围巾绕大楼一圈 | POL | Drawing the globe means drawing maps and borders. |
| I1107 | 飞碟接小孩 | 飞碟来送外卖 | SAFE | Reads as aliens abducting a child. Creepy for minors. |
| I1066 | 草地跳舞 | 草坪剪成小兔子 | UNCL | Dancing grass can't be drawn. |
| I1070 | 海水变甜 | 海浪变成棉花糖 | UNCL | A taste can't be drawn. |
| I1146 | 唱歌的风 | 风车打了个大喷嚏 | UNCL | Wind can't be drawn. |
| I1186 | 会吹风的树 | 会打呼噜的树 | UNCL | Wind can't be drawn. |
| I1190 | 会下蛋的鸭子 | 会孵小鸡的闹钟 | UNCL | Not absurd: ducks do lay eggs, so it fails the category. |
| I1004 | 鱼在天上游 | DROP | DUP I09 | Same as I09 鲸鱼在天上飞. |
| I1010 | 面条从天而降 | DROP | DUP I06 | Same as I06 云朵下面条. |
| I1015 | 棉花糖云 | DROP | DUP H18 | Same as H18 棉花糖一样的云. |
| I1023 | 汉堡当枕头 | DROP | DUP I23 | Same as I23 包子当枕头. |
| I1034 | 洋葱哭了 | DROP | DUP B1120 | Same as B1120 洋葱让人流泪. |
| I1077 | 课本飞走 | DROP | DUP I19 | Same as I19 书本长翅膀. |
| I1078 | 书包长了翅膀 | DROP | DUP L18 | Same as L18 会飞的书包. |
| I1099 | 机器人炒菜 | DROP | DUP I17 | Same as I17 机器人学做饭. |
| I1112 | 熊猫开公交 | DROP | DUP I02 | Same as I02 熊猫开出租车. |
| I1133 | 拿着话筒的青蛙 | DROP | DUP A20 | Same as A20 青蛙唱歌. |
| I1141 | 睡觉的灯泡 | DROP | DUP I1050 | Same as I1050 台灯睡觉. |
| I1165 | 失眠的猫头鹰 | DROP | DUP A1105 | Same as A1105 猫头鹰熬夜. |
| I1171 | 围围巾的长颈鹿 | DROP | DUP A04 | Same as A04 长颈鹿戴围巾. |
| I1183 | 会开花的鞋子 | DROP | DUP I24 | Same as I24 鞋子开花了. |
| I1173 | 开快车的蜗牛 | DROP | DUP I30 | Same as I30 蜗牛开跑车 and I1116. |

### J 校园与办公室 (16 FIX, 22 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| J1049 | 运动会入场 | 运动会上老师也跑步 | POL | The opening parade is flag-led. |
| J1020 | 填空题 | 考卷上画小人 | UNCL, BORE | Blanks on paper can't be drawn as such. |
| J1026 | 作文课 | 作文本上的大红勾 | UNCL | A bare lesson name. |
| J1029 | 默写生词 | 字写得太大出格了 | UNCL | Dictation can't be drawn. |
| J1042 | 抽屉里的东西 | 抽屉里跑出一只仓鼠 | UNCL | "Things" can't be drawn. |
| J1045 | 小组讨论 | 小组用吸管搭高塔 | UNCL | Talking can't be drawn. |
| J1046 | 辩论赛 | 老师拿放大镜看作业 | UNCL | Debate can't be drawn. |
| J1080 | 通勤路上 | 骑车上班顶着大风 | UNCL | No subject. |
| J1086 | 团队合作 | 同事们一起抬大桌子 | UNCL | Abstract. |
| J1107 | 同学们围着转圈 | 同学们玩老鹰捉小鸡 | UNCL | No activity. |
| J1114 | 课间十分钟 | 课间趴在窗台看雨 | UNCL | A time span can't be drawn. |
| J1123 | 图书馆里的静悄悄 | 图书馆里小声说话 | UNCL | Silence can't be drawn. |
| J1127 | 考完试的轻松 | 考完试把书抛上天 | UNCL | A feeling can't be drawn. |
| J1153 | 同事间的小黑板 | 工位上的仙人掌戴帽子 | UNCL | Unclear what is meant. |
| J1154 | 同事互相帮忙 | 同事帮忙接住文件 | UNCL | Abstract. |
| J1162 | 装订成册 | 文件被风吹满地 | UNCL | Bookbinding can't be drawn. |
| J1003 | 传纸条被发现 | DROP | DUP J01 | Same as J01 上课传纸条. |
| J1005 | 擦黑板 | DROP | DUP J1112 | Same as J1112 值日生擦黑板. |
| J1017 | 办板报 | DROP | DUP J1016 | Same as J1016 黑板报. |
| J1111 | 教室后面的黑板报 | DROP | DUP J1016 | Same as J1016 黑板报. |
| J1037 | 实验课看显微镜 | DROP | DUP J16 | Same as J16 用显微镜. |
| J1054 | 毕业照拍照 | DROP | DUP F16 | Same as F16 毕业合影. |
| J1057 | 食堂的大锅饭 | DROP | POL, DUP J1119 | 大锅饭 is also the planned-economy political idiom. Same as J1119 食堂里的大锅菜. |
| J1063 | 讲台上的老师 | DROP | DUP C03 | Same as C03 老师讲课. |
| J1067 | 办公室茶水间 | DROP | DUP J1144 | Same as J1144 茶水间聊天. |
| J1074 | 桌上的便利贴 | DROP | DUP J25 | Same as J25 便利贴贴满墙. |
| J1076 | 午休趴桌子 | DROP | DUP J06 | Same as J06 趴桌上午睡. |
| J1082 | 打卡机 | DROP | DUP J35 | Same as J35 打卡上班. |
| J1089 | 年会节目 | DROP | DUP J28 | Same as J28 年会表演节目. |
| J1095 | 电脑黑屏 | DROP | DUP J07 | Same as J07 电脑死机了. |
| J1130 | 举手回答问题 | DROP | DUP J03 | Same as J03 举手发言. |
| J1132 | 讲台上的粉笔灰 | DROP | DUP J34 | Same as J34 黑板擦拍粉笔灰. |
| J1138 | 电脑前打字 | DROP | DUP J12 | Same as J12 键盘敲不停. |
| J1141 | 开会的人打哈欠 | DROP | DUP J27 | Same as J27 开会打瞌睡. |
| J1143 | 会议室的白板 | DROP | DUP J1084 | Same as J1084 白板写满字. |
| J1146 | 食堂排队打饭 | DROP | DUP J18 | Same as J18 食堂打饭. |
| J1145 | 午休时的小憩 | DROP | DUP J06 | Same as J06 趴桌上午睡. |
| J1165 | 一桌子的便利贴 | DROP | DUP J25 | Same as J25 便利贴贴满墙. |

### K 爱好 (14 FIX, 25 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| K1052 | 玩乐高 | 用纸箱做机器人 | COPY | 乐高 is a brand (LEGO). |
| K1011 | 跳拉丁 | 跳扇子舞 | ROM, BODY | A sensual partner dance with revealing costumes. Same class as v1 K28. |
| K1074 | 直播唱歌 | 对着镜子练唱歌 | SAFE | Livestreaming means tipping and minors on stream. Don't model it. |
| K1096 | 海边度假 | 海边捡漂流瓶 | BODY, UNCL | Swimwear, and too vague. |
| K1063 | 看展览 | 看恐龙化石展 | UNCL | No subject. |
| K1076 | 写故事 | 写诗写到咬笔头 | UNCL | Writing what? |
| K1080 | 听故事 | 围着爷爷听故事 | UNCL | Listening alone can't be drawn. |
| K1089 | 骑行旅游 | 骑车去看海 | UNCL | Vague. |
| K1091 | 自驾旅行 | 车后备箱里的帐篷 | UNCL | Vague. |
| K1092 | 摄影旅行 | 举着相机追蝴蝶 | UNCL | Vague. |
| K1095 | 滑雪度假 | 冰上钓鱼凿冰洞 | UNCL, DUP E11 | Vague, and the same as E11 滑雪. |
| K1158 | 弹一首曲子 | 弹琴弹到睡着 | UNCL | Filler. |
| K1160 | 讲一个故事 | 给布娃娃讲故事 | UNCL | Filler. |
| K1164 | 看一场雨 | 窗边听雨喝茶 | UNCL | Filler. |
| K1006 | 敲架子鼓 | DROP | DUP K03 | Same as K03 打鼓. |
| K1017 | 写书法 | DROP | DUP K10 | Same as K10 写毛笔字. |
| K1023 | 折千纸鹤 | DROP | DUP K21 | Same as K21 折纸鹤. |
| K1043 | 逮蝴蝶 | DROP | DUP K1044 | Same as K1044 捉蝴蝶. |
| K1048 | 玩陀螺 | DROP | DUP E30 | Same as E30 打陀螺. |
| K1050 | 玩拼图 | DROP | DUP G24 | Same as G24 拼拼图. |
| K1051 | 玩积木 | DROP | DUP K08 | Same as K08 搭积木. |
| K1057 | 下跳棋 | DROP | DUP K1054 | Same as K1054 玩跳棋. |
| K1058 | 看电影 | DROP | DUP K15 | Same as K15 看电影吃爆米花. |
| K1062 | 看烟花 | DROP | DUP F02 | Same as F02 放烟花. |
| K1132 | 用望远镜看鸟 | DROP | DUP K25 | Same as K25 观鸟. |
| K1135 | 用毛笔写福字 | DROP | DUP F19 | Same as F19 写福字. |
| K1152 | 养一缸鱼 | DROP | DUP K14 | Same as K14 养金鱼. |
| K1126 | 在家里练瑜伽 | DROP | DUP E19 | Same as E19 做瑜伽. |
| K1110 | 在广场上放风筝 | DROP | DUP E13 | Same as E13 放风筝 and K1098. |
| K1156 | 做一顿饭 | DROP | DUP G04 | Filler. Same as G04 煮饭. |
| K1157 | 唱一首歌 | DROP | DUP K04 | Filler. Same as K04. |
| K1159 | 跳一支舞 | DROP | DUP K1125 | Filler. Same as K1125 在客厅跳舞. |
| K1161 | 读一本书 | DROP | DUP K17 | Filler. Same as K17 读小说. |
| K1162 | 看一场电影 | DROP | DUP K15 | Filler. Same as K15. |
| K1163 | 看一次日出 | DROP | DUP H06 | Filler. Same as H06 and K1093. |
| K1165 | 爬一座山 | DROP | DUP E31 | Filler. Same as E31 爬山. |
| K1166 | 骑一次车 | DROP | DUP D01 | Filler. |
| K1150 | 画一幅画 | DROP | DUP K09 | Filler. Same as K09 画油画. |
| K1151 | 种一盆花 | DROP | DUP K13 | Filler. Same as K13 种花. |

### L 童话与想象 (17 FIX, 12 DROP)

| Id | Old | New | Class | Reason |
|---|---|---|---|---|
| L1012 | 会飞的大象 | 坐着纸飞机的兔子 | COPY | A flying elephant is Disney's Dumbo. |
| L1015 | 空中岛屿 | 乌龟背上的小森林 | COPY, POL | A floating island is 天空之城 (Laputa), which the drafter itself excluded. An island is also on the territory watch list. |
| L1021 | 巧克力河 | 果冻做的小桥 | COPY | Willy Wonka's chocolate river (Roald Dahl, in copyright). |
| L1039 | 水晶球 | 口袋里装着彩虹 | FOLK | A crystal ball is fortune-telling (封建迷信). |
| L1041 | 雪人城堡 | 雪人坐雪橇 | COPY | A snowman plus an ice castle is 冰雪奇缘 (Olaf and Elsa). The v1 review swapped L23 for this reason. |
| L1059 | 毛茸茸的怪兽 | 怕黑的小怪兽 | COPY | A furry monster is Sulley from 《怪兽电力公司》. |
| L1071 | 太空列车 | 去月亮的公交车 | COPY | A space train is 《银河铁道999》. It also duplicates L1016 空中列车. |
| L1081 | 纸船舰队 | 纸船载着小蚂蚁 | POL | 舰队 is a naval fleet (military). |
| L1096 | 太阳花开了 | 会打哈欠的花 | POL | 太阳花 names the 2014 Taiwan Sunflower Movement (太阳花学运). It is also the same as H17 向日葵. |
| L1122 | 小鸡的彩蛋工厂 | 小鸡的雨伞店 | FOLK | Painted eggs and a chick read as Easter (a religious festival). |
| L1054 | 风精灵 | 骑着树叶的小精灵 | UNCL | Wind can't be drawn. |
| L1084 | 画里的世界 | 书里飞出一条龙 | UNCL | Abstract. |
| L1088 | 梦中的花园 | 梦里骑着大鱼 | UNCL | "In a dream" can't be shown, so it becomes a plain garden. |
| L1090 | 梦里的大森林 | 梦里变成小蚂蚁 | UNCL | Same problem as L1088. |
| L1104 | 小熊的游乐场 | 小熊开的理发店 | UNCL | Vague. |
| L1027 | 泡泡车 | 坐在泡泡里飘走 | UNCL | Unclear what it is. |
| L1046 | 森林里的灯 | 森林里的路灯是萤火虫 | UNCL | Vague. |
| L1018 | 云上的小镇 | DROP | DUP L1017 | Same as L1017 云上的村庄. |
| L1020 | 糖果城堡 | DROP | DUP L13 | Same as L13 糖果屋. |
| L1023 | 饼干小屋 | DROP | DUP L13 | Same as L13 糖果屋 (gingerbread house). |
| L1024 | 蛋糕山 | DROP | DUP I1014 | Same as I1014 巧克力山. |
| L1025 | 牛奶瀑布 | DROP | DUP I1013 | Same as I1013 牛奶河. |
| L1026 | 棉花糖树 | DROP | DUP I14 | Same as I14 树上长满糖果. |
| L1031 | 气球屋 | DROP | DUP L1030 | Same as L1030 气球城市. |
| L1034 | 海底城堡 | DROP | DUP L05 | Same as L05 海底宫殿. |
| L1037 | 海底花园 | DROP | DUP L1033 | Same as L1033 海底森林. |
| L1044 | 森林里的茶会 | DROP | DUP L23 | Same as L23 小动物开茶会 (and Mad-Hatter adjacent). |
| L1066 | 外星球野餐 | DROP | DUP I1105 | Same as I1105 月球上野餐. |
| L1103 | 魔法帽子里的兔子 | DROP | DUP C15 | Same as C15 魔术师变兔子. |

---

## 4. Watch list: left OK, low risk (H13 to confirm)

- A1061 蝌蚪找妈妈: a textbook story, but also the 1960 上海美影 animated film. Generic enough.
- A1142 企鹅提着公文包, I1126 打领带的企鹅, I1159 开会的企鹅: a penguin in office clothes can drift to the QQ / Tencent penguin. Moderation covers the drift.
- A1108 鳄鱼流眼泪: the idiom means hypocrisy. Not aimed at anyone.
- B1052 炸鸡块, B1037 甜甜圈: generic. Watch for drawn brand logos.
- C1031 磨剪子: nostalgic street trade with scissors, not a weapon.
- C1040 挖掘机司机: carries the 蓝翔 ad meme, which is harmless.
- C1054 程序员敲代码: the "bald programmer" joke may appear in descriptions. Not in the prompt.
- C1044 保安守大门, G1128 小区门口的保安: security guards, not police.
- D1074 人力车, D1135 司机叔叔打哈欠: neutral as worded.
- F1049 桃花开了: 桃花 also means romantic luck (桃花运). Neutral as worded.
- F1004 走马灯, F1007 贴福字倒着贴: festive customs, not belief.
- G1082 保温杯: the "中年人保温杯泡枸杞" age meme. Mild.
- G1035 分类垃圾: policy-adjacent but everyday.
- J1009 抄作业, J1083 加班到深夜: relatable. Not encouraged by any reward.
- K1056 玩飞行棋: uses dice, but a children's board game.
- K1025 编中国结: a craft, not a state symbol.
- L1056 小飞龙, L1060-L1064 怪兽: generic. 怪兽 can drift to 奥特曼 kaiju in descriptions.
- L1120 小猫咪的魔法学堂: a magic school. Not Hogwarts as worded.

## 5. Optional: weak but acceptable prompts (left OK; replacement pool for H13)

These pass the rules but are bare, bland or a mild duplicate. If the human reviewer wants to raise quality further, swap these first, **by replacement rather than DROP**, to keep headroom.

- **B:**
  - Bowls and cups: B1004, B1005, B1020, B1021, B1046, B1082-B1087.
  - Near-duplicates: B1008, B1034, B1051, B1064, B1065, B1066, B1067, B1142, B1179.
  - Regional or indistinct: B1006, B1027, B1028, B1031, B1055, B1059, B1061, B1068, B1070, B1075, B1081.
- **C:**
  - Bare titles: C1020-C1023, C1042, C1051, C1080, C1082, C1091, C1092, C1106, C1107, C1121.
  - Near-duplicates: C1025, C1029, C1048, C1063, C1064, C1065, C1066, C1086, C1089, C1090, C1099, C1103, C1109, C1114, C1118, C1119, C1125, C1164, C1168, C1169.
- **D:**
  - Bare: D1027, D1033, D1034, D1046, D1053, D1058, D1065, D1073, D1082, D1088, D1091, D1093, D1102, D1103, D1163, D1164, D1165.
  - Near-duplicates: D1022, D1029, D1030, D1043, D1047, D1059, D1060, D1062, D1066, D1077, D1084, D1096, D1097, D1098, D1109, D1114, D1130, D1139, D1146, D1153, D1157, D1168, D1171.
- **E:** E1004, E1005, E1009, E1018, E1024, E1028, E1032, E1034, E1040, E1041, E1051, E1054, E1056, E1060, E1076, E1101, E1103, E1104, E1106, E1108.
- **F:** F1030, F1041, F1045, F1046.
- **G (bare objects):** G1007, G1012, G1014, G1021, G1022, G1033, G1036, G1044, G1045, G1048, G1058, G1061-G1064, G1066, G1070, G1079-G1081, G1083, G1085-G1088, G1107, G1109, G1115, G1117, G1119, G1122, G1124, G1129, G1132.
- **H (empty scenery):** H1007, H1046, H1047, H1049, H1063-H1065, H1069, H1080, H1082, H1109, H1116-H1118, H1121, H1129.
- **I:** I1019, I1043, I1069, I1090, I1097, I1132, I1138, I1158, I1191, I1195.
- **J (bare office objects and empty scenes):** J1004, J1008, J1012, J1014, J1015, J1018, J1019, J1022, J1024, J1025, J1034, J1036, J1040, J1044, J1048, J1053, J1056, J1061, J1062, J1064, J1068, J1071-J1073, J1075, J1093, J1097, J1099, J1105, J1108-J1110, J1116, J1117, J1121, J1122, J1133, J1135, J1136, J1139, J1156, J1157, J1163, J1166, J1167.
- **K (the 在X做Y family duplicating v1):**
  - K1010, K1013, K1015, K1029-K1031, K1035, K1039, K1046, K1064, K1066, K1070, K1071, K1073, K1081-K1083, K1088.
  - K1097-K1099, K1102, K1104, K1106, K1107, K1109, K1111, K1112, K1114, K1117-K1120, K1124, K1128, K1141, K1147-K1149, K1155.
- **L:**
  - Bare: L1004, L1049, L1052, L1053, L1055, L1057, L1058, L1065, L1069, L1076, L1077, L1080, L1087, L1132.
  - Band family: L1073, L1078, L1134.
  - Other: L1098 (kite lifts a house, a mild 《飞屋环游记》 echo).

## 6. v1 spot-check (10%)

**Sample:** the ids ending 05, 15, 25 and 35 in every category: 48 of 423 (11.3%). The 19 v1 fixes and the QA advisories I33 and I34 are already present in v2, and v1 text matches the fixed list.

| Result | Ids |
|---|---|
| OK, consistent | A05, A25, A35, B05, B15, B25, B35, C05, C15, C25, C35, D05, D15, D25, D35 (watch), E05, E15, E25, E35, F05, F15, F25, F35, G05, G15, G25, H05, H15, H25, H35, I15, I25, I35, J05, J15, J25, J35, K05, K15, K25, K35, L05, L15, L25, L35 |
| Inconsistent with the stricter v2 rules (advisory) | **A15 海豚钻圈** (animal performance; v2 dropped 驯兽师 and this review drops A1016); **G35 泡脚** (bathing and feet: 脚 is in the v2 issue-class list); **I05 企鹅在沙漠晒太阳** (contains 晒太阳, a v2 issue-class word) |

Outside the sample, one prompt has the same gap: **A07 大象洗澡** contains 澡, a bathing word. E04 射门 and E14 打太极拳 also contain v2 issue-class characters (射, 拳), but they are standard sports terms; keep them.

**Recommendation (optional, CTO decision):** v1 texts are grandfathered. The v2 test asserts that every v1 text in prompts.v2.js matches `prompts.v1.js`, so changing them needs a matching edit to `prompts.v1.js` and the spec Appendix B. If the CTO wants consistency, these replacements are unique in the bank and pass the v2 heuristics:

| Id | Old | Suggested |
|---|---|---|
| A07 | 大象洗澡 | 大象坐跷跷板 |
| A15 | 海豚钻圈 | 海豚和小船赛跑 |
| G35 | 泡脚 | 擦皮鞋 |
| I05 | 企鹅在沙漠晒太阳 | 企鹅在沙漠里撑伞 |

They are not counted in §2.
