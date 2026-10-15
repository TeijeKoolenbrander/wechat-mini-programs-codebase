/**
 * Local blocklist v1 (spec 5.6). Checked before any moderation API call, so a hit costs no quota and
 * gives no strike. Plain .js module, never fetched remotely. Terms are matched as substrings after
 * normalisation (lower-case, spaces and punctuation removed).
 *
 * TODO(content owner, Handoff H13): this is a starter list written by the engineering team. It must be
 * reviewed and extended by the content owner before submission; it is a first filter, not the safety
 * net (msgSecCheck and mediaCheckAsync are).
 */

module.exports = {
  blocklistVersion: 1,
  categories: {
    politics: ['习近平', '毛泽东', '邓小平', '胡锦涛', '江泽民', '李克强', '共产党', '国民党', '法轮', '六四', '天安门事件', '台独', '藏独', '疆独', '港独', '反共', '推翻政府', '游行示威', '翻墙', '民运'],
    sexual: ['色情', '做爱', '性交', '性爱', '裸体', '裸照', '嫖娼', '卖淫', '强奸', '约炮', '黄片', '淫', '阴茎', '阴道', '乳头', '自慰', '情色', '三级片', '性感照', '一夜情'],
    abuse: ['傻逼', '傻b', '煞笔', '草泥马', '操你', '他妈的', '你妈的', '妈的', '去死', '脑残', '贱人', '婊子', '王八蛋', '狗日', '滚蛋', '废物', '智障', '白痴', '死全家'],
    drugs: ['毒品', '冰毒', '海洛因', '吸毒', '大麻', '摇头丸', '可卡因', '鸦片', '贩毒'],
    gambling: ['赌博', '赌场', '赌钱', '六合彩', '博彩', '赌球', '麻将', '押注', '下注', '彩票'],
    violence: ['杀人', '杀死', '砍死', '血腥', '恐怖袭击', '炸弹', '爆炸物', '自杀', '自残', '跳楼', '枪支', '恐怖分子', '绑架', '虐待', '酷刑'],
    slurs: ['支那', '黑鬼', '小日本', '鬼子', '棒子', '阿三', '蛮夷', '地域黑', '乡巴佬'],
    ads: ['代购', '刷单', '兼职', '贷款', '加盟', '私聊', '扫码', '二维码', '赚钱', '免费领'],
  },
};
