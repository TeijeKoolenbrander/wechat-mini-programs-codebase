/**
 * Every user-facing sentence beyond a button label, in one place, so the
 * help screen, the Controlled-mode introduction and the launch screen never
 * disagree.
 */

/** The four modes, in the order the mode screen lists them. */
const MODES = [
  { id: 'regular', name: '普通模式', desc: '公平随机，每个点数机会相同' },
  { id: 'lucky', name: '好运模式', desc: '更容易出好牌' },
  { id: 'crazy', name: '豹子模式', desc: '每次都是四个或五个相同' },
  { id: 'controlled', name: '自定义模式', desc: '公平随机，也可以自己设定点数' },
];

const DISCLAIMER = '本游戏仅供娱乐，禁止用于赌博 · 理性饮酒，未成年人禁止饮酒';

const HEALTH_NOTICE = [
  '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。',
  '适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。',
];

/** How Controlled mode works. Shown before it starts, and on the help screen. */
const CONTROLLED_STEPS = [
  '长按「摇」开启自定义，手机会震动两下',
  '整个屏幕分成左右两列、上下三行，共六格',
  '第一次点击：选择数量（每格的「数量」）',
  '第二次点击：选择点数（每格的「点数」）',
  '1 是万能（飞），数量包含 1',
  '设定一次后自动关闭，再次设定需重新长按',
  '开盅后也可以设定',
];

const CONTROLLED_WILDS = [
  '左下角 🍶 亮：设定的数量里会混入 1',
  '左下角 🍶 暗：只出现你选的点数，不混入 1',
];

/** The help screen: a list of sections, each a heading and its lines. */
const HELP = [
  {
    head: '这是什么',
    lines: ['一个虚拟骰盅，和朋友面对面玩吹牛（大话骰）时代替真实的骰盅。叫数和开都在现实中进行。'],
  },
  {
    head: '操作',
    lines: [
      '点「摇」：摇骰子',
      '上滑：开盅看骰子；下滑：盖上',
      '左下角 🔊：开关声音',
      '右下角 ⚙：返回首页',
    ],
  },
  {
    head: '四种模式',
    lines: ['PLAY 会直接进入上次使用的模式。首页点「切换模式」可以更换。'].concat(
      MODES.map((m) => m.name + '：' + m.desc)
    ),
  },
  {
    head: '好运模式',
    lines: ['大约九成的时候会出好牌（三个相同，或算上 1 有四个相同），其余时候是普通的公平随机，所以也会出差牌。'],
  },
  {
    head: '豹子模式',
    lines: ['每次都是五个相同（算上 1），少数时候是四个相同。'],
  },
  { head: '自定义模式', lines: CONTROLLED_STEPS.concat(CONTROLLED_WILDS) },
  { head: '提示', lines: [DISCLAIMER].concat(HEALTH_NOTICE) },
];

module.exports = { MODES, DISCLAIMER, HEALTH_NOTICE, CONTROLLED_STEPS, CONTROLLED_WILDS, HELP };
