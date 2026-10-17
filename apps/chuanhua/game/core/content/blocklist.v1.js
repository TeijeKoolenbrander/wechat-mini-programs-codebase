'use strict';
/**
 * Local blocklist v1 (spec 5.6, PO-12). Checked BEFORE any moderation API call, so a hit costs no quota and
 * gives no strike ("换个说法吧"). A .js module on purpose: WeChat cannot require .json and the list must never
 * be fetched remotely.
 *
 * Categories (spec 5.6): political terms and leaders' names, sexual terms, insults and slurs, drugs, gambling,
 * violence/terror, regional and ethnic slurs; plus `spam` (ad / scam wording) because contact and ad patterns
 * are a minors-protection and anti-spam rule too.
 *
 * Matching (core/text.js#blocklistHit): the text is NFKC-normalised, lower-cased, and everything that is not a
 * letter or digit is dropped, so "傻 逼", "傻.逼" and "傻　逼" all match "傻逼".
 *   zh            CJK (and mixed CJK/Latin) terms: substring match on the normalised text.
 *   latin.token   whole Latin words: matched against the Latin letter-runs of the text ("sb" hits "sb" but not "sbo").
 *   latin.contains distinctive Latin words long enough to substring-match on the normalised text.
 *
 * OWNER: the content owner reviews and extends this list before submission (Handoff H13). It is deliberately
 * conservative: false positives cost one retype, false negatives cost the entity. Adding a term needs a test
 * that no prompt in prompts.v1.js matches it (tests/content-prompts.test.js, AC 87 runs automatically).
 */

const BLOCKLIST_VERSION = 1;

const zh = {
  political: [
    '习近平', '習近平', '习主席', '习包子', '习大大', '小熊维尼', '毛泽东', '毛澤東', '毛主席', '邓小平', '鄧小平', '江泽民', '江澤民',
    '胡锦涛', '胡錦濤', '李克强', '温家宝', '朱镕基', '李鹏', '赵紫阳', '胡耀邦', '薄熙来', '刘晓波', '彭丽媛', '王岐山',
    '共产党', '共產黨', '共匪', '中共', '国民党', '民进党', '蔡英文', '赖清德', '特朗普', '川普', '拜登', '普京', '金正恩', '奥巴马',
    '六四', '八九民运', '天安门', '天安門', '五星红旗', '国旗', '国徽',
    '法轮', '法輪', '李洪志', '全能神', '东方闪电', '邪教',
    '台独', '台獨', '藏独', '藏獨', '疆独', '港独', '达赖', '反华', '反共', '颠覆国家', '推翻政府', '游行示威', '政变', '暴动', '汉奸',
    '李强', '赵乐际', '王沪宁', '蔡奇', '丁薛祥', '李希', '韩正', '周恩来',
    '总书记', '国家主席', '庆丰包子', '维尼熊', '8964', '五月三十五', '坦克人', '文革',
    '文化大革命', '集中营', '再教育营', '台湾独立', '香港独立', '光复香港', '时代革命', '国歌',
    '党旗', '党徽', '军旗', '共党', '反党', '习总', '中南海',
  ],
  sexual: [
    '色情', '黄色网站', '黄片', '毛片', '三级片', '成人网站', '成人影片', '激情视频', 'av女优', '做爱', '性爱', '性交', '性行为', '口交', '肛交',
    '轮奸', '强奸', '强暴', '乱伦', '自慰', '手淫', '打飞机', '约炮', '炮友', '一夜情', '嫖娼', '卖淫', '妓女', '援交', '裸体', '裸照', '裸聊',
    '露点', '乳房', '乳头', '奶子', '阴茎', '阴道', '阴蒂', '龟头', '鸡巴', '屌', '操逼', '草逼', '日逼', '骚货', '骚逼', '淫荡', '淫乱', '淫秽',
    '情趣用品', '春药', '催情', '性奴', '性虐', '偷拍', '走光', '春宫',
    '小鸡鸡', '小丁丁', '大胸', '巨乳', '奶头', '裸奔', '裸露', '脱光',
    '包养', '大鸡吧', '屄', '嫖', '嫖客', '妓院', '迷奸', '幼女',
    '恋童', '强上', '下体', '私处', '生殖器', '三陪',
  ],
  insult: [
    '傻逼', '傻b', '煞笔', '傻比', '沙比', '装逼', '牛逼', '弱智', '智障', '脑残', '白痴', '蠢货', '去死', '死全家', '全家死光',
    '尼玛', '你大爷', '操你', '草你', '艹', '肏', '日你', '我操', '卧槽', '沃日', '特么', '贱人', '贱货', '婊子', '狗东西', '杂种', '畜生',
    '混蛋', '王八蛋', '龟孙', '老不死', '滚你妈',
    '他妈的', '你妈的', '妈了个', '你妈逼', '你妈死', '死妈', '狗日的', '婊',
    '人渣', '脑瘫', '残废', '低能儿', '娘炮', '人妖', '基佬', '蠢猪',
    '滚蛋', '草泥马', '妈逼', '日了狗', '傻x', '他娘的', '我草', '死爹',
  ],
  drugs: [
    '毒品', '吸毒', '贩毒', '制毒', '海洛因', '冰毒', '摇头丸', '可卡因', '鸦片', '嗑药', 'k粉', '麻古', '笑气', '迷药', '吗啡', '安非他命', '芬太尼',
    '吸大麻', '抽大麻', '大麻烟', '大麻叶', '毒贩', '大烟', '溜冰', 'k他',
    '神仙水', '开心水',
  ],
  gambling: [
    '赌博', '赌场', '赌钱', '赌球', '赌徒', '赌局', '网赌', '博彩', '六合彩', '时时彩', '百家乐', '老虎机', '轮盘赌', '押注', '下注', '澳门赌', '炸金花',
    '麻将', '彩票',
    '押宝', '买码', '赌马', '赌注', '德州扑克',
  ],
  violence: [
    '杀人', '杀死', '砍死', '砍人', '砍杀', '捅死', '捅人', '打死', '弄死', '炸死', '毒杀', '刺杀', '暗杀', '虐杀', '碎尸', '分尸', '肢解', '尸体',
    '自杀', '自残', '割腕', '跳楼', '上吊', '服毒', '炸弹', '炸药', '爆炸物', '恐怖袭击', '恐怖分子', '恐怖主义', '基地组织', '圣战', '斩首',
    '绑架', '劫持', '枪击', '开枪', '枪杀', '屠杀', '血腥', '虐待', '放火', '纵火', '报复社会',
    '杀了你', '杀你', '手枪', '步枪', '机枪', '冲锋枪', '狙击', '砍头',
    '割喉', '恐袭', '轻生', '想死', '不想活', '自焚', '自尽', '纳粹',
    '希特勒', '法西斯', '炸学校', '炸地铁', '爆头', '毒死',
  ],
  slur: [
    '支那', '黑鬼', '黑奴', '小日本', '日本鬼子', '阿三', '白皮猪', '蛮子', '东亚病夫', '乡巴佬', '土包子', '台巴子', '港巴佬', '南蛮', '北佬', '蛮夷',
    '高丽棒子', '韩国棒子', '尼哥', '鬼佬', '洋鬼子', '偷井盖', '外地狗', '小鬼子',
    '倭寇',
  ],
  spam: [
    '刷单', '贷款', '办证', '代开发票', '返利', '理财产品', '免费领', '点击领取', '扫码', '二维码', '转账', '加盟', '代练', '私服',
    '游戏外挂', '开外挂', '卖外挂', '日结工资', '日结兼职', '网贷', '裸贷', '套现',
    '代孕',
  ],
};

