'use strict';
// contentVersion 2 roster + texts (spec Appendix C). CommonJS module: WeChat mini games can only require() .js files (never .json).
// Generated from the spec's Appendix C; the 32 Phase 1 generals keep their exact stats (tests/core-content-v2.test.js diffs them).
module.exports = {
 "contentVersion": 2,
 "bonds": [
  {
   "key": "taoyuan",
   "label": "桃园",
   "members": [
    "g_liubei",
    "g_guanyu",
    "g_zhangfei"
   ],
   "bonus": 0.04
  },
  {
   "key": "jiangdong",
   "label": "江东",
   "members": [
    "g_sunce",
    "g_zhouyu"
   ],
   "bonus": 0.04
  },
  {
   "key": "longfeng",
   "label": "龙凤",
   "members": [
    "g_zhugeliang",
    "g_pangtong"
   ],
   "bonus": 0.04
  },
  {
   "key": "suwei",
   "label": "宿卫",
   "members": [
    "g_xuchu",
    "g_dianwei"
   ],
   "bonus": 0.04
  },
  {
   "key": "xiliang",
   "label": "西凉",
   "members": [
    "g_machao",
    "g_madai",
    "g_pangde"
   ],
   "bonus": 0.04
  },
  {
   "key": "shiyuan",
   "label": "释怨",
   "members": [
    "g_ganning",
    "g_lingtong"
   ],
   "bonus": 0.04
  },
  {
   "key": "shenting",
   "label": "神亭",
   "members": [
    "g_sunce",
    "g_taishici"
   ],
   "bonus": 0.04
  },
  {
   "key": "xiapi",
   "label": "下邳",
   "members": [
    "g_lvbu",
    "g_chengong",
    "g_gaoshun"
   ],
   "bonus": 0.04
  },
  {
   "key": "hebei",
   "label": "河北",
   "members": [
    "g_yuanshao",
    "g_jushou",
    "g_yanliang"
   ],
   "bonus": 0.04
  },
  {
   "key": "pingluan",
   "label": "平乱",
   "members": [
    "g_huangfusong",
    "g_zhujun",
    "g_luzhi"
   ],
   "bonus": 0.04
  },
  {
   "key": "ershi",
   "label": "二士",
   "members": [
    "g_dengai",
    "g_zhonghui"
   ],
   "bonus": 0.04
  },
  {
   "key": "pingwu",
   "label": "平吴",
   "members": [
    "g_yanghu",
    "g_duyu",
    "g_wangjun"
   ],
   "bonus": 0.04
  },
  {
   "key": "henei",
   "label": "河内",
   "members": [
    "g_simayi",
    "g_simashi",
    "g_simazhao"
   ],
   "bonus": 0.04
  },
  {
   "key": "fuzi_guan",
   "label": "父子同袍",
   "members": [
    "g_guanyu",
    "g_guanping"
   ],
   "bonus": 0.04
  },
  {
   "key": "fuzi_lu",
   "label": "父子同袍",
   "members": [
    "g_luxun",
    "g_lukang"
   ],
   "bonus": 0.04
  },
  {
   "key": "houji",
   "label": "承业",
   "members": [
    "g_jiangwan",
    "g_feiyi",
    "g_jiangwei"
   ],
   "bonus": 0.04
  }
 ],
 "note": "v1 roster (120), spec Appendix C. The 32 Phase 1 generals keep their exact stats. Stats are our own judgement (INFERENCE); any change bumps contentVersion.",
 "generals": [
  {
   "id": "g_liubei",
   "name": "刘备",
   "courtesy": "玄德",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "备",
   "blurb": "仁德服人，百折不挠。",
   "statNote": "仁10：所至之处士民相随；勇6：并非以勇力取胜。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_guanyu",
   "name": "关羽",
   "courtesy": "云长",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
    "taoyuan",
    "fuzi_guan"
   ],
   "portraitId": null,
   "monogram": "羽",
   "blurb": "义薄云天，万人敌。",
   "statNote": "信10：千里走单骑；勇10：斩颜良于万军之中。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhangfei",
   "name": "张飞",
   "courtesy": "益德",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "飞",
   "blurb": "当阳桥头，一声断喝。",
   "statNote": "勇10：长坂坡据水断桥；仁4：鞭挞健儿，终致祸患。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhugeliang",
   "name": "诸葛亮",
   "courtesy": "孔明",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "bonds": [
    "longfeng"
   ],
   "portraitId": null,
   "monogram": "亮",
   "blurb": "鞠躬尽瘁，运筹千里。",
   "statNote": "智10：隆中对、借东风；勇3：不亲冒矢石。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhaoyun",
   "name": "赵云",
   "courtesy": "子龙",
   "faction": "shu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ],
     "note": "从公孙瓒"
    },
    {
     "faction": "shu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "云",
   "blurb": "一身是胆，忠勇无双。",
   "statNote": "信10：终身无二主；智6：以勇略见长而非谋主；增「从公孙瓒」群-QX 出场（原为简化）；约200 归刘备。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_machao",
   "name": "马超",
   "courtesy": "孟起",
   "faction": "shu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong",
      "chibi"
     ],
     "note": "关中时期"
    },
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "bonds": [
    "xiliang"
   ],
   "portraitId": null,
   "monogram": "超",
   "blurb": "锦马超，冲阵无前。",
   "statNote": "勇10：渭水之战几擒曹操；信4：反复于诸侯之间；QX/CB 关中时期改归群（潼关 211）；214 归刘备。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_huangzhong",
   "name": "黄忠",
   "courtesy": "汉升",
   "faction": "shu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ],
     "note": "从刘表"
    },
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
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
   "portraitId": null,
   "monogram": "忠",
   "blurb": "老当益壮，定军斩将。",
   "statNote": "勇9：定军山斩夏侯渊；智5：以勇名而非谋略；增「从刘表」群-QX；约209 归刘备；定军山 219。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_jiangwei",
   "name": "姜维",
   "courtesy": "伯约",
   "faction": "shu",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "sanfen"
     ],
     "note": "天水仕魏"
    },
    {
     "faction": "shu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
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
   "bonds": [
    "houji"
   ],
   "portraitId": null,
   "monogram": "维",
   "blurb": "文武兼资，继志北伐。",
   "statNote": "智8：屡出祁山，善用奇兵；信8：诸葛亮遗志之继承者；增天水仕魏（至 228）与归晋时期北伐（至 263）。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_jianyong",
   "name": "简雍",
   "courtesy": "宪和",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 6,
    "xin": 8,
    "ren": 6,
    "yong": 2,
    "yan": 3
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "雍",
   "blurb": "少与先主有旧，谈笑从容。",
   "statNote": "少与先主有旧；严3：性简傲跌宕；214 说刘璋。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_pangtong",
   "name": "庞统",
   "courtesy": "士元",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "chibi"
     ]
    }
   ],
   "eras": [
    "chibi"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 7,
    "ren": 6,
    "yong": 3,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [
    "longfeng"
   ],
   "portraitId": null,
   "monogram": "统",
   "blurb": "凤雏之才，献策取蜀。",
   "statNote": "凤雏；献取蜀三计；卒于214 雒城。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_fazheng",
   "name": "法正",
   "courtesy": "孝直",
   "faction": "shu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "chibi"
     ],
     "note": "先仕刘璋"
    },
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 6,
    "ren": 3,
    "yong": 3,
    "yan": 7
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "正",
   "blurb": "奇谋善断，定军之谋。",
   "statNote": "先仕刘璋；定军山之谋；仁3：睚眦之怨无不报复；卒于220。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_weiyan",
   "name": "魏延",
   "courtesy": "文长",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 6,
    "xin": 5,
    "ren": 4,
    "yong": 9,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "延",
   "blurb": "镇守汉中，胆略过人。",
   "statNote": "镇汉中 219；信5：与杨仪不睦，卒于234。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_madai",
   "name": "马岱",
   "courtesy": "",
   "faction": "shu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "chibi"
     ],
     "note": "随马超"
    },
    {
     "faction": "shu",
     "eras": [
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 8,
    "ren": 5,
    "yong": 7,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [
    "xiliang"
   ],
   "portraitId": null,
   "monogram": "岱",
   "blurb": "随主入蜀，奉命斩将。",
   "statNote": "随马超入蜀；234 斩魏延。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_guanping",
   "name": "关平",
   "courtesy": "",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 4,
    "xin": 9,
    "ren": 5,
    "yong": 7,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [
    "fuzi_guan"
   ],
   "portraitId": null,
   "monogram": "平",
   "blurb": "随父镇守荆州。",
   "statNote": "随父镇荆州；219 同殁临沮。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_wangping",
   "name": "王平",
   "courtesy": "子均",
   "faction": "shu",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "sanfen"
     ],
     "note": "仕曹营"
    },
    {
     "faction": "shu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 8,
    "ren": 5,
    "yong": 6,
    "yan": 10
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "平",
   "blurb": "识字不多，持法严明。",
   "statNote": "219 自曹营归刘备；严10：遵履法度；兴势 244。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_masu",
   "name": "马谡",
   "courtesy": "幼常",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 8,
    "xin": 6,
    "ren": 5,
    "yong": 3,
    "yan": 3
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "谡",
   "blurb": "善谋攻心，街亭失守。",
   "statNote": "攻心之策；严3：街亭违亮节度 228。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_maliang",
   "name": "马良",
   "courtesy": "季常",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 7,
    "xin": 8,
    "ren": 7,
    "yong": 2,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "良",
   "blurb": "白眉最良，早逝夷陵。",
   "statNote": "「马氏五常，白眉最良」；卒于222 夷陵。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_jiangwan",
   "name": "蒋琬",
   "courtesy": "公琰",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 8,
    "xin": 9,
    "ren": 8,
    "yong": 2,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [
    "houji"
   ],
   "portraitId": null,
   "monogram": "琬",
   "blurb": "继亮秉政，安定蜀中。",
   "statNote": "继亮秉政，安定蜀中；卒于246。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_feiyi",
   "name": "费祎",
   "courtesy": "文伟",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 8,
    "xin": 8,
    "ren": 8,
    "yong": 3,
    "yan": 5
   },
   "tier": "yi",
   "bonds": [
    "houji"
   ],
   "portraitId": null,
   "monogram": "祎",
   "blurb": "宽济从容，折冲樽俎。",
   "statNote": "兴势退魏 244；严5：宽济而疏于防范，卒于253。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhangni",
   "name": "张嶷",
   "courtesy": "伯岐",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 9,
    "ren": 7,
    "yong": 7,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "嶷",
   "blurb": "安定越嶲，恩信并著。",
   "statNote": "安定越嶲，恩信并著；卒于254。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_liaohua",
   "name": "廖化",
   "courtesy": "元俭",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 9,
    "ren": 5,
    "yong": 6,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "化",
   "blurb": "久经行阵，以果烈称。",
   "statNote": "222 诈死归蜀（陷吴不足一年，不计入吴）；以果烈称。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_huangquan",
   "name": "黄权",
   "courtesy": "公衡",
   "faction": "shu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "chibi"
     ],
     "note": "先仕刘璋"
    },
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    },
    {
     "faction": "wei",
     "eras": [
      "sanfen"
     ],
     "note": "夷陵降魏"
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 8,
    "xin": 8,
    "ren": 6,
    "yong": 4,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "权",
   "blurb": "忠谋之士，进退两难。",
   "statNote": "先仕刘璋；222 夷陵后降魏：「臣降吴不可，还蜀无路」。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_liushan",
   "name": "刘禅",
   "courtesy": "公嗣",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 4,
    "xin": 6,
    "ren": 7,
    "yong": 1,
    "yan": 2
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "禅",
   "blurb": "在位四十一年。",
   "statNote": "在位四十一年；政事委于诸葛亮、蒋琬；263 降。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_luoxian",
   "name": "罗宪",
   "courtesy": "令则",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "guijin"
     ]
    },
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ],
     "note": "后仕晋"
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 9,
    "ren": 6,
    "yong": 6,
    "yan": 9
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "宪",
   "blurb": "死守永安，不负故主。",
   "statNote": "264 守永安拒吴，后仕晋。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xushu",
   "name": "徐庶",
   "courtesy": "元直",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "qunxiong"
     ],
     "note": "辅先主"
    },
    {
     "faction": "wei",
     "eras": [
      "chibi",
      "sanfen"
     ],
     "note": "归曹营"
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 8,
    "ren": 7,
    "yong": 4,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "庶",
   "blurb": "荐贤而去，身在曹营。",
   "statNote": "荐诸葛亮；208 母被执，辞先主归曹。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_mifang",
   "name": "糜芳",
   "courtesy": "子方",
   "faction": "shu",
   "appearances": [
    {
     "faction": "shu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    },
    {
     "faction": "wu",
     "eras": [
      "sanfen"
     ],
     "note": "降吴"
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 3,
    "xin": 2,
    "ren": 4,
    "yong": 4,
    "yan": 3
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "芳",
   "blurb": "守江陵，终降东吴。",
   "statNote": "194 随刘备；守江陵；219 降吴（信2）。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_caocao",
   "name": "曹操",
   "courtesy": "孟德",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "操",
   "blurb": "挟令诸侯，法度森严。",
   "statNote": "严10：割发代首，军令如山；信6：多疑而善用人。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhanghe",
   "name": "张郃",
   "courtesy": "儁乂",
   "faction": "wei",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ],
     "note": "从袁绍"
    },
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "郃",
   "blurb": "巧变知兵，长于野战。",
   "statNote": "智7：善于临阵应变；严8：用兵有法度；HJ 改为群（从韩馥讨黄巾），QX 从袁绍至 200，后归曹。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xiahoudun",
   "name": "夏侯惇",
   "courtesy": "元让",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "huangjin",
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
   "portraitId": null,
   "monogram": "惇",
   "blurb": "拔矢啖睛，刚烈忠贞。",
   "statNote": "信9：自始追随曹操；勇8：拔矢啖睛而战不止；增 HJ（「太祖初起，惇常为裨将」189）；卒于220。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhangliao",
   "name": "张辽",
   "courtesy": "文远",
   "faction": "wei",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ],
     "note": "丁原董卓"
    },
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "huangjin",
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
   "portraitId": null,
   "monogram": "辽",
   "blurb": "威震逍遥津。",
   "statNote": "勇9：合肥以八百破十万；严9：夜定军中之乱；增群 HJ/QX（丁原、何进、董卓、吕布，至 198）；合肥 215。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xuchu",
   "name": "许褚",
   "courtesy": "仲康",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "bonds": [
    "suwei"
   ],
   "portraitId": null,
   "monogram": "褚",
   "blurb": "虎痴护主，力敌万夫。",
   "statNote": "信10：宿卫曹操终身；勇10：裸衣斗马超；智3：憨直少谋。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xunyu",
   "name": "荀彧",
   "courtesy": "文若",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "彧",
   "blurb": "王佐之才，匡扶汉室。",
   "statNote": "智9：筹划大局；勇2：不预军阵；仁9：荐才安民。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_guojia",
   "name": "郭嘉",
   "courtesy": "奉孝",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "嘉",
   "blurb": "料事如神，不拘小节。",
   "statNote": "智10：十胜十败之论；严3：不治行检，屡遭劾奏。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_simayi",
   "name": "司马懿",
   "courtesy": "仲达",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "sanfen",
      "guijin"
     ]
    },
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ],
     "note": "高平陵后"
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
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
   "bonds": [
    "henei"
   ],
   "portraitId": null,
   "monogram": "懿",
   "blurb": "隐忍多谋，善守善断。",
   "statNote": "智10：擒孟达、拒诸葛；信5：城府极深；增魏 GJ（辽东 238）与晋 GJ（高平陵 249）。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xiahouyuan",
   "name": "夏侯渊",
   "courtesy": "妙才",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 8,
    "ren": 5,
    "yong": 8,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "渊",
   "blurb": "虎步关右，三日五百。",
   "statNote": "189 随曹操起兵；虎步关右；卒于219 定军山。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_caoren",
   "name": "曹仁",
   "courtesy": "子孝",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 9,
    "ren": 6,
    "yong": 8,
    "yan": 9
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": null,
   "monogram": "仁",
   "blurb": "镇守江陵，沉毅持重。",
   "statNote": "189 聚众从曹操；守江陵 208、樊城 219。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_yuejin",
   "name": "乐进",
   "courtesy": "文谦",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 8,
    "ren": 5,
    "yong": 9,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "进",
   "blurb": "每战先登，勇冠三军。",
   "statNote": "每战先登；卒于218。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_yujin",
   "name": "于禁",
   "courtesy": "文则",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 4,
    "ren": 3,
    "yong": 6,
    "yan": 10
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "禁",
   "blurb": "毅重严整，以法御下。",
   "statNote": "严10：以法御下；信4：219 樊城降关羽（被俘不计入他营）。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xuhuang",
   "name": "徐晃",
   "courtesy": "公明",
   "faction": "wei",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ],
     "note": "先随杨奉"
    },
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 6,
    "xin": 8,
    "ren": 6,
    "yong": 8,
    "yan": 9
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "晃",
   "blurb": "长驱直入，解围樊城。",
   "statNote": "先随杨奉，196 归曹；219 樊城解围。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_dianwei",
   "name": "典韦",
   "courtesy": "",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 2,
    "xin": 10,
    "ren": 4,
    "yong": 10,
    "yan": 5
   },
   "tier": "yi",
   "bonds": [
    "suwei"
   ],
   "portraitId": null,
   "monogram": "韦",
   "blurb": "宛城护主，力战而殁。",
   "statNote": "197 宛城护主战死。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_caopi",
   "name": "曹丕",
   "courtesy": "子桓",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 7,
    "xin": 5,
    "ren": 4,
    "yong": 4,
    "yan": 7
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "丕",
   "blurb": "文武兼修，受禅称帝。",
   "statNote": "211 副丞相；220 代汉；卒于226。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_caozhen",
   "name": "曹真",
   "courtesy": "子丹",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "sanfen"
     ]
    }
   ],
   "eras": [
    "sanfen"
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
   "portraitId": null,
   "monogram": "真",
   "blurb": "与士卒同劳苦。",
   "statNote": "228 拒诸葛亮；与士卒同劳苦；卒于231。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_jiaxu",
   "name": "贾诩",
   "courtesy": "文和",
   "faction": "wei",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ],
     "note": "先仕董卓"
    },
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 10,
    "xin": 5,
    "ren": 4,
    "yong": 2,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "诩",
   "blurb": "深谋远虑，料事审势。",
   "statNote": "先仕董卓、李傕、张绣，199 归曹；卒于223。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_chengyu",
   "name": "程昱",
   "courtesy": "仲德",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 8,
    "xin": 8,
    "ren": 3,
    "yong": 5,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "昱",
   "blurb": "守鄄城，刚戾多谋。",
   "statNote": "194 守鄄城；仁3：性刚戾；卒于220。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xunyou",
   "name": "荀攸",
   "courtesy": "公达",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 9,
    "ren": 7,
    "yong": 2,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "攸",
   "blurb": "深密有智防。",
   "statNote": "前后凡画奇策十二；卒于214。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_manchong",
   "name": "满宠",
   "courtesy": "伯宁",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen",
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 8,
    "xin": 9,
    "ren": 6,
    "yong": 5,
    "yan": 10
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": null,
   "monogram": "宠",
   "blurb": "执法不阿，镇守合肥。",
   "statNote": "严10：执法不阿；233 筑合肥新城；卒于242。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_guohuai",
   "name": "郭淮",
   "courtesy": "伯济",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 8,
    "ren": 6,
    "yong": 6,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "淮",
   "blurb": "镇关中三十余年。",
   "statNote": "219 收定军山散卒；镇关中三十余年。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_dengai",
   "name": "邓艾",
   "courtesy": "士载",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 9,
    "xin": 7,
    "ren": 5,
    "yong": 8,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [
    "ershi"
   ],
   "portraitId": null,
   "monogram": "艾",
   "blurb": "偷渡阴平，直取成都。",
   "statNote": "263 阴平入蜀；卒于264（未仕晋，PO-3）。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhonghui",
   "name": "钟会",
   "courtesy": "士季",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 2,
    "ren": 3,
    "yong": 4,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [
    "ershi"
   ],
   "portraitId": null,
   "monogram": "会",
   "blurb": "少有才名，志大难制。",
   "statNote": "263 伐蜀；信2：264 成都举兵。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_pangde",
   "name": "庞德",
   "courtesy": "令明",
   "faction": "wei",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong",
      "chibi"
     ],
     "note": "随马超"
    },
    {
     "faction": "wei",
     "eras": [
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 4,
    "xin": 10,
    "ren": 5,
    "yong": 9,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [
    "xiliang"
   ],
   "portraitId": null,
   "monogram": "德",
   "blurb": "抬棺决战，不降樊城。",
   "statNote": "随马超、张鲁，215 归曹；信10：219 樊城不降。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_chentai",
   "name": "陈泰",
   "courtesy": "玄伯",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 8,
    "xin": 9,
    "ren": 7,
    "yong": 5,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "泰",
   "blurb": "解围狄道，沉着应敌。",
   "statNote": "255 解狄道之围；卒于260。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xiahouba",
   "name": "夏侯霸",
   "courtesy": "仲权",
   "faction": "wei",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "sanfen",
      "guijin"
     ]
    },
    {
     "faction": "shu",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 5,
    "ren": 5,
    "yong": 7,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "霸",
   "blurb": "奔蜀归汉，辗转异乡。",
   "statNote": "249 奔蜀。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_sunjian",
   "name": "孙坚",
   "courtesy": "文台",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "坚",
   "blurb": "江东猛虎，身先士卒。",
   "statNote": "勇9：讨黄巾、破董卓，常为先登；智6：勇略兼具。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_chengpu",
   "name": "程普",
   "courtesy": "德谋",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "普",
   "blurb": "三代元老，持重有度。",
   "statNote": "信8：历事孙坚、孙策、孙权；严8：治军有方。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_huanggai",
   "name": "黄盖",
   "courtesy": "公覆",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "盖",
   "blurb": "苦肉诈降，火烧赤壁。",
   "statNote": "信9：甘受杖责行诈降计；勇8：赤壁纵火冲阵。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_sunce",
   "name": "孙策",
   "courtesy": "伯符",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong"
     ]
    }
   ],
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
    "jiangdong",
    "shenting"
   ],
   "portraitId": null,
   "monogram": "策",
   "blurb": "小霸王，横扫江东。",
   "statNote": "勇9：数年平定江东；严8：军令整肃。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhouyu",
   "name": "周瑜",
   "courtesy": "公瑾",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "瑜",
   "blurb": "雅量高致，火攻破曹。",
   "statNote": "智10：赤壁定策；信9：与孙策断金之交。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_sunquan",
   "name": "孙权",
   "courtesy": "仲谋",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen",
    "guijin"
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
   "portraitId": null,
   "monogram": "权",
   "blurb": "坐断东南，知人善任。",
   "statNote": "智8：知人善任；勇5：不亲冒锋镝。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_lvmeng",
   "name": "吕蒙",
   "courtesy": "子明",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "蒙",
   "blurb": "士别三日，白衣渡江。",
   "statNote": "智8：奇袭荆州；严9：军纪严明，入城秋毫无犯。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_luxun",
   "name": "陆逊",
   "courtesy": "伯言",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
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
   "bonds": [
    "fuzi_lu"
   ],
   "portraitId": null,
   "monogram": "逊",
   "blurb": "书生拜将，火烧连营。",
   "statNote": "智9：夷陵之战以守代攻；信9：持重可托。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_handang",
   "name": "韩当",
   "courtesy": "义公",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 9,
    "ren": 5,
    "yong": 8,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "当",
   "blurb": "历事三主，征伐不辍。",
   "statNote": "从孙坚征伐；历事三主；卒于227。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhuzhi",
   "name": "朱治",
   "courtesy": "君理",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 9,
    "ren": 7,
    "yong": 5,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "治",
   "blurb": "追随孙坚，镇守吴郡。",
   "statNote": "从孙坚征伐（187 长沙）；镇吴郡；卒于224。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_taishici",
   "name": "太史慈",
   "courtesy": "子义",
   "faction": "wu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ],
     "note": "先从刘繇"
    },
    {
     "faction": "wu",
     "eras": [
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 6,
    "xin": 10,
    "ren": 6,
    "yong": 9,
    "yan": 7
   },
   "tier": "jia",
   "bonds": [
    "shenting"
   ],
   "portraitId": null,
   "monogram": "慈",
   "blurb": "信守然诺，弓马娴熟。",
   "statNote": "先从刘繇；信10：「约日中而反」如期而至；卒于206。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_ganning",
   "name": "甘宁",
   "courtesy": "兴霸",
   "faction": "wu",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ],
     "note": "先依刘表"
    },
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 6,
    "xin": 6,
    "ren": 4,
    "yong": 10,
    "yan": 5
   },
   "tier": "yi",
   "bonds": [
    "shiyuan"
   ],
   "portraitId": null,
   "monogram": "宁",
   "blurb": "百骑劫营，锦帆游侠。",
   "statNote": "先依刘表、黄祖；213 百骑劫营；仁4：粗猛好杀。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhoutai",
   "name": "周泰",
   "courtesy": "幼平",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 4,
    "xin": 10,
    "ren": 5,
    "yong": 9,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "泰",
   "blurb": "身被十二创，护主不退。",
   "statNote": "信10：身被十二创护孙权。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_lingtong",
   "name": "凌统",
   "courtesy": "公绩",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 6,
    "xin": 9,
    "ren": 7,
    "yong": 8,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [
    "shiyuan"
   ],
   "portraitId": null,
   "monogram": "统",
   "blurb": "逍遥津力战护主。",
   "statNote": "215 逍遥津力战护主；约卒于217。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_lusu",
   "name": "鲁肃",
   "courtesy": "子敬",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 9,
    "ren": 8,
    "yong": 4,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "肃",
   "blurb": "联刘抗曹，开阔大度。",
   "statNote": "联刘抗曹；215 单刀会；卒于217。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhangzhao",
   "name": "张昭",
   "courtesy": "子布",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen",
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 8,
    "xin": 9,
    "ren": 6,
    "yong": 2,
    "yan": 9
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "昭",
   "blurb": "直言廷争，托孤重臣。",
   "statNote": "孙策托孤；严9：直言廷争；卒于236。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhugejin",
   "name": "诸葛瑾",
   "courtesy": "子瑜",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen",
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 7,
    "xin": 9,
    "ren": 8,
    "yong": 3,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "瑾",
   "blurb": "温厚笃实，兄弟分仕。",
   "statNote": "约200 归孙权；兄弟分仕而无私；卒于241。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_xusheng",
   "name": "徐盛",
   "courtesy": "文向",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 8,
    "ren": 5,
    "yong": 8,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "盛",
   "blurb": "疑城退敌，沉勇善守。",
   "statNote": "224 疑城退曹丕。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhuran",
   "name": "朱然",
   "courtesy": "义封",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 9,
    "ren": 6,
    "yong": 7,
    "yan": 9
   },
   "tier": "jia",
   "bonds": [],
   "portraitId": null,
   "monogram": "然",
   "blurb": "守江陵，胆略过人。",
   "statNote": "223 守江陵；卒于249。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhuhuan",
   "name": "朱桓",
   "courtesy": "休穆",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 7,
    "ren": 6,
    "yong": 8,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "桓",
   "blurb": "濡须破敌，胆气过人。",
   "statNote": "222 濡须破曹仁；卒于238。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhugeke",
   "name": "诸葛恪",
   "courtesy": "元逊",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 6,
    "ren": 4,
    "yong": 5,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "恪",
   "blurb": "东兴大捷，才高气盛。",
   "statNote": "252 东兴大捷；253 新城失利。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_dingfeng",
   "name": "丁奉",
   "courtesy": "承渊",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 6,
    "xin": 8,
    "ren": 5,
    "yong": 9,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "奉",
   "blurb": "雪中奋短兵。",
   "statNote": "252 东兴雪中奋短兵；卒于271。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_lukang",
   "name": "陆抗",
   "courtesy": "幼节",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 9,
    "xin": 9,
    "ren": 8,
    "yong": 6,
    "yan": 9
   },
   "tier": "jia",
   "bonds": [
    "fuzi_lu"
   ],
   "portraitId": null,
   "monogram": "抗",
   "blurb": "镇守西陵，持重有度。",
   "statNote": "272 西陵；与羊祜对垒；卒于274。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_sunhao",
   "name": "孙皓",
   "courtesy": "元宗",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 5,
    "xin": 3,
    "ren": 1,
    "yong": 4,
    "yan": 3
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "皓",
   "blurb": "末代吴主，降于晋。",
   "statNote": "仁1：用刑酷烈（本传）；280 降晋。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_wuyan",
   "name": "吾彦",
   "courtesy": "士则",
   "faction": "wu",
   "appearances": [
    {
     "faction": "wu",
     "eras": [
      "guijin"
     ]
    },
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ],
     "note": "后仕晋"
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 9,
    "ren": 6,
    "yong": 8,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "彦",
   "blurb": "建平坚守，后仕于晋。",
   "statNote": "280 建平坚守，后仕晋。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhangjue",
   "name": "张角",
   "courtesy": "",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "角",
   "blurb": "太平道首，振臂一呼。",
   "statNote": "智7：一呼而天下响应；勇3：不亲战阵。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_huangfusong",
   "name": "皇甫嵩",
   "courtesy": "义真",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
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
   "bonds": [
    "pingluan"
   ],
   "portraitId": null,
   "monogram": "嵩",
   "blurb": "平乱安民，忠于汉室。",
   "statNote": "信9：拥兵而不自立；仁8：赈抚百姓；严9：治军整肃。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_dongzhuo",
   "name": "董卓",
   "courtesy": "仲颖",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "卓",
   "blurb": "凉州悍将，反复无常。",
   "statNote": "信2：弑立废主；仁1：暴虐失众；勇8：边地善战。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_yuanshao",
   "name": "袁绍",
   "courtesy": "本初",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
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
   "bonds": [
    "hebei"
   ],
   "portraitId": null,
   "monogram": "绍",
   "blurb": "四世三公，好谋无断。",
   "statNote": "智6：多谋而少决；严5：号令不一。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_hansui",
   "name": "韩遂",
   "courtesy": "文约",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong",
      "chibi"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "遂",
   "blurb": "凉州宿将，纵横反复。",
   "statNote": "信3：屡叛屡盟；智7：善结豪强。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_lvbu",
   "name": "吕布",
   "courtesy": "奉先",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "huangjin",
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
   "bonds": [
    "xiapi"
   ],
   "portraitId": null,
   "monogram": "布",
   "blurb": "飞将无双，反复难恃。",
   "statNote": "勇10：辕门射戟、虎牢独战；信2：三易其主；增 HJ（189 为丁原主簿）；先后从丁原、董卓，皆在群营；卒于198。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhanglu",
   "name": "张鲁",
   "courtesy": "公祺",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "鲁",
   "blurb": "据汉中以五斗米道安民。",
   "statNote": "仁9：设义舍、行教化；勇3：不好征战。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_menghuo",
   "name": "孟获",
   "courtesy": "",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "sanfen"
     ]
    }
   ],
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
   "portraitId": null,
   "monogram": "获",
   "blurb": "南中豪帅，七擒七纵。",
   "statNote": "勇8：南中夷汉所服；智4：易被诱敌之计。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_luzhi",
   "name": "卢植",
   "courtesy": "子干",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 8,
    "xin": 9,
    "ren": 8,
    "yong": 5,
    "yan": 8
   },
   "tier": "jia",
   "bonds": [
    "pingluan"
   ],
   "portraitId": null,
   "monogram": "植",
   "blurb": "名儒领兵，刘备之师。",
   "statNote": "184 讨张角；刘备之师；卒于192。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhujun",
   "name": "朱儁",
   "courtesy": "公伟",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 7,
    "xin": 8,
    "ren": 6,
    "yong": 7,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [
    "pingluan"
   ],
   "portraitId": null,
   "monogram": "儁",
   "blurb": "破宛城黄巾。",
   "statNote": "184 破宛城黄巾；卒于195。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_gongsunzan",
   "name": "公孙瓒",
   "courtesy": "伯珪",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "huangjin",
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "huangjin",
    "qunxiong"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 5,
    "xin": 5,
    "ren": 3,
    "yong": 9,
    "yan": 7
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "瓒",
   "blurb": "白马义从，威震北疆。",
   "statNote": "187 讨张纯；白马义从；卒于199。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_yuanshu",
   "name": "袁术",
   "courtesy": "公路",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 4,
    "xin": 3,
    "ren": 2,
    "yong": 4,
    "yan": 3
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "术",
   "blurb": "据有淮南，僭号称帝。",
   "statNote": "信3：197 僭号；卒于199。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_liubiao",
   "name": "刘表",
   "courtesy": "景升",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong",
      "chibi"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 7,
    "xin": 7,
    "ren": 7,
    "yong": 3,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "表",
   "blurb": "保境安民，开立学官。",
   "statNote": "保荆州十余年，开立学官；卒于208。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_liuzhang",
   "name": "刘璋",
   "courtesy": "季玉",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong",
      "chibi"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 4,
    "xin": 7,
    "ren": 7,
    "yong": 2,
    "yan": 3
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "璋",
   "blurb": "牧守益州，开城迎客。",
   "statNote": "194-214 牧益州；214 开城。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhangren",
   "name": "张任",
   "courtesy": "",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "chibi"
     ]
    }
   ],
   "eras": [
    "chibi"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 10,
    "ren": 5,
    "yong": 8,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "任",
   "blurb": "死守雒城，不事二主。",
   "statNote": "213 雒城；信10：「老臣终不复事二主」。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_yanliang",
   "name": "颜良",
   "courtesy": "",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 3,
    "xin": 7,
    "ren": 4,
    "yong": 9,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [
    "hebei"
   ],
   "portraitId": null,
   "monogram": "良",
   "blurb": "河北名将，白马陷阵。",
   "statNote": "200 白马。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_jushou",
   "name": "沮授",
   "courtesy": "",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 10,
    "ren": 6,
    "yong": 3,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [
    "hebei"
   ],
   "portraitId": null,
   "monogram": "授",
   "blurb": "多谋忠烈，被执不降。",
   "statNote": "200 官渡被执不降。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_chengong",
   "name": "陈宫",
   "courtesy": "公台",
   "faction": "qun",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "qunxiong"
     ],
     "note": "从曹操"
    },
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 8,
    "xin": 6,
    "ren": 5,
    "yong": 4,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [
    "xiapi"
   ],
   "portraitId": null,
   "monogram": "宫",
   "blurb": "迎布入兖，终随下邳。",
   "statNote": "190-194 从曹操、迎入兖州；194 迎吕布；卒于198。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_gaoshun",
   "name": "高顺",
   "courtesy": "",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong"
     ]
    }
   ],
   "eras": [
    "qunxiong"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 5,
    "xin": 10,
    "ren": 6,
    "yong": 8,
    "yan": 10
   },
   "tier": "jia",
   "bonds": [
    "xiapi"
   ],
   "portraitId": null,
   "monogram": "顺",
   "blurb": "陷阵之营，清白威严。",
   "statNote": "陷阵营；「清白有威严」；卒于198。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_gongsunkang",
   "name": "公孙康",
   "courtesy": "",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "qunxiong",
      "chibi",
      "sanfen"
     ]
    }
   ],
   "eras": [
    "qunxiong",
    "chibi",
    "sanfen"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 6,
    "xin": 5,
    "ren": 4,
    "yong": 5,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "康",
   "blurb": "雄踞辽东，斩送袁尚。",
   "statNote": "204 嗣位辽东；207 斩袁尚；约卒于221。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_mengda",
   "name": "孟达",
   "courtesy": "子度",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "chibi"
     ],
     "note": "先仕刘璋"
    },
    {
     "faction": "shu",
     "eras": [
      "chibi",
      "sanfen"
     ]
    },
    {
     "faction": "wei",
     "eras": [
      "sanfen"
     ]
    }
   ],
   "eras": [
    "chibi",
    "sanfen"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 2,
    "ren": 4,
    "yong": 6,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "达",
   "blurb": "往来蜀魏之间。",
   "statNote": "先仕刘璋；220 降魏；228 欲复归蜀（信2）。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_gongsunyuan",
   "name": "公孙渊",
   "courtesy": "文懿",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "sanfen",
      "guijin"
     ]
    }
   ],
   "eras": [
    "sanfen",
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 5,
    "xin": 2,
    "ren": 3,
    "yong": 5,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "渊",
   "blurb": "反复辽东，终败襄平。",
   "statNote": "228 夺位辽东；反复于魏吴（信2）；238 败亡。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhugedan",
   "name": "诸葛诞",
   "courtesy": "公休",
   "faction": "qun",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "guijin"
     ],
     "note": "仕魏"
    },
    {
     "faction": "qun",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 6,
    "xin": 5,
    "ren": 7,
    "yong": 5,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "诞",
   "blurb": "寿春举兵，部众死节。",
   "statNote": "257 寿春举兵；仁7：麾下数百人拱手不降。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_wenqin",
   "name": "文钦",
   "courtesy": "仲若",
   "faction": "qun",
   "appearances": [
    {
     "faction": "wei",
     "eras": [
      "guijin"
     ],
     "note": "仕魏"
    },
    {
     "faction": "qun",
     "eras": [
      "guijin"
     ],
     "note": "淮南举兵"
    },
    {
     "faction": "wu",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 4,
    "xin": 3,
    "ren": 3,
    "yong": 8,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "钦",
   "blurb": "淮南举兵，奔吴不归。",
   "statNote": "255 淮南举兵，奔吴（信3）；卒于258。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_wenyang",
   "name": "文鸯",
   "courtesy": "次骞",
   "faction": "qun",
   "appearances": [
    {
     "faction": "qun",
     "eras": [
      "guijin"
     ],
     "note": "淮南举兵"
    },
    {
     "faction": "wu",
     "eras": [
      "guijin"
     ],
     "note": "奔吴"
    },
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 5,
    "xin": 6,
    "ren": 5,
    "yong": 10,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "鸯",
   "blurb": "单骑退敌，胆气绝伦。",
   "statNote": "255 乐嘉单骑退敌；258 后仕晋。",
   "source": "三国志 / 三国演义（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_simashi",
   "name": "司马师",
   "courtesy": "子元",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 8,
    "xin": 5,
    "ren": 4,
    "yong": 5,
    "yan": 9
   },
   "tier": "yi",
   "bonds": [
    "henei"
   ],
   "portraitId": null,
   "monogram": "师",
   "blurb": "继掌朝政，刚毅果决。",
   "statNote": "255 平淮南；卒于255。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_simazhao",
   "name": "司马昭",
   "courtesy": "子上",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 8,
    "xin": 4,
    "ren": 4,
    "yong": 4,
    "yan": 8
   },
   "tier": "bing",
   "bonds": [
    "henei"
   ],
   "portraitId": null,
   "monogram": "昭",
   "blurb": "定策伐蜀，掌国十年。",
   "statNote": "258 平诸葛诞；263 定伐蜀之策；卒于265。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_simayan",
   "name": "司马炎",
   "courtesy": "安世",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 6,
    "xin": 6,
    "ren": 7,
    "yong": 3,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "炎",
   "blurb": "受禅建晋，终成一统。",
   "statNote": "266 受禅；280 一统。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_simafu",
   "name": "司马孚",
   "courtesy": "叔达",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 10,
    "ren": 8,
    "yong": 3,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "孚",
   "blurb": "魏室纯臣，高寿善终。",
   "statNote": "253 拒诸葛恪；信10：自称「大魏之纯臣」。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_simazhou",
   "name": "司马伷",
   "courtesy": "子将",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 6,
    "xin": 7,
    "ren": 6,
    "yong": 6,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "伷",
   "blurb": "宗室出镇，兵出涂中。",
   "statNote": "280 伐吴出涂中。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_yanghu",
   "name": "羊祜",
   "courtesy": "叔子",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "zhugong",
   "stats": {
    "zhi": 9,
    "xin": 10,
    "ren": 10,
    "yong": 4,
    "yan": 8
   },
   "tier": "jia",
   "bonds": [
    "pingwu"
   ],
   "portraitId": null,
   "monogram": "祜",
   "blurb": "缓带轻裘，镇荆怀远。",
   "statNote": "镇荆州，绥怀远近；堕泪碑；卒于278。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_duyu",
   "name": "杜预",
   "courtesy": "元凯",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 10,
    "xin": 8,
    "ren": 7,
    "yong": 2,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [
    "pingwu"
   ],
   "portraitId": null,
   "monogram": "预",
   "blurb": "博学多通，号杜武库。",
   "statNote": "「杜武库」；勇2：身不跨马；280 平吴。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_wangjun",
   "name": "王濬",
   "courtesy": "士治",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 8,
    "xin": 7,
    "ren": 6,
    "yong": 7,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [
    "pingwu"
   ],
   "portraitId": null,
   "monogram": "濬",
   "blurb": "楼船下益州。",
   "statNote": "280 楼船下益州。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_wanghun",
   "name": "王浑",
   "courtesy": "玄冲",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 7,
    "ren": 6,
    "yong": 6,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "浑",
   "blurb": "破张悌于江上。",
   "statNote": "280 破张悌。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_jiachong",
   "name": "贾充",
   "courtesy": "公闾",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 7,
    "xin": 3,
    "ren": 3,
    "yong": 3,
    "yan": 6
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "充",
   "blurb": "位高权重，伐吴都督。",
   "statNote": "信3：260 甘露之变中所为（《晋书》）；伐吴都督。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_shibao",
   "name": "石苞",
   "courtesy": "仲容",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 7,
    "xin": 7,
    "ren": 6,
    "yong": 7,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "苞",
   "blurb": "镇守淮南，练兵有方。",
   "statNote": "镇淮南。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_weiguan",
   "name": "卫瓘",
   "courtesy": "伯玉",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 8,
    "xin": 6,
    "ren": 5,
    "yong": 4,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "瓘",
   "blurb": "监军入蜀，平定乱局。",
   "statNote": "264 监军，平钟会之乱。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_malong",
   "name": "马隆",
   "courtesy": "孝兴",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 8,
    "xin": 8,
    "ren": 6,
    "yong": 7,
    "yan": 8
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "隆",
   "blurb": "以少胜众，平凉州。",
   "statNote": "279 西平凉州，以少胜众。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_zhanghua",
   "name": "张华",
   "courtesy": "茂先",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 9,
    "xin": 8,
    "ren": 7,
    "yong": 2,
    "yan": 6
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "华",
   "blurb": "力主伐吴，筹划军略。",
   "statNote": "力主伐吴，筹划军略。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_wangrong",
   "name": "王戎",
   "courtesy": "濬冲",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "junshi",
   "stats": {
    "zhi": 7,
    "xin": 5,
    "ren": 4,
    "yong": 4,
    "yan": 5
   },
   "tier": "bing",
   "bonds": [],
   "portraitId": null,
   "monogram": "戎",
   "blurb": "竹林名士，出武昌。",
   "statNote": "280 出武昌；仁4：性好兴利（《晋书》）。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_hufen",
   "name": "胡奋",
   "courtesy": "玄威",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "mengjiang",
   "stats": {
    "zhi": 6,
    "xin": 7,
    "ren": 5,
    "yong": 8,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "奋",
   "blurb": "性勇而果，攻江安。",
   "statNote": "280 攻江安。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_tangbin",
   "name": "唐彬",
   "courtesy": "儒宗",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "xianfeng",
   "stats": {
    "zhi": 7,
    "xin": 7,
    "ren": 7,
    "yong": 8,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "彬",
   "blurb": "随军先驱，伐吴立功。",
   "statNote": "随王濬伐吴为先驱。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
  },
  {
   "id": "g_chenqian",
   "name": "陈骞",
   "courtesy": "休渊",
   "faction": "jin",
   "appearances": [
    {
     "faction": "jin",
     "eras": [
      "guijin"
     ]
    }
   ],
   "eras": [
    "guijin"
   ],
   "primaryRole": "shoujiang",
   "stats": {
    "zhi": 8,
    "xin": 6,
    "ren": 5,
    "yong": 6,
    "yan": 7
   },
   "tier": "yi",
   "bonds": [],
   "portraitId": null,
   "monogram": "骞",
   "blurb": "围寿春，持重稳健。",
   "statNote": "257 围寿春。",
   "source": "晋书（公有领域）",
   "contentVersion": 2
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
