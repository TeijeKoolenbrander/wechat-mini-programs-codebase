/**
 * Card entry routing and share content (spec 7, 7.5, AC 50-54). Pure JS.
 * Every share is started by a user tap or the capsule menu; this module only builds the content. Sharing never grants anything.
 */

const ROUND_ID = /^[A-Z2-7]{8}$/;
const DATE_KEY = /^\d{8}$/;

/**
 * Route a launch/onShow `query` object (wx.getEnterOptionsSync().query) per spec 7.5.
 * @returns {{kind:'none'|'daily'|'group'|'round'|'fallback'|'malformed', dateKey?:string, roundId?:string}}
 */
function parseEntryQuery(query) {
  const q = query && typeof query === 'object' ? query : {};
  const keys = Object.keys(q);
  if (keys.length === 0) return { kind: 'none' };
  if (String(q.wxad_fallback_share) === '1') return { kind: 'fallback' };
  if (q.r !== undefined) return ROUND_ID.test(String(q.r)) ? { kind: 'round', roundId: String(q.r) } : { kind: 'malformed' };
  if (q.s !== undefined) {
    if (q.s === 'd') return DATE_KEY.test(String(q.d || '')) ? { kind: 'daily', dateKey: String(q.d) } : { kind: 'daily' };
    if (q.s === 'g') return { kind: 'group' };
    return { kind: 'malformed' };
  }
  return { kind: 'malformed' };
}

// ---- share content -------------------------------------------------------------------------------------------

const BANNED_TITLE = [/@所有人/, /不转/, /转发.*(红包|福利|奖励)/, /系统(提示|通知)/, /紧急/, /必看/, /震惊/];

/** True when a share title passes the 诱导分享 / exaggeration screen (spec 7). */
function titleOk(title) {
  return typeof title === 'string' && title.length > 0 && title.length <= 40 && !BANNED_TITLE.some((re) => re.test(title));
}

/** Daily result card (PD-11): title + query. Positions, medians and group numbers are never inputs. */
function dailyShare(o) {
  return {
    title: o.card1.prompt + '是' + o.card1.left + '还是' + o.card1.right + '？我今天和全国的默契分 ' + o.total + '，你呢',
    query: 's=d&d=' + o.dateKey,
  };
}
/**
 * The only data the daily share image may draw (AC 52): per card prompt, ends and the label, plus the total and band.
 * @param {{issueNo:number, cards:Array<{prompt,left,right}>, labels:string[], total:number, band:string}} o
 */
function dailyShareImageModel(o) {
  return {
    issueNo: o.issueNo,
    rows: o.cards.map((c, i) => ({ prompt: c.prompt, left: c.left, right: c.right, label: o.labels[i] })),
    totalText: String(o.total),
    band: o.band,
    tagline: '你会把指针放在哪？',
  };
}
function roundShare(o) {
  return { title: '我出了一道刻度题：' + o.left + '↔' + o.right + '，猜猜我心里的位置', query: 'r=' + o.roundId };
}
function roundImageModel(o) {
  return { left: o.left, right: o.right, clueLine: o.clueText ? o.clueText : '提示在群聊里', tagline: '群友出了一道刻度题' };
}
function revealShare(o) {
  return { title: '刻度题揭晓：本题默契值 ' + o.mq, query: 'r=' + o.roundId };
}
function revealImageModel(o) {
  return { left: o.left, right: o.right, target: o.target, guesses: o.guesses.slice(), mqText: '本题默契值 ' + o.mq + ' · ' + o.guessCount + ' 人作答' };
}
function groupShare(o) {
  return { title: o.mq === null || o.mq === undefined ? '群友刻度盘：本群今日刻度' : '群友刻度盘：本群今日默契度 ' + o.mq, query: 's=g' };
}
function menuShare() {
  return { title: '群友刻度盘：把指针放在你觉得对的位置', query: 's=d' };
}

module.exports = { parseEntryQuery, titleOk, dailyShare, dailyShareImageModel, roundShare, roundImageModel, revealShare, revealImageModel, groupShare, menuShare };
