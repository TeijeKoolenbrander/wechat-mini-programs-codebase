/**
 * 热身词 starters (spec 4.2, PO-22). A fixed list of 120 broad, neutral words. Six are
 * drawn per date with sub(dateKey, "warmups"): identical for everyone and NEVER chosen
 * with knowledge of the answer (no leak). Practice puzzles use sub("p"+n, "warmups").
 *
 * FIXTURE NOTE: this is the reviewed-list shape; the real list is reviewed by product-ux
 * and must be a subset of the vocabulary (a test checks it against core/vocab.js).
 */
const { sub } = require('./rng');

const STARTERS = [
  '天气', '美食', '工作', '动物', '旅行', '家', '学校', '运动', '音乐', '朋友',
  '水果', '蔬菜', '植物', '花', '树', '山', '海', '河', '城市', '乡村',
  '春天', '夏天', '秋天', '冬天', '早上', '晚上', '节日', '生日', '电影', '游戏',
  '书', '电脑', '手机', '汽车', '火车', '飞机', '医院', '商店', '餐厅', '公园',
  '衣服', '鞋子', '帽子', '房子', '厨房', '桌子', '椅子', '床', '灯', '门',
  '窗户', '钱', '时间', '健康', '快乐', '安静', '热闹', '干净', '美丽', '聪明',
  '孩子', '老师', '学生', '医生', '家人', '父母', '爱情', '梦想', '故事', '历史',
  '科学', '艺术', '颜色', '声音', '味道', '温度', '速度', '力量', '光', '风',
  '雨', '雪', '云', '太阳', '月亮', '星星', '地球', '森林', '沙漠', '岛',
  '鸟', '鱼', '猫', '狗', '马', '牛', '羊', '虫', '米饭', '面条',
  '茶', '咖啡', '牛奶', '糖', '盐', '水', '火', '金属', '木头', '石头',
  '工具', '机器', '武器', '玩具', '礼物', '地图', '信', '纸', '笔', '梦',
];

/** The 6 热身词 for a key (a dateKey like "20261120" or "p12"). Pure and deterministic. */
function warmupsFor(key, n) {
  const count = n === undefined ? 6 : n;
  const rng = sub(key, 'warmups');
  const pool = STARTERS.slice();
  const out = [];
  for (let i = 0; i < count && pool.length; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

module.exports = { STARTERS, warmupsFor };
