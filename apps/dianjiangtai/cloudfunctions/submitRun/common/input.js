'use strict';
// Input validation. Everything the client sends is untrusted.
const { fail, isInt, isPlainObject, isDateKey, SLOTS } = require('./util');

const MODES = ['daily', 'free', 'challenge'];
const ACTION_TYPES = ['flip', 'respinFaction', 'respinEra', 'pick', 'undo'];
const MAX_ACTIONS = 100;
const RUN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CHALLENGE_ID_RE = /^[A-Z2-7]{8}$/;
const GENERAL_ID_RE = /^g_[a-z0-9_]{1,40}$/;
const GROUP_REF_RE = /^[0-9a-f]{16}$/;
const CLOUD_ID_RE = /^[A-Za-z0-9_-]{8,512}$/;

function clientRunId(v) {
  if (typeof v !== 'string' || !RUN_ID_RE.test(v)) fail('INVALID_ACTIONS', 'bad clientRunId');
  return v;
}
function mode(v) {
  if (!MODES.includes(v)) fail('INVALID_ACTIONS', 'bad mode');
  return v;
}
function optDateKey(v) {
  if (v === undefined || v === null) return null;
  if (!isDateKey(v)) fail('INVALID_ACTIONS', 'bad dateKey');
  return v;
}
function challengeId(v) {
  if (typeof v !== 'string' || !CHALLENGE_ID_RE.test(v)) fail('INVALID_ACTIONS', 'bad challengeId');
  return v;
}
function groupRef(v) {
  if (typeof v !== 'string' || !GROUP_REF_RE.test(v)) fail('INVALID_ACTIONS', 'bad groupRef');
  return v;
}
/** the RAW cloudID string of wx.getGroupEnterInfo (M1): a string of 8-512 url-safe characters, nothing else */
function cloudID(v) {
  if (typeof v !== 'string' || !CLOUD_ID_RE.test(v)) fail('BAD_CLOUDID', 'cloudID missing or malformed');
  return v;
}
function optRecord(v) {
  if (v === undefined || v === null) return null;
  if (!isPlainObject(v) || !isInt(v.w, 0, 12) || !isInt(v.l, 0, 12) || v.w + v.l !== 12) fail('INVALID_ACTIONS', 'bad clientRecord');
  return { w: v.w, l: v.l };
}

/** Whitelist-copy each action; reject anything malformed. */
function actions(v) {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_ACTIONS) fail('INVALID_ACTIONS', 'bad actions length');
  return v.map((a) => {
    if (!isPlainObject(a) || !ACTION_TYPES.includes(a.type) || !isInt(a.round, 1, 5)) fail('INVALID_ACTIONS', 'bad action');
    const out = { round: a.round, type: a.type };
    if (a.type === 'pick') {
      if (typeof a.generalId !== 'string' || !GENERAL_ID_RE.test(a.generalId)) fail('INVALID_ACTIONS', 'bad generalId');
      if (!SLOTS.includes(a.slot)) fail('INVALID_ACTIONS', 'bad slot');
      out.generalId = a.generalId;
      out.slot = a.slot;
    }
    if (a.source !== undefined) {
      if (a.source !== 'free' && a.source !== 'ad') fail('INVALID_ACTIONS', 'bad source');
      out.source = a.source;
    }
    return out;
  });
}

function optContentVersion(v) {
  if (v === undefined || v === null) return null;
  if (!isInt(v, 1, 100000)) fail('INVALID_ACTIONS', 'bad contentVersion');
  return v;
}
function seedU32(v) {
  if (!isInt(v, 0, 4294967295)) fail('INVALID_ACTIONS', 'bad seed');
  return v;
}

module.exports = {
  MODES, ACTION_TYPES, MAX_ACTIONS, clientRunId, mode, optDateKey, challengeId, groupRef, cloudID, CLOUD_ID_RE,
  optRecord, actions, optContentVersion, seedU32, CHALLENGE_ID_RE,
};