const latin = {
  token: {
    insult: ['sb', 'nmsl', 'cnm', 'wdnmd', 'tmd', 'nima', 'mlgb', 'wtf', 'stfu', 'cnmb', 'nmb', 'sjb', 'mdzz', 'rnm', 'shit'],
    sexual: ['sex', 'porn', 'xxx', 'nude', 'nudes', 'hentai', 'dick', 'cock', 'pussy', 'tits', 'boobs', 'penis', 'vagina', 'sexy', 'cum'],
    political: ['xjp', 'tiananmen', 'falun', 'isis', 'ccp', 'winnie', 'pooh', 'flg', 'nazi', 'hitler'],
    drugs: ['heroin', 'cocaine', 'meth', 'lsd'],
    violence: ['kill', 'suicide', 'bomb'],
  },
  contains: {
    insult: ['fuck', 'bitch', 'asshole', 'bastard', 'caonima', 'shabi'],
    slur: ['nigger', 'nigga', 'chink'],
    sexual: ['pornhub', 'blowjob'],
    political: ['jinping'],
  },
};

/**
 * Exceptions: everyday phrases that CONTAIN a listed term as a substring (docs/chuanhua/content-fixes.md 2.1,
 * qa/content-check.md). Each is blanked out of the normalised text BEFORE the zh terms are matched, so
 * "中共同参与" or "学习总结" pass while "中共" and "习总" still block. Keep this list short and only for
 * phrases a player could plausibly draw or describe. Every entry must contain a listed term (tested).
 */
const exceptions = [
  '中共同', '中共有', '乌龟头', '海龟头',
  '习总结', '习总是', '习总共', '习总会', '习总能', '习总要',
  '我草莓', '我草地', '我草原', '我草坪', '我草帽', '我草鱼', '我草丛', '我草药', '我草垛', '我草席',
  '想死党', '不想活动', '年轻生', '轻生活', '轻生日', '轻生意',
  '下体育', '加强上', '增强上', '强上课', '私处理',
  '大烟囱', '溜冰场', '溜冰鞋', '溜冰车', 'ok他',
  '买码头', '买码数', '韩正在', '韩正好', '韩正式', '李强壮', '李希望', '蔡奇怪',
];

module.exports = { BLOCKLIST_VERSION, zh, latin, exceptions };
