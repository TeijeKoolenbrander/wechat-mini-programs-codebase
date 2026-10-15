"""Unit tests for the pipeline's business logic (no model needed): python -m unittest test_pipeline -v"""
import random
import unittest

import numpy as np

import bot_gate
import build_bank
import pcommon as P


class RankTests(unittest.TestCase):
    def test_rank_is_permutation_answer_first_ties_by_index(self):
        emb = np.zeros((6, 4), dtype=np.float32)
        emb[0] = [1, 0, 0, 0]
        emb[1] = [0, 1, 0, 0]
        emb[2] = [0, 1, 0, 0]  # tie with 1
        emb[3] = [0.6, 0.8, 0, 0]
        emb[4] = [1, 0, 0, 0]  # same as answer: still rank 2 (answer forced to 1)
        emb[5] = [-1, 0, 0, 0]
        ranks, order = build_bank.rank_list(emb, 0)
        self.assertEqual(sorted(ranks.tolist()), [1, 2, 3, 4, 5, 6])
        self.assertEqual(int(ranks[0]), 1)
        self.assertEqual(int(ranks[4]), 2)
        self.assertLess(ranks[1], ranks[2])  # tie -> lower index wins
        self.assertEqual(int(ranks[5]), 6)
        self.assertEqual(order[0], 0)


class ScheduleTests(unittest.TestCase):
    def test_schedule_rules(self):
        rng = random.Random(1)
        cats = ["a", "b", "c", "d", "e"]
        items = [{"category": rng.choice(cats), "difficulty": rng.choices(["easy", "medium", "hard"], [35, 45, 20])[0]}
                 for _ in range(200)]
        out, rest = build_bank.schedule(items, 100, random.Random(2))
        self.assertEqual(len(out), 100)
        self.assertEqual(len(out) + len(rest), 200)
        for k in range(1, len(out)):
            self.assertNotEqual(out[k]["category"], out[k - 1]["category"])
            self.assertFalse(out[k]["difficulty"] == "hard" and out[k - 1]["difficulty"] == "hard")
        for k in range(len(out)):
            self.assertLessEqual(sum(1 for x in out[k:k + 7] if x["difficulty"] == "hard"), 2)


class BotTests(unittest.TestCase):
    def setUp(self):
        # tiny world: 300 words, answer 0; word w has rank w+1
        v = 300
        bot_gate.VOCAB_N = v
        bot_gate.NEAR = [[(w + 1 + k) % v for k in range(20)] for w in range(v)]
        bot_gate.STARTERS = list(range(250, 300))
        bot_gate.TOP5000_CUM = list(range(1, v + 1))
        self.ranks = [w + 1 for w in range(v)]
        self.inv = list(range(v))

    def test_hint_never_returns_answer_and_run_terminates(self):
        for seed in range(20):
            steps = bot_gate.simulate(0, "chip", random.Random(seed), self.ranks, self.inv)
            self.assertGreaterEqual(steps, 1)
            self.assertLessEqual(steps, bot_gate.SIM_CAP + 1000)

    def test_typist_runs(self):
        steps = bot_gate.simulate(0, "typist", random.Random(3), self.ranks, self.inv)
        self.assertGreaterEqual(steps, 1)

    def test_gate_windows(self):
        ok = {"chip": {"median": 20, "p90": 40, "solve80": 0.97}, "typist": {"median": 50, "p90": 70, "solve80": 0.96}}
        self.assertTrue(bot_gate.passes(ok))
        bad = {"chip": {"median": 31, "p90": 40, "solve80": 0.97}, "typist": ok["typist"]}
        self.assertFalse(bot_gate.passes(bad))
        bad = {"chip": ok["chip"], "typist": {"median": 61, "p90": 90, "solve80": 0.99}}
        self.assertFalse(bot_gate.passes(bad))


class TemperatureTests(unittest.TestCase):
    def test_spec_values(self):
        self.assertEqual(P.temperature(1, 30000), 100)
        self.assertEqual(P.temperature(30000, 30000), 0)
        self.assertEqual(P.temperature(10, 30000), 78)
        self.assertEqual(P.temperature(100, 30000), 55)
        self.assertEqual(P.temperature(1000, 30000), 33)


class BuiltDataTests(unittest.TestCase):
    def test_vocab_and_near_files_consistent(self):
        words = P.load_vocab()
        self.assertEqual(len(words), len(set(words)))
        near = np.fromfile(P.NEAR_FILE, dtype="<u2")
        self.assertEqual(near.size, len(words) * P.NEAR_K)


if __name__ == "__main__":
    unittest.main()
