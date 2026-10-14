/**
 * Prints what each mode actually produces, so the rigging can be tuned
 * against evidence instead of guesswork. Run with `npm run stats`.
 */

const C = require('../core/config');
const { fairRng } = require('../core/rng');
const { rollFair, isGoodHand, goodRules, bestEffective, countOf } = require('../core/hands');
const { rollLucky } = require('../core/lucky');
const { rollInsane } = require('../core/insane');

const N = 200000;
const rng = fairRng;
const pct = (n) => ((n / N) * 100).toFixed(1).padStart(5) + '%';

function profile(label, roll) {
  const hits = { g1: 0, g2: 0, g3: 0, good: 0 };
  const strength = [0, 0, 0, 0, 0, 0];
  let wildless = 0;

  for (let i = 0; i < N; i++) {
    const hand = roll(rng);
    const r = goodRules(hand);
    if (r.g1) hits.g1++;
    if (r.g2) hits.g2++;
    if (r.g3) hits.g3++;
    if (isGoodHand(hand)) hits.good++;
    strength[bestEffective(hand)]++;
    if (countOf(hand, C.WILD) === 0) wildless++;
  }

  console.log('\n' + label);
  console.log('─'.repeat(52));
  console.log(`  good hand            ${pct(hits.good)}`);
  console.log(`    G1  three of a kind  ${pct(hits.g1)}`);
  console.log(`    G2  four effective   ${pct(hits.g2)}`);
  console.log(`    G3  no 1s, ≤3 faces  ${pct(hits.g3)}`);
  console.log(`  no wilds in hand     ${pct(wildless)}`);
  console.log('  best face reads as:');
  for (let n = 1; n <= 5; n++) {
    const bar = '█'.repeat(Math.round((strength[n] / N) * 40));
    console.log(`    ${n}  ${pct(strength[n])}  ${bar}`);
  }
}

console.log(`\n${N.toLocaleString()} hands per mode`);
console.log(`LUCKY_GOOD_CHANCE=${C.LUCKY_GOOD_CHANCE}  ` +
  `INSANE_FIVE_CHANCE=${C.INSANE_FIVE_CHANCE}  ` +
  `CHEAT_SPLIT=${C.CHEAT_SPLIT}`);

profile('FAIR  (what an honest cup does)', rollFair);
profile('LUCKY (the PLAY button)', rollLucky);
profile('INSANE', rollInsane);

// --- cheat: how the declared dice get composed --------------------------
const { applyCheat } = require('../core/cheat');

console.log('\nCHEAT  wilds used per declared count');
console.log('─'.repeat(52));
console.log(`  split=${C.CHEAT_SPLIT}  wild p=${C.CHEAT_WILD_P}`);
for (let qty = 1; qty <= 5; qty++) {
  const tally = [0, 0, 0, 0, 0, 0];
  const M = 50000;
  for (let i = 0; i < M; i++) {
    tally[countOf(applyCheat(rng, qty, 6), C.WILD)]++;
  }
  const parts = tally
    .map((n, w) => (n ? `${w}×1: ${((n / M) * 100).toFixed(0)}%` : null))
    .filter(Boolean)
    .join('   ');
  console.log(`  ask for ${qty}:  ${parts}`);
}
console.log();
