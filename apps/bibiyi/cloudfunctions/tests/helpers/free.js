'use strict';
// Builds valid (or deliberately broken) free-run submissions from the staged core's own deck builder.

/**
 * @param right number of correct answers before the first miss (or the whole deck if >= 60)
 * @param life  true: forgive the first miss (lifeAtK) and play `afterLife` more correct answers, then miss again
 */
function makeRun(h, { seed, group = 'all', right = 5, life = false, afterLife = 0, contentVersion = 1, configVersion = 1 }) {
  const core = h.core('deck');
  const deck = core.buildFreeDeck(seed, contentVersion, configVersion, group);
  const correct = (k) => (deck[k - 1].b.value > deck[k - 1].a.value ? 'hi' : 'lo');
  const wrong = (k) => (correct(k) === 'hi' ? 'lo' : 'hi');
  const answers = [];
  let streak = 0;
  let lifeAtK = null;
  let k = 1;
  for (; k <= Math.min(right, deck.length); k++) { answers.push({ k, c: correct(k), ms: 2000 }); streak++; }
  if (k <= deck.length) {
    answers.push({ k, c: wrong(k), ms: 2000 });
    if (life) {
      lifeAtK = k;
      k++;
      for (let i = 0; i < afterLife && k <= deck.length; i++, k++) { answers.push({ k, c: correct(k), ms: 2000 }); streak++; }
      if (k <= deck.length) answers.push({ k, c: wrong(k), ms: 2000 });
    }
  }
  return {
    deck, streak, correct, wrong,
    event: { seed, group, contentVersion, configVersion, answers, lifeAtK, clientStreak: streak },
  };
}

module.exports = { makeRun };
