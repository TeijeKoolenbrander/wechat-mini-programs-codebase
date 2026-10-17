'use strict';
/**
 * Word lists of the typed-clue rules (spec 6.12). A .js module on purpose: WeChat cannot require .json and the lists
 * must never be fetched remotely. Matching is a substring match on the NFKC-folded clue (core/clue.js).
 *
 *   position  ruler and position words (rule 3, reason `position`): a clue must not say where the needle is.
 *             Deliberately blunt: 价格, 性格, 靠谱 are lost too (the spec accepts that; the preset tab is the fallback).
 *   contact   contact words (rule 6, reason `blocked`): the spec list, plus homophones and "me" forms copied from 传画接龙
 *             (CJK only: Latin spellings cannot reach this rule, rule 5 rejects Latin first).
 *
 * The profanity/politics/etc. blocklist is content/blocklist.v1.js (copied from 传画接龙 TD-91 with its exceptions).
 * OWNER: the content owner reviews these lists before submission (Handoff H13, H15).
 */

const CLUE_WORDS_VERSION = 1;

const position = [
  '左', '右', '中间', '中央', '正中', '居中', '当中', '中等', '中不溜', '一半', '偏', '靠', '格', '刻度', '指针', '位置',
  '两头', '两端', '尽头', '满分', '零分', '及格', '打分', '分数', '百分', '十分', '%', '％', '‰',
];

const contact = [
  // the spec list (6.12 rule 6)
  '微信', '威信', '薇信', '加我', '加群', '群号', '电话', '手机号', '扣扣', '企鹅号', '私聊', '私信', '公众号', '网址', '链接',
  // 传画接龙 CJK-only extras
  '微芯', '薇芯', '威芯', '加微', '加薇', '加威', '联系我', '联系方式', '抖音号', '薇我', '威我', '滴滴我', '私我', '戳我', '扣我',
];

module.exports = { CLUE_WORDS_VERSION, position, contact };
