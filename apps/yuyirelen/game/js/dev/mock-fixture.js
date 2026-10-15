/**
 * FIXTURE (clearly fake, dev only). A tiny hand-made word map the mock server uses to
 * stand in for the real rank lists, so the game runs offline without real data.
 *
 *  - The real answers, rank lists and the real near table live ONLY on the server
 *    (spec 3.8, AC 17). This folder (js/dev) must be excluded from release packages.
 *  - Similarity here is made up: words in the same group are close, "related" groups are
 *    medium, everything else is far, with deterministic noise. It is NOT semantic quality.
 */

const GROUPS = {
  food: ['番茄', '西红柿', '土豆', '黄瓜', '白菜', '萝卜', '青菜', '蔬菜', '水果', '苹果', '香蕉', '橙子', '西瓜', '葡萄', '米饭', '面条', '饺子', '包子', '火锅', '烧烤', '麻辣', '豆腐', '鸡蛋', '牛肉', '猪肉', '面包', '蛋糕', '零食', '美食', '茶', '咖啡', '牛奶', '糖', '盐', '水', '汤', '餐厅', '厨房', '酸甜', '辣椒'],
  animal: ['动物', '鸟', '鱼', '猫', '狗', '马', '牛', '羊', '虫', '老虎', '狮子', '大象', '熊猫', '兔子', '猴子', '老鼠', '蛇', '青蛙', '蝴蝶', '蜜蜂', '鸡', '鸭子', '老鹰', '海豚', '森林', '动物园', '宠物', '尾巴', '翅膀', '牙齿'],
  sky: ['天气', '月亮', '太阳', '星星', '云', '风', '雨', '雪', '光', '地球', '夜晚', '天空', '白天', '黑夜', '月光', '宇宙', '太空', '彩虹', '雷电', '阳光', '早上', '晚上', '温度', '春天', '夏天', '秋天', '冬天', '季节', '月球', '圆形'],
  place: ['旅行', '山', '海', '河', '城市', '乡村', '岛', '沙漠', '公园', '地图', '风景', '海滩', '湖泊', '草原', '飞机', '火车', '汽车', '旅馆', '车站', '机场', '道路', '桥', '商店', '地铁', '自行车', '船', '行李', '假期', '森林', '花', '树'],
  home: ['家', '房子', '桌子', '椅子', '床', '灯', '门', '窗户', '沙发', '电视', '冰箱', '衣服', '鞋子', '帽子', '被子', '镜子', '杯子', '盘子', '雨伞', '钥匙', '扫帚', '地板', '墙壁', '花瓶', '玩具', '礼物', '家人', '父母', '孩子', '干净'],
  work: ['工作', '公司', '老板', '同事', '会议', '电脑', '手机', '电话', '办公室', '工资', '工具', '机器', '工厂', '商人', '生意', '合同', '经理', '加班', '钱', '时间', '信', '纸', '笔', '文件', '速度', '计划', '金属', '木头', '石头', '武器'],
  school: ['学校', '学生', '老师', '书', '课本', '作业', '考试', '教室', '黑板', '同学', '知识', '数学', '语文', '科学', '历史', '地理', '图书馆', '校园', '毕业', '成绩', '聪明', '梦想', '故事', '艺术', '颜色', '声音'],
  sport: ['运动', '篮球', '足球', '排球', '乒乓球', '游泳', '跑步', '比赛', '冠军', '裁判', '球场', '教练', '运动员', '健身', '力量', '体育', '网球', '羽毛球', '滑冰', '爬山', '游戏', '快乐', '热闹', '朋友'],
  music: ['音乐', '钢琴', '吉他', '小提琴', '鼓', '歌曲', '歌手', '乐队', '旋律', '琴键', '演奏', '舞蹈', '舞台', '电影', '演员', '画', '艺术家', '节日', '生日', '安静', '美丽', '味道', '梦', '爱情'],
  body: ['医院', '医生', '护士', '健康', '药', '病人', '手术', '身体', '头', '眼睛', '耳朵', '心脏', '血', '感冒', '发烧', '疼', '病房', '急诊', '针', '体温'],
};

/** Group affinity (symmetric) for words in different groups. */
const RELATED = [
  ['food', 'home'], ['food', 'animal'], ['sky', 'place'], ['place', 'animal'], ['home', 'work'],
  ['work', 'school'], ['school', 'music'], ['sport', 'music'], ['body', 'sport'], ['body', 'food'], ['sky', 'animal'],
];

/** Hand-picked closest words per answer (best first), so the top of the list feels right. */
const CLOSE = {
  番茄: ['西红柿', '蔬菜', '土豆', '黄瓜', '酸甜', '水果', '白菜', '萝卜', '辣椒', '青菜'],
  月亮: ['月球', '月光', '星星', '夜晚', '太阳', '天空', '圆形', '黑夜', '宇宙', '太空'],
  钢琴: ['琴键', '吉他', '小提琴', '演奏', '旋律', '音乐', '歌曲', '乐队', '舞台', '歌手'],
  老虎: ['狮子', '熊猫', '动物', '大象', '猫', '森林', '动物园', '尾巴', '牙齿', '猴子'],
  医院: ['医生', '护士', '病人', '病房', '手术', '急诊', '药', '健康', '针', '体温'],
  篮球: ['球场', '足球', '排球', '比赛', '运动员', '运动', '教练', '冠军', '裁判', '体育'],
};

/** Exact synonyms (spec 3.5): guessing one solves the puzzle. */
const SYNONYMS = { 番茄: ['西红柿'], 月亮: ['月球'] };

/** The tiny banks: 3 daily answers (cycled by issue number) and 3 practice answers. */
const DAILY_BANK = ['番茄', '月亮', '钢琴'];
const PRACTICE_BANK = ['老虎', '医院', '篮球'];

module.exports = { GROUPS, RELATED, CLOSE, SYNONYMS, DAILY_BANK, PRACTICE_BANK };
