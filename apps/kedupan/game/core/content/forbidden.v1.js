'use strict';
/**
 * 群友刻度盘 forbidden terms, v1. CommonJS (mini games can only `require` .js).
 *
 * Spec: docs/kedupan/spec.md section 4.5 rule 11 and section 17 AC 8.
 * Any user-visible string (spectrum left/right, item text, category labels,
 * share titles, store copy) that contains one of these terms is rejected by CI.
 *
 * Matching is a plain, case-insensitive substring test. Because of that, a term
 * must not be a common substring of innocent words used in the library
 * (for example the bare character "国" would hit "国画"). Where a bare
 * character is listed on purpose (酒, 烟, 赌, 胖, 丑, 毒, 病, 药, 死, 杀, 血, 枪,
 * 佛, 寺, 庙, 鬼) the library avoids every word that contains it.
 *
 * The content owner maintains this list; add terms freely, remove none without
 * a review note in docs/kedupan/content-review.md.
 *
 * API:
 *   groups   : { groupName: string[] }  terms by reason, for reviewers
 *   terms    : string[]                 flat, de-duplicated list
 *   find(s)  : string[]                 terms found in string s ([] when clean)
 *   isClean(s): boolean
 */

const groups = {
  // The source game and our own working titles' translations (PD-23).
  sourceGame: ['波长', '心灵波长', 'wavelength'],

  // Rule 1: people, roles, looks, ages.
  people: [
    '群友', '男生', '女生', '男人', '女人', '男孩', '女孩', '老人', '老头', '老太',
    '大妈', '大叔', '大爷', '阿姨', '叔叔', '孩子', '小孩', '小朋友', '宝宝', '婴儿',
    '学生', '老师', '同学', '同事', '朋友', '家人', '亲人', '父母', '爸爸', '妈妈',
    '爷爷', '奶奶', '外公', '外婆', '哥哥', '姐姐', '弟弟', '妹妹', '老公', '老婆',
    '情侣', '对象', '前任', '邻居', '室友', '客人', '老板', '领导', '医生', '护士',
    '警察', '士兵', '军人', '司机', '明星', '网红', '主播', '歌手', '演员', '帅哥',
    '美女', '富豪', '老头乐',
    '胖', '瘦子', '丑', '颜值', '身材', '长相', '减肥', '肥胖', '年龄', '年轻人', '老年',
  ],

  // Rule 2: politics, history of political events, military, law enforcement, symbols.
  politics: [
    '政治', '政府', '政策', '政党', '党员', '主席', '总统', '选举', '国家领导',
    '国旗', '国歌', '国徽', '国庆', '领土', '主权', '地图', '游行', '示威', '抗议',
    '阅兵', '军队', '部队', '战争', '武器', '文革', '历史事件',
  ],

  // Rule 3: regions, provinces, cities, countries, regional comparison.
  regions: [
    '省份', '地域', '南方', '北方', '东北', '西北', '西南', '东南', '城市', '乡村', '农村',
    '北京', '上海', '广州', '深圳', '成都', '重庆', '杭州', '西安', '南京', '武汉',
    '天津', '苏州', '长沙', '青岛', '厦门', '哈尔滨', '兰州', '拉萨', '昆明', '郑州',
    '香港', '澳门', '台湾', '新疆', '西藏', '内蒙古',
    '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西',
    '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
    '甘肃', '青海', '宁夏', '广西', '江南', '川菜', '粤菜', '湘菜', '鲁菜', '老北京',
    '中国', '外国', '国外', '海外', '老外', '洋人', '美国', '英国', '法国', '德国',
    '日本', '韩国', '俄罗斯', '印度', '泰国', '欧洲', '亚洲', '非洲',
    '日式', '韩式', '法式', '美式',
  ],

  // Rule 4: ethnicity and religion.
  ethnicReligion: [
    '民族', '少数民族', '汉族', '回族', '藏族', '维吾尔', '满族',
    '宗教', '佛教', '道教', '基督', '天主', '伊斯兰', '穆斯林', '教堂', '清真',
    '佛', '寺', '庙', '鬼', '祈祷', '烧香', '拜佛', '信仰', '神仙', '算命', '占卜',
    '风水', '迷信', '星座', '清明', '中元', '求签', '抽签',
  ],

  // Rule 6: alcohol, tobacco, gambling, drugs, weapons, violence, death, disasters.
  vices: [
    '酒', '喝酒', '啤酒', '白酒', '红酒', '醉酒', '酗酒', '酒精', '酒吧', '威士忌', '洋酒',
    '烟', '香烟', '抽烟', '吸烟', '烟草', '电子烟', '烟瘾',
    '赌', '赌博', '彩票', '博彩', '麻将', '扑克', '骰子', '斗地主', '老虎机',
    '抓娃娃', '夹娃娃', '盲盒',
    '毒', '毒品', '大麻', '吸毒',
    '枪', '炸弹', '爆炸', '杀', '暴力', '打架', '血', '死', '死亡', '尸', '葬', '墓',
    '灾', '地震', '洪水', '火灾', '海啸', '泥石流', '台风', '战',
  ],

  // Rule 6: illness and medical or health claims.
  health: [
    '病', '药', '医院', '症', '癌', '疫', '感冒', '发烧', '疗效', '治疗', '治愈',
    '保健', '养胃', '降压', '口罩', '体检', '体温',
  ],

  // Rule 7: sexual, vulgar, scatological, insulting.
  vulgar: [
    '性爱', '色情', '情色', '裸', '暧昧', '内衣', '内裤',
    '傻', '蠢', '笨蛋', '废物', '滚', '屎', '尿', '屁', '妈的', '他妈', '卧槽', '草泥马',
  ],

  // Rule 8: money flaunting or debt.
  money: [
    '贷款', '欠债', '借钱', '信用卡', '房价', '彩礼', '股票', '基金', '投资', '理财',
    '炒股', '比特币', '奢侈', '名牌', '豪车', '豪宅', '土豪', '暴富', '发财',
  ],

  // Rule 9: sad or negative tone.
  negative: [
    '失恋', '加班', '失眠', '抑郁', '焦虑', '崩溃', '自杀', '绝望', '痛苦', '倒霉',
  ],

  // Rule 5: brands, products lines, companies, apps, games, shows, characters.
  // Maintained by the content owner; generic goods (苹果 the fruit, 电饭煲) stay allowed.
  brands: [
    '微信', '腾讯', '阿里', '淘宝', '天猫', '京东', '抖音', '快手', '支付宝', '美团',
    '饿了么', '拼多多', '小红书', '百度', '知乎', '微博', '哔哩', 'b站', 'bilibili', '豆瓣',
    '网易', '华为', '小米手机', '苹果手机', 'iphone', 'apple', '三星手机', 'oppo', 'vivo',
    '联想电脑', '索尼', '任天堂', 'playstation', '微软', '谷歌', 'google', '亚马逊',
    '特斯拉', '比亚迪', '宝马', '奔驰', '奥迪', '丰田', '本田', '大众汽车',
    '可口可乐', '百事', '雪碧', '芬达', '脉动', '农夫山泉', '康师傅', '娃哈哈', '旺旺',
    '旺仔', '老干妈', '海底捞', '麦当劳', '肯德基', '汉堡王', '必胜客', '星巴克',
    '瑞幸', '喜茶', '奈雪', '蜜雪冰城', '古茗', '茶百道', '霸王茶姬', '蒙牛', '伊利',
    '乐高', '迪士尼', '宜家', '优衣库', '耐克', '阿迪达斯', '李宁', '安踏', '无印良品',
    '海尔', '格力', '美的空调', '戴森', '天猫精灵', '小爱同学',
    '王者荣耀', '和平精英', '原神', '英雄联盟', '我的世界', '俄罗斯方块', '超级玛丽',
    '宝可梦', '皮卡丘', '哆啦a梦', '喜羊羊', '奥特曼', '熊出没', '米老鼠', 'hello kitty',
    '倒数日', '大白兔', '德芙', '费列罗', '奥利奥', '乐事', '好丽友', '拍立得', 'wifi', 'wi-fi',
  ],
};

const seen = new Set();
const terms = [];
Object.keys(groups).forEach((g) => {
  groups[g].forEach((t) => {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      terms.push(k);
    }
  });
});

function find(s) {
  const low = String(s).toLowerCase();
  const out = [];
  for (let i = 0; i < terms.length; i++) {
    if (low.indexOf(terms[i]) !== -1) out.push(terms[i]);
  }
  return out;
}

function isClean(s) {
  return find(s).length === 0;
}

module.exports = { version: 1, groups, terms, find, isClean };
