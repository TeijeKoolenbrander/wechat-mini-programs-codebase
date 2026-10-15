/**
 * Host flow, create a round (spec 2.2, 6.5): three spectra (one free 换一组, then rewarded 换一批 <= 3), the server
 * draws the hidden target (createRound), the clue (6 preset items with one free swap, or 群里说), setClue, share.
 * No ad appears anywhere in this flow except the rewarded 换一批 (PD-28). No text is ever typed (PD-7).
 */

const { pickSpectra, clueOptions } = require('../../core/content');
const { randomSeed } = require('../../core/rng');
const V = require('../vm');
const Sh = require('../share');

module.exports = function createHost(c) {
  const { S, api, ads, content, track } = c;
  const cfg = c.config.rounds;
  const f = {};
  let h = null;

  function fresh() {
    return {
      step: 'pickSpectrum',
      seed: String(randomSeed()),
      batch: 0,
      shown: [],
      spectra: [],
      freeSwapLeft: 1,
      adSwapLeft: cfg.adSwapsPerRound,
      spectrum: null,
      roundId: null,
      target: null,
      clueMode: 'preset',
      clueBatch: 0,
      clueOptions: [],
      clueItemId: null,
      clueSwapLeft: 1,
      presetSwaps: 0,
      adState: 'idle',
      errorText: null,
      freeUsed: 0,
    };
  }

  function deal() {
    const sp = pickSpectra(content, h.seed + ':' + h.batch, cfg.spectraOffered, h.shown);
    h.spectra = sp.map((s) => ({ id: s.id, left: s.left, right: s.right }));
    sp.forEach((s) => h.shown.push(s.id));
  }

  f.open = function () {
    h = fresh();
    deal();
    c.go('create', { replace: c.screen === 'create' });
  };

  async function pick(spectrumId) {
    if (h.step !== 'pickSpectrum' && h.step !== 'error') return;
    const sp = content.spectrumById[spectrumId];
    if (!sp) return;
    h.spectrum = { id: sp.id, left: sp.left, right: sp.right };
    h.step = 'creating';
    h.errorText = null;
    c.invalidate();
    const r = await api.createRound({ spectrumId });
    if (!h || h.spectrum.id !== spectrumId) return;
    if (r && r.ok) {
      h.roundId = r.roundId;
      h.target = r.target;
      h.step = 'pickClue';
      h.clueBatch = 0;
      h.clueOptions = clueOptions(content, spectrumId, h.seed + ':' + r.roundId, 0, cfg.clueOptions);
      track('round_create', { roundId: r.roundId, spectrumId, swapsFree: 1 - h.freeSwapLeft, swapsAd: cfg.adSwapsPerRound - h.adSwapLeft });
    } else if (r && r.code === 'RATE_LIMITED') {
      h.step = 'rateLimited';
    } else {
      h.step = 'error';
      h.errorText = '出题需联网';
      track('error', { where: 'createRound', code: (r && r.code) || 'none' });
    }
    c.invalidate();
  }

  function swapFree() {
    if (h.step !== 'pickSpectrum' || h.freeSwapLeft <= 0) return;
    h.freeSwapLeft = 0;
    h.batch++;
    deal();
  }

  async function swapAd() {
    if (h.step !== 'pickSpectrum' || h.freeSwapLeft > 0 || h.adSwapLeft <= 0 || h.adState !== 'idle') return;
    h.adState = 'loading';
    c.invalidate();
    const out = await ads.rewarded('swap');
    h.adState = 'idle';
    if (out.toast) c.toast(out.toast);
    if (out.granted && h) {
      h.adSwapLeft--;
      h.batch++;
      deal();
    }
  }

  function clueSwap() {
    if (h.step !== 'pickClue' || h.clueMode !== 'preset' || h.clueSwapLeft <= 0) return;
    h.clueSwapLeft = 0;
    h.clueBatch = 1;
    h.presetSwaps = 1;
    h.clueItemId = null;
    h.clueOptions = clueOptions(content, h.spectrum.id, h.seed + ':' + h.roundId, 1, cfg.clueOptions);
  }

  async function share() {
    const vm = V.createVm(toModel(), c.display(), c.featuresVm());
    if (!vm.canShare) return;
    const hh = h;
    hh.step = 'sharing';
    c.invalidate();
    const r = await api.setClue({ roundId: hh.roundId, clueMode: hh.clueMode, clueItemId: hh.clueMode === 'preset' ? hh.clueItemId : undefined });
    if (!r || !r.ok) {
      hh.step = 'pickClue';
      track('error', { where: 'setClue', code: (r && r.code) || 'none' });
      return c.toast('提示没存上，再点一次');
    }
    track('round_clue', { roundId: hh.roundId, clueMode: hh.clueMode, presetSwaps: hh.presetSwaps });
    const clueText = hh.clueMode === 'preset' ? (hh.clueOptions.find((o) => o.itemId === hh.clueItemId) || {}).text : null;
    await c.share.shareRound({ roundId: hh.roundId, left: hh.spectrum.left, right: hh.spectrum.right, clueText, card: Sh.roundCardVm(hh.spectrum.left, hh.spectrum.right, clueText) });
    await c.flows.round.open(hh.roundId, 'host', false, true);
  }

  f.hit = function (id) {
    if (!h) return undefined;
    if (id === 'back') return c.goHome();
    if (id.indexOf('create:spectrum:') === 0) return pick(id.slice(16));
    switch (id) {
      case 'create:swapFree':
        return swapFree();
      case 'create:swapAd':
        return swapAd();
      case 'create:mode:preset':
      case 'create:mode:chat':
        if (h.step === 'pickClue') h.clueMode = id.slice(12);
        return undefined;
      case 'create:clueSwap':
        return clueSwap();
      case 'create:share':
        return share();
      case 'create:retry':
        if (h.spectrum) return pick(h.spectrum.id);
        return undefined;
    }
    if (id.indexOf('create:clue:') === 0 && h.step === 'pickClue' && h.clueMode === 'preset') h.clueItemId = id.slice(12);
    return undefined;
  };

  function toModel() {
    return {
      step: h.step,
      spectra: h.spectra,
      freeSwapLeft: h.freeSwapLeft,
      adSwapLeft: h.adSwapLeft,
      roundId: h.roundId,
      target: h.target,
      spectrum: h.spectrum,
      clueMode: h.clueMode,
      clueOptions: h.clueOptions,
      clueItemId: h.clueItemId,
      clueSwapLeft: h.clueSwapLeft,
      adState: h.adState,
      errorText: h.errorText,
    };
  }

  f.animating = () => !!h && (h.step === 'creating' || h.step === 'sharing' || h.adState === 'loading');
  f.vm = function () {
    if (!h) h = fresh();
    return V.createVm(toModel(), c.display(), c.featuresVm());
  };
  void S;
  return f;
};
