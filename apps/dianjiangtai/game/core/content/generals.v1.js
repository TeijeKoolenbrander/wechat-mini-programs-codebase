'use strict';
// contentVersion 1 roster + texts (spec Appendix B). Single source of truth: a CommonJS module,
// because WeChat mini games can only require() .js files (never .json).
module.exports = {
 "contentVersion": 1,
 "note": "Phase 1 roster, spec Appendix B. Stats are our own judgement (INFERENCE); any change bumps contentVersion.",
 "generals": [
  {
   "id": "g_liubei",
   "name": "刘备",
   "courtesy": "玄德",
   "faction": "shu",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 7,
    "xin": 8,
    "ren": 10,
    "yong": 6,
    "yan": 7
   },
   "tier": "jia",
   "bonds": [
    "taoyuan"
   ],
   "portraitId": "p_liubei_v1",
   "monogram": "备",
   "blurb": "仁德服人，百折不挠。",
   "statNote": "仁10：所至之处士民相随；勇6：并非以勇力取胜。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_guanyu",
   "name": "关羽",
   "courtesy": "云长",
   "faction": "shu",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 6,
    "xin": 10,
    "ren": 6,
    "yong": 10,
    "yan": 7
   },
   "tier": "jia",
   "bonds": [
    "taoyuan"
   ],
   "portraitId": "p_guanyu_v1",
   "monogram": "羽",
   "blurb": "义薄云天，万人敌。",
   "statNote": "信10：千里走单骑；勇10：斩颜良于万军之中。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhangfei",
   "name": "张飞",
   "courtesy": "益德",
   "faction": "shu",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 4,
    "xin": 9,
    "ren": 4,
    "yong": 10,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [
    "taoyuan"
   ],
   "portraitId": "p_zhangfei_v1",
   "monogram": "飞",
   "blurb": "当阳桥头，一声断喝。",
   "statNote": "勇10：长坂坡据水断桥；仁4：鞭挞健儿，终致祸患。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhugeliang",
   "name": "诸葛亮",
   "courtesy": "孔明",
   "faction": "shu",
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 10,
    "xin": 9,
    "ren": 8,
    "yong": 3,
    "yan": 9
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": "p_zhugeliang_v1",
   "monogram": "亮",
   "blurb": "鞠躬尽瘁，运筹千里。",
   "statNote": "智10：隆中对、借东风；勇3：不亲冒矢石。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhaoyun",
   "name": "赵云",
   "courtesy": "子龙",
   "faction": "shu",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 6,
    "xin": 10,
    "ren": 8,
    "yong": 9,
    "yan": 8
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": "p_zhaoyun_v1",
   "monogram": "云",
   "blurb": "一身是胆，忠勇无双。",
   "statNote": "信10：终身无二主；智6：以勇略见长而非谋主。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_machao",
   "name": "马超",
   "courtesy": "孟起",
   "faction": "shu",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 4,
    "ren": 5,
    "yong": 10,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_machao_v1",
   "monogram": "超",
   "blurb": "锦马超，冲阵无前。",
   "statNote": "勇10：渭水之战几擒曹操；信4：反复于诸侯之间。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_huangzhong",
   "name": "黄忠",
   "courtesy": "汉升",
   "faction": "shu",
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 8,
    "ren": 6,
    "yong": 9,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_huangzhong_v1",
   "monogram": "忠",
   "blurb": "老当益壮，定军斩将。",
   "statNote": "勇9：定军山斩夏侯渊；智5：以勇名而非谋略。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_jiangwei",
   "name": "姜维",
   "courtesy": "伯约",
   "faction": "shu",
   "eras": [
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 8,
    "xin": 8,
    "ren": 6,
    "yong": 8,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_jiangwei_v1",
   "monogram": "维",
   "blurb": "文武兼资，继志北伐。",
   "statNote": "智8：屡出祁山，善用奇兵；信8：诸葛亮遗志之继承者。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_caocao",
   "name": "曹操",
   "courtesy": "孟德",
   "faction": "wei",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 9,
    "xin": 6,
    "ren": 6,
    "yong": 7,
    "yan": 10
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": "p_caocao_v1",
   "monogram": "操",
   "blurb": "挟令诸侯，法度森严。",
   "statNote": "严10：割发代首，军令如山；信6：多疑而善用人。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhanghe",
   "name": "张郃",
   "courtesy": "儁乂",
   "faction": "wei",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 7,
    "xin": 6,
    "ren": 5,
    "yong": 8,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_zhanghe_v1",
   "monogram": "郃",
   "blurb": "巧变知兵，长于野战。",
   "statNote": "智7：善于临阵应变；严8：用兵有法度。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_xiahoudun",
   "name": "夏侯惇",
   "courtesy": "元让",
   "faction": "wei",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 5,
    "xin": 9,
    "ren": 7,
    "yong": 8,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_xiahoudun_v1",
   "monogram": "惇",
   "blurb": "拔矢啖睛，刚烈忠贞。",
   "statNote": "信9：自始追随曹操；勇8：拔矢啖睛而战不止。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhangliao",
   "name": "张辽",
   "courtesy": "文远",
   "faction": "wei",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 8,
    "ren": 6,
    "yong": 9,
    "yan": 9
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": "p_zhangliao_v1",
   "monogram": "辽",
   "blurb": "威震逍遥津。",
   "statNote": "勇9：合肥以八百破十万；严9：夜定军中之乱。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_xuchu",
   "name": "许褚",
   "courtesy": "仲康",
   "faction": "wei",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 3,
    "xin": 10,
    "ren": 5,
    "yong": 10,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_xuchu_v1",
   "monogram": "褚",
   "blurb": "虎痴护主，力敌万夫。",
   "statNote": "信10：宿卫曹操终身；勇10：裸衣斗马超；智3：憨直少谋。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_xunyu",
   "name": "荀彧",
   "courtesy": "文若",
   "faction": "wei",
   "eras": [
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 9,
    "ren": 9,
    "yong": 2,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_xunyu_v1",
   "monogram": "彧",
   "blurb": "王佐之才，匡扶汉室。",
   "statNote": "智9：筹划大局；勇2：不预军阵；仁9：荐才安民。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_guojia",
   "name": "郭嘉",
   "courtesy": "奉孝",
   "faction": "wei",
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 10,
    "xin": 7,
    "ren": 5,
    "yong": 2,
    "yan": 3
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": "p_guojia_v1",
   "monogram": "嘉",
   "blurb": "料事如神，不拘小节。",
   "statNote": "智10：十胜十败之论；严3：不治行检，屡遭劾奏。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_simayi",
   "name": "司马懿",
   "courtesy": "仲达",
   "faction": "wei",
   "eras": [
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 10,
    "xin": 5,
    "ren": 5,
    "yong": 4,
    "yan": 9
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_simayi_v1",
   "monogram": "懿",
   "blurb": "隐忍多谋，善守善断。",
   "statNote": "智10：擒孟达、拒诸葛；信5：城府极深。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_sunjian",
   "name": "孙坚",
   "courtesy": "文台",
   "faction": "wu",
   "eras": [
    "huangjin",
    "qunxiong"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 6,
    "xin": 8,
    "ren": 6,
    "yong": 9,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_sunjian_v1",
   "monogram": "坚",
   "blurb": "江东猛虎，身先士卒。",
   "statNote": "勇9：讨黄巾、破董卓，常为先登；智6：勇略兼具。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_chengpu",
   "name": "程普",
   "courtesy": "德谋",
   "faction": "wu",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 8,
    "ren": 7,
    "yong": 7,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_chengpu_v1",
   "monogram": "普",
   "blurb": "三代元老，持重有度。",
   "statNote": "信8：历事孙坚、孙策、孙权；严8：治军有方。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_huanggai",
   "name": "黄盖",
   "courtesy": "公覆",
   "faction": "wu",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 6,
    "xin": 9,
    "ren": 6,
    "yong": 8,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_huanggai_v1",
   "monogram": "盖",
   "blurb": "苦肉诈降，火烧赤壁。",
   "statNote": "信9：甘受杖责行诈降计；勇8：赤壁纵火冲阵。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_sunce",
   "name": "孙策",
   "courtesy": "伯符",
   "faction": "wu",
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 7,
    "xin": 7,
    "ren": 7,
    "yong": 9,
    "yan": 8
   },
   "tier": "jia",
   "bonds": [
    "jiangdong"
   ],
   "portraitId": "p_sunce_v1",
   "monogram": "策",
   "blurb": "小霸王，横扫江东。",
   "statNote": "勇9：数年平定江东；严8：军令整肃。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhouyu",
   "name": "周瑜",
   "courtesy": "公瑾",
   "faction": "wu",
   "eras": [
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 10,
    "xin": 9,
    "ren": 7,
    "yong": 6,
    "yan": 9
   },
   "tier": "jia",
   "bonds": [
    "jiangdong"
   ],
   "portraitId": "p_zhouyu_v1",
   "monogram": "瑜",
   "blurb": "雅量高致，火攻破曹。",
   "statNote": "智10：赤壁定策；信9：与孙策断金之交。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_sunquan",
   "name": "孙权",
   "courtesy": "仲谋",
   "faction": "wu",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 8,
    "xin": 7,
    "ren": 7,
    "yong": 5,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_sunquan_v1",
   "monogram": "权",
   "blurb": "坐断东南，知人善任。",
   "statNote": "智8：知人善任；勇5：不亲冒锋镝。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_lvmeng",
   "name": "吕蒙",
   "courtesy": "子明",
   "faction": "wu",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 8,
    "xin": 7,
    "ren": 5,
    "yong": 7,
    "yan": 9
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_lvmeng_v1",
   "monogram": "蒙",
   "blurb": "士别三日，白衣渡江。",
   "statNote": "智8：奇袭荆州；严9：军纪严明，入城秋毫无犯。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_luxun",
   "name": "陆逊",
   "courtesy": "伯言",
   "faction": "wu",
   "eras": [
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 9,
    "ren": 7,
    "yong": 5,
    "yan": 8
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": "p_luxun_v1",
   "monogram": "逊",
   "blurb": "书生拜将，火烧连营。",
   "statNote": "智9：夷陵之战以守代攻；信9：持重可托。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhangjue",
   "name": "张角",
   "courtesy": "",
   "faction": "qun",
   "eras": [
    "huangjin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 7,
    "xin": 5,
    "ren": 6,
    "yong": 3,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": "p_zhangjue_v1",
   "monogram": "角",
   "blurb": "太平道首，振臂一呼。",
   "statNote": "智7：一呼而天下响应；勇3：不亲战阵。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_huangfusong",
   "name": "皇甫嵩",
   "courtesy": "义真",
   "faction": "qun",
   "eras": [
    "huangjin",
    "qunxiong"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 9,
    "ren": 8,
    "yong": 7,
    "yan": 9
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": "p_huangfusong_v1",
   "monogram": "嵩",
   "blurb": "平乱安民，忠于汉室。",
   "statNote": "信9：拥兵而不自立；仁8：赈抚百姓；严9：治军整肃。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_dongzhuo",
   "name": "董卓",
   "courtesy": "仲颖",
   "faction": "qun",
   "eras": [
    "huangjin",
    "qunxiong"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 6,
    "xin": 2,
    "ren": 1,
    "yong": 8,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": "p_dongzhuo_v1",
   "monogram": "卓",
   "blurb": "凉州悍将，反复无常。",
   "statNote": "信2：弑立废主；仁1：暴虐失众；勇8：边地善战。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_yuanshao",
   "name": "袁绍",
   "courtesy": "本初",
   "faction": "qun",
   "eras": [
    "huangjin",
    "qunxiong"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 6,
    "xin": 5,
    "ren": 6,
    "yong": 5,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": "p_yuanshao_v1",
   "monogram": "绍",
   "blurb": "四世三公，好谋无断。",
   "statNote": "智6：多谋而少决；严5：号令不一。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_hansui",
   "name": "韩遂",
   "courtesy": "文约",
   "faction": "qun",
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 7,
    "xin": 3,
    "ren": 4,
    "yong": 6,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": "p_hansui_v1",
   "monogram": "遂",
   "blurb": "凉州宿将，纵横反复。",
   "statNote": "信3：屡叛屡盟；智7：善结豪强。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_lvbu",
   "name": "吕布",
   "courtesy": "奉先",
   "faction": "qun",
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 3,
    "xin": 2,
    "ren": 4,
    "yong": 10,
    "yan": 4
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": "p_lvbu_v1",
   "monogram": "布",
   "blurb": "飞将无双，反复难恃。",
   "statNote": "勇10：辕门射戟、虎牢独战；信2：三易其主。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_zhanglu",
   "name": "张鲁",
   "courtesy": "公祺",
   "faction": "qun",
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 6,
    "xin": 7,
    "ren": 9,
    "yong": 3,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": "p_zhanglu_v1",
   "monogram": "鲁",
   "blurb": "据汉中以五斗米道安民。",
   "statNote": "仁9：设义舍、行教化；勇3：不好征战。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  },
  {
   "id": "g_menghuo",
   "name": "孟获",
   "courtesy": "",
   "faction": "qun",
   "eras": [
    "sanfen"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 4,
    "xin": 6,
    "ren": 6,
    "yong": 8,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": "p_menghuo_v1",
   "monogram": "获",
   "blurb": "南中豪帅，七擒七纵。",
   "statNote": "勇8：南中各族所服；智4：易被诱敌之计。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 1
  }
 ],
 "texts": {
  "causeSlotWin": {
   "zhugong": "收拢人心",
   "junshi": "运筹帷幄",
   "xianfeng": "率先破阵",
   "mengjiang": "阵前斩将",
   "shoujiang": "稳守不动"
  },
  "causeSlotLoss": {
   "zhugong": "号令不齐",
   "junshi": "谋划落空",
   "xianfeng": "冲阵受挫",
   "mengjiang": "久战无功",
   "shoujiang": "调度失当"
  },
  "causeTailWin": {
   "yeZhan": "敌阵溃散",
   "gongCheng": "城门告破",
   "shouCheng": "城池稳固",
   "shuiZhan": "火攻得手",
   "qiXi": "出其不意",
   "anMin": "民心归附"
  },
  "causeTailLoss": {
   "yeZhan": "阵脚大乱",
   "gongCheng": "久攻不下",
   "shouCheng": "城门失守",
   "shuiZhan": "船队受挫",
   "qiXi": "行迹败露",
   "anMin": "民心离散"
  },
  "wavering": [
   "{name}临阵生变，阵脚动摇",
   "{name}心生犹疑，军心不稳",
   "{name}临阵迟疑，战机贻误",
   "{name}举棋不定，前军失序"
  ],
  "stratagem": [
   "{name}奇谋百出，反败为胜",
   "{name}临机设计，转危为安"
  ],
  "unstoppable": [
   "{name}万夫莫敌，力挽狂澜",
   "{name}一骑当先，扭转战局"
  ],
  "luck": {
   "ji": "吉",
   "ping": "平",
   "xiong": "凶"
  },
  "strong": {
   "zhugong": "主公深得人心",
   "junshi": "军师谋略过人",
   "xianfeng": "先锋锐不可当",
   "mengjiang": "猛将如云",
   "shoujiang": "守将坚如磐石"
  },
  "weak": {
   "zhugong": "可惜中军少一位服众的主公",
   "junshi": "可惜帐中少一位运筹的谋主",
   "xianfeng": "可惜阵前少一员破敌的先锋",
   "mengjiang": "可惜军中少一员冲锋的猛将",
   "shoujiang": "可惜城头少一员稳将"
  },
  "commentPerfect": "五人同心，十二战全胜，天下归一。",
  "commentWorst": "兵败如山倒，且收拾残部，来日再战。",
  "tierLabels": {
   "jia": "甲",
   "yi": "乙",
   "bing": "丙"
  },
  "fit": {
   "good": "适任",
   "ok": "可用",
   "bad": "错位"
  }
 }
};
