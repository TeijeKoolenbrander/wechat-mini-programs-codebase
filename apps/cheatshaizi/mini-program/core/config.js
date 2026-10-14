/**
 * Every tunable number lives here. Nothing in core/ or pages/ hardcodes a
 * probability, a threshold, or a timing. See SPEC.md.
 */

module.exports = {
  // --- Dice --------------------------------------------------------------
  DICE_COUNT: 5,
  FACES: [1, 2, 3, 4, 5, 6],
  WILD: 1, // 1s are wild under 飞

  // --- Lucky mode (SPEC 2.1) ---------------------------------------------
  /** Probability of forcing a hand that satisfies isGoodHand(). */
  LUCKY_GOOD_CHANCE: 0.85,
  /** Rejection-sampling cap before falling back to direct construction. */
  MAX_REJECTION_TRIES: 300,

  /** G1: three or more dice share the same face. */
  GOOD_RULE_G1_ENABLED: true,
  /** G2: for some face X != 1, count(X) + count(1) >= 4. */
  GOOD_RULE_G2_ENABLED: true,
  /** G3: no 1s at all, and at most 3 distinct faces. SPEC 8.1. */
  GOOD_RULE_G3_ENABLED: true,

  // --- Insane mode (SPEC 2.2) --------------------------------------------
  /** Chance of a five-effective hand; otherwise four-effective. */
  INSANE_FIVE_CHANCE: 0.8,
  /**
   * Each counted die is a wild with this probability, so the number of 1s is
   * Binomial(target, p). At 0.5 a five-effective hand has 2 or 3 ones most of
   * the time, 1 or 4 sometimes, 0 or 5 rarely (~3% each). Five wilds is the
   * all-wilds hand. A four-effective hand resamples above 3 wilds, so the odd
   * die can never overshoot.
   */
  INSANE_WILD_P: 0.5,

  // --- Cheat mode (SPEC 2.3) ---------------------------------------------
  /** 'binomial' | 'weighted' | 'oneWild' | 'uniform' | 'random' — see SPEC 8.2. */
  CHEAT_SPLIT: 'binomial',
  /**
   * 'binomial' only: each declared die is a wild with this probability, so the
   * number of 1s is Binomial(qty, p) — centred on qty/2, rarely all or none.
   */
  CHEAT_WILD_P: 0.5,
  /**
   * 'weighted' only: how often the declared dice are all the chosen face with
   * no wilds at all. The rest of the time the hand includes at least one 1,
   * which reads the same but leaves you a wild for every other face.
   */
  CHEAT_ALL_FACE_CHANCE: 0.1,

  // --- UI timings (consumed by pages/, not by core/) ----------------------
  CHEAT_LONGPRESS_MS: 600,
  /**
   * Haptics. Arming fires a double tick — two heavy `wx.vibrateShort` ticks
   * this far apart. Much quieter than `wx.vibrateLong` (400ms, audible on a
   * table), yet still distinct from the single tick of a zone tap.
   */
  DOUBLE_TICK_GAP_MS: 120,
  SWIPE_THRESHOLD_PX: 40,
  SHAKE_DURATION_MS: 1200,
};
