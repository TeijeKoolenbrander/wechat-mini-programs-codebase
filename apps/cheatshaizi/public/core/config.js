/**
 * Every tunable number lives here. Nothing in core/ or js/ hardcodes a
 * probability, a threshold, or a timing.
 */

module.exports = {
  // --- Dice --------------------------------------------------------------
  DICE_COUNT: 5,
  FACES: [1, 2, 3, 4, 5, 6],
  WILD: 1, // 1s are wild under 飞

  // --- Lucky mode -------------------------------------------------------
  /** Probability of forcing a hand that satisfies isGoodHand(). */
  LUCKY_GOOD_CHANCE: 0.85,
  /** Rejection-sampling cap before falling back to direct construction. */
  MAX_REJECTION_TRIES: 300,

  /** G1: three or more dice share the same face. */
  GOOD_RULE_G1_ENABLED: true,
  /** G2: for some face X != 1, count(X) + count(1) >= 4. */
  GOOD_RULE_G2_ENABLED: true,
  /** G3: no 1s at all, and at most 3 distinct faces. */
  GOOD_RULE_G3_ENABLED: true,

  // --- Crazy mode -------------------------------------------------------
  /** Chance of a five-effective hand; otherwise four-effective. */
  CRAZY_FIVE_CHANCE: 0.8,
  /**
   * Each counted die is a wild with this probability, so the number of 1s is
   * Binomial(target, p). At 0.5 a five-effective hand has 2 or 3 ones most of
   * the time, 1 or 4 sometimes, 0 or 5 rarely (~3% each). Five wilds is the
   * all-wilds hand. A four-effective hand resamples above 3 wilds, so the odd
   * die can never overshoot.
   */
  CRAZY_WILD_P: 0.5,

  // --- Controlled mode --------------------------------------------------
  /** 'binomial' | 'weighted' | 'oneWild' | 'uniform' | 'random'. */
  CONTROLLED_SPLIT: 'binomial',
  /**
   * 'binomial' only: each chosen die is a wild with this probability, so the
   * number of 1s is Binomial(qty, p) — centred on qty/2, rarely all or none.
   */
  CONTROLLED_WILD_P: 0.5,
  /**
   * 'weighted' only: how often the chosen dice are all the chosen face with
   * no wilds at all. The rest of the time the hand includes at least one 1,
   * which reads the same but leaves you a wild for every other face.
   */
  CONTROLLED_ALL_FACE_CHANCE: 0.1,

  // --- UI timings (consumed by js/, not by core/) -------------------------
  CONTROLLED_LONGPRESS_MS: 600,
  /**
   * Haptics. Turning on the grid fires a double tick, two `wx.vibrateShort`
   * ticks this far apart, so it feels different from the single tick of a
   * grid tap.
   */
  DOUBLE_TICK_GAP_MS: 120,
  SWIPE_THRESHOLD_PX: 40,
  SHAKE_DURATION_MS: 1200,
};
