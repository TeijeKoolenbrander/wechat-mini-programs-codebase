"""Step 7: bot difficulty simulation and gate (spec 3.6) over the candidate answers.

Two bots per candidate, 200 runs each, with the real hint ladder (4.4) and the real 联想词 rule (4.2):
  chip-walker: starts from one of 6 random warm-ups, then guesses uniformly one of the 5 联想词 of its current best word.
  typist:      guesses frequency-weighted random words from the top 5,000; after hint 4 it chip-walks.
Both take each hint as soon as it unlocks. Every guess and every used hint is one step.

usage: python bot_gate.py [--runs 200] [--workers N]
Reads out/private/candidates.json, writes out/private/gate.json (answers! private).
"""
import argparse
import bisect
import json
import math
import multiprocessing as mp
import os
import random

import numpy as np

import pcommon as P

HINT_AT = [10, 20, 30, 40]
HINT_CAP = [300, 50, None, 10]  # hint 3 (index 2) is the first character: no word
SIM_CAP = 200                   # unsolved runs are scored as SIM_CAP + 1000
NEAR = None
EMB = None
VOCAB_N = 0
STARTERS = []
TOP5000_CUM = []
STATE = {}


def init_worker():
    global NEAR, EMB, VOCAB_N, STARTERS, TOP5000_CUM
    EMB = np.load(P.EMB_FILE, mmap_mode="r")
    VOCAB_N = EMB.shape[0]
    NEAR = np.fromfile(P.NEAR_FILE, dtype="<u2").reshape(VOCAB_N, P.NEAR_K).tolist()
    words = P.load_vocab()
    idx = {w: i for i, w in enumerate(words)}
    STARTERS = [idx[w] for w in P.read_list(os.path.join(P.BLOCK, "starters.txt")) if w in idx]
    freq = json.load(open(P.FREQ_FILE, encoding="utf-8"))
    acc = 0
    cum = []
    for i in range(5000):
        acc += max(freq[i][1], 1)
        cum.append(acc)
    TOP5000_CUM = cum


def ranks_for(ans):
    sims = np.asarray(EMB @ np.asarray(EMB[ans]))
    sims[ans] = 2.0  # answer = rank 1
    order = np.lexsort((np.arange(len(sims)), -sims))  # sim desc, lower idx first
    ranks = np.empty(len(sims), dtype=np.int64)
    ranks[order] = np.arange(1, len(sims) + 1)
    return ranks, order


def simulate(ans, kind, rng, ranks, inv):
    """Return steps to solve (or SIM_CAP + 1000 when unsolved within SIM_CAP)."""
    v = VOCAB_N
    ladder = {}
    best_rank, best_idx = v, None
    steps = 0
    next_hint = 0
    typist_phase = kind == "typist"

    def add(w):
        nonlocal best_rank, best_idx
        r = ranks[w]
        ladder[w] = r
        if r < best_rank:
            best_rank, best_idx = r, w
        return r

    # first move: a warm-up chip (chip-walker) or a random typed word (typist)
    first = rng.choice(rng.sample(STARTERS, 6)) if kind == "chip" else None
    if first is not None:
        steps += 1
        if add(first) == 1:
            return steps
    while steps < SIM_CAP:
        if next_hint < 4 and steps >= HINT_AT[next_hint]:
            k = next_hint
            if k == 3:
                typist_phase = False  # after hint 4 the typist chip-walks
            if HINT_CAP[k] is None:  # first-character hint: costs a step, no word
                next_hint += 1
                steps += 1
                continue
            if best_rank == 2:       # "已经只差一步了": not consumed
                next_hint += 1
                continue
            t = min(HINT_CAP[k], max(2, best_rank // 2))
            cand = None
            for rr in range(t, 1, -1):
                if inv[rr - 1] not in ladder:
                    cand = inv[rr - 1]
                    break
            if cand is None:
                for rr in range(t + 1, v + 1):
                    if inv[rr - 1] not in ladder:
                        cand = inv[rr - 1]
                        break
            next_hint += 1
            steps += 1
            if add(cand) == 1:
                return steps
            continue
        if typist_phase:
            w = bisect.bisect_left(TOP5000_CUM, rng.random() * TOP5000_CUM[-1])
            if w in ladder:
                continue  # duplicates do not cost a step
        else:
            w = None
            order = [best_idx] if best_idx is not None else []
            if best_idx is not None:
                order += [x for x, _ in sorted(ladder.items(), key=lambda kv: kv[1]) if x != best_idx]
            for src in order:
                chips = [x for x in NEAR[src] if x not in ladder][:5]
                if chips:
                    w = rng.choice(chips)
                    break
            if w is None:
                w = rng.randrange(v)
                if w in ladder:
                    continue
        steps += 1
        if add(w) == 1:
            return steps
    return SIM_CAP + 1000


def pct(vals, q):
    s = sorted(vals)
    return s[max(0, math.ceil(q * len(s)) - 1)]


def gate_one(job):
    ans, runs = job
    ranks_arr, order = ranks_for(ans)
    ranks = ranks_arr.tolist()
    inv = order.tolist()
    res = {}
    for kind in ("chip", "typist"):
        rng = random.Random(P.SEED * 1000003 + ans * 7 + (1 if kind == "typist" else 0))
        steps = [simulate(ans, kind, rng, ranks, inv) for _ in range(runs)]
        res[kind] = {
            "median": float(np.median(steps)),
            "p90": float(pct(steps, 0.9)),
            "solve80": sum(1 for s in steps if s <= 80) / runs,
        }
    return ans, res


def passes(g):
    c, t = g["chip"], g["typist"]
    return (10 <= c["median"] <= 30 and c["p90"] <= 45 and t["median"] <= 60
            and c["solve80"] >= 0.95 and t["solve80"] >= 0.95)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=200)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default=os.path.join(P.PRIVATE, "gate.json"))
    a = ap.parse_args()
    cands = json.load(open(os.path.join(P.PRIVATE, "candidates.json"), encoding="utf-8"))
    ids = [c["idx"] for c in cands]
    if a.limit:
        ids = ids[: a.limit]
    out = {}
    with mp.Pool(a.workers, initializer=init_worker) as pool:
        for n, (ans, res) in enumerate(pool.imap_unordered(gate_one, [(i, a.runs) for i in ids], chunksize=4)):
            res["pass"] = passes(res)
            out[str(ans)] = res
            if n % 200 == 0:
                print("gate", n, "/", len(ids), flush=True)
    P.write_json(a.out, out)
    ok = sum(1 for r in out.values() if r["pass"])
    print("gate pass", ok, "/", len(out))


if __name__ == "__main__":
    main()
