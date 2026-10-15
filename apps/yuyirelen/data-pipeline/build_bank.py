"""Steps 6, 8, 9, 10: select the answer pool, compute full rank lists, schedule the dailies, write the bank.

Reads out/private/candidates.json + gate.json. Writes
  out/private/bank.import.jsonl, out/private/bank_ranks/<_id>.bin, out/private/review_sheet.txt   (private, spoilers)
  reports/bank_report.json                                                                         (aggregate, no words)
usage: python build_bank.py [--daily 140] [--practice 400]
"""
import argparse
import base64
import collections
import json
import os
import random
import shutil

import numpy as np

import pcommon as P
from bot_gate import ranks_for  # noqa: F401  (same rank definition as the gate)

PER_CAT_DIFF = {"easy": 0.35, "medium": 0.45, "hard": 0.20}


def difficulty(chip_median):
    if chip_median <= 17:
        return "easy"
    if chip_median <= 24:
        return "medium"
    return "hard"


def rank_list(emb, ans):
    """ranks[i] = rank of word i for answer `ans` (1 = answer), ties by lower vocab index."""
    sims = emb @ emb[ans]
    sims[ans] = 2.0
    order = np.lexsort((np.arange(len(sims)), -sims))
    ranks = np.empty(len(sims), dtype=np.uint16)
    ranks[order] = np.arange(1, len(sims) + 1, dtype=np.uint16)
    return ranks, order


def schedule(items, n, rng):
    """Pick and order n items: no two hard adjacent, <= 2 hard per 7 days, no category repeat on consecutive days."""
    remaining = list(items)
    rng.shuffle(remaining)
    out = []
    while len(out) < n:
        prev = out[-1] if out else None
        recent_hard = sum(1 for x in out[-6:] if x["difficulty"] == "hard")
        pick = None
        for it in remaining:
            if prev and it["category"] == prev["category"]:
                continue
            if it["difficulty"] == "hard" and ((prev and prev["difficulty"] == "hard") or recent_hard >= 2):
                continue
            pick = it
            break
        if pick is None:
            raise RuntimeError("cannot satisfy schedule rules")
        remaining.remove(pick)
        out.append(pick)
    return out, remaining


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--daily", type=int, default=140)
    ap.add_argument("--practice", type=int, default=400)
    a = ap.parse_args()
    total = a.daily + a.practice
    words = P.load_vocab()
    v = len(words)
    emb = np.load(P.EMB_FILE)
    cands = {c["idx"]: c for c in json.load(open(os.path.join(P.PRIVATE, "candidates.json"), encoding="utf-8"))}
    gate = json.load(open(os.path.join(P.PRIVATE, "gate.json"), encoding="utf-8"))
    own_exact = set(P.read_list(os.path.join(P.BLOCK, "exact.txt")))
    own_sub = P.read_list(os.path.join(P.BLOCK, "substring.txt"))
    rng = random.Random(P.SEED)
    # Heavy-topic words that stay in the vocabulary (illness, money, alcohol, violence tools...) must not appear in an
    # answer's public top-100 list (automatic proxy for the human neighbour review).
    heavy = {w for w in P.read_list(os.path.join(P.BLOCK, "answer_exclude.txt")) if any(ch in w for ch in "病药酒钱血战枪刀烟痛伤贷税险股")}

    passing = []
    rejected_neighbour = 0
    for k, g in gate.items():
        i = int(k)
        if not g["pass"]:
            continue
        ranks, order = rank_list(emb, i)
        top100 = order[:100].tolist()
        bad = [j for j in top100 if words[j] in own_exact or any(s in words[j] for s in own_sub) or words[j] in heavy]
        if bad:
            rejected_neighbour += 1
            continue
        c = dict(cands[i])
        c["gate"] = g
        passing.append(c)
    # Difficulty tags are RELATIVE (rank within the gate-passing set): the spec's absolute windows
    # (easy 10-17 / medium 18-24 / hard 25-30) leave "easy" empty under the spec'd bot, see README.
    ranked = sorted(passing, key=lambda c: (c["gate"]["chip"]["median"], c["gate"]["chip"]["p90"], c["idx"]))
    for k, c in enumerate(ranked):
        f = k / len(ranked)
        c["difficulty"] = "easy" if f < 0.35 else "medium" if f < 0.80 else "hard"
    passing.sort(key=lambda c: c["idx"])
    by_cat = collections.defaultdict(list)
    for c in passing:
        by_cat[c["category"]].append(c)
    cats = sorted(by_cat)
    per_cat = total // len(cats)
    chosen = []
    for cat in cats:
        pool = sorted(by_cat[cat], key=lambda c: (-c["catCos"], c["idx"]))  # most on-topic (concrete) words first
        quota = {d: int(round(per_cat * f)) for d, f in PER_CAT_DIFF.items()}
        cnt = collections.Counter()
        three = nouns = 0
        picked = []
        max_three = int(per_cat * 0.12)
        min_nouns = int(per_cat * 0.74)
        # pass 1 respects difficulty quotas, 3-char cap and keeps nouns >= 74%
        for c in pool:
            if len(picked) >= per_cat:
                break
            if cnt[c["difficulty"]] >= quota[c["difficulty"]]:
                continue
            if len(c["word"]) == 3 and three >= max_three:
                continue
            non_noun_left = per_cat - min_nouns
            if c["pos"] != "n" and (len(picked) - nouns) >= non_noun_left:
                continue
            picked.append(c)
            cnt[c["difficulty"]] += 1
            three += len(c["word"]) == 3
            nouns += c["pos"] == "n"
        # pass 2 fills any shortfall ignoring difficulty quotas
        for c in pool:
            if len(picked) >= per_cat:
                break
            if c in picked:
                continue
            if len(c["word"]) == 3 and three >= max_three:
                continue
            if c["pos"] != "n" and (len(picked) - nouns) >= per_cat - min_nouns:
                continue
            picked.append(c)
            three += len(c["word"]) == 3
            nouns += c["pos"] == "n"
        chosen += picked
    # top up to `total` if rounding left a gap
    leftovers = [c for c in passing if c not in chosen]
    leftovers.sort(key=lambda c: (c["pos"] != "n", len(c["word"]) == 3, -c["catCos"]))  # prefer 2-char nouns when topping up
    k = 0
    while len(chosen) < total and k < len(leftovers):
        chosen.append(leftovers[k])
        k += 1
    # spec 3.5: nouns >= 70% of the answers. Drop the least on-topic non-nouns until the share is met
    # (the bank may end up smaller than `total`; the report states the final count).
    while sum(1 for c in chosen if c["pos"] == "n") < 0.72 * len(chosen):
        worst = min((c for c in chosen if c["pos"] != "n"), key=lambda c: c["catCos"])
        chosen.remove(worst)
    a.practice = min(a.practice, len(chosen) - a.daily)
    daily, rest = schedule(chosen, a.daily, rng)
    rng.shuffle(rest)
    practice = rest[: a.practice]

    outdir = os.path.join(P.PRIVATE, "bank_ranks")
    shutil.rmtree(outdir, ignore_errors=True)
    os.makedirs(outdir)
    lines, sheet = [], []
    ids = set()

    def make(c, pool, n):
        ranks, order = rank_list(emb, c["idx"])
        while True:
            _id = "%016x" % rng.getrandbits(64)
            if _id not in ids:
                ids.add(_id)
                break
        raw = ranks.astype("<u2").tobytes()
        with open(os.path.join(outdir, _id + ".bin"), "wb") as f:
            f.write(raw)
        g = c["gate"]
        doc = {
            "_id": _id, "pool": pool,
            ("seq" if pool == "daily" else "practiceNo"): n,
            "vocabVersion": P.VOCAB_VERSION, "gateVersion": P.GATE_VERSION,
            "wordIdx": c["idx"], "word": c["word"], "synonyms": [],
            "ranks": base64.b64encode(raw).decode("ascii"),
            "top100": order[:100].tolist(),
            "difficulty": c["difficulty"], "category": c["category"],
            "gate": {"chipMedian": g["chip"]["median"], "chipP90": g["chip"]["p90"],
                     "typistMedian": g["typist"]["median"], "solve80": min(g["chip"]["solve80"], g["typist"]["solve80"]),
                     "chipSolve80": g["chip"]["solve80"], "typistSolve80": g["typist"]["solve80"]},
            "reviewStatus": "pending", "reviewedBy": [], "used": False, "retired": False,
        }
        lines.append(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
        sheet.append("== %s %s #%d  %s  %s  chip median %s\n   top100: %s\n   synonyms: \n" % (
            pool, c["word"], n, c["category"], c["difficulty"], g["chip"]["median"],
            " ".join(words[j] for j in order[1:101])))

    for n, c in enumerate(daily, 1):
        make(c, "daily", n)
    for n, c in enumerate(practice, 1):
        make(c, "practice", n)
    with open(P.BANK_FILE, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    with open(os.path.join(P.PRIVATE, "review_sheet.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(sheet))

    allc = daily + practice
    gates = [c["gate"] for c in allc]
    rep = {
        "vocab_size": v,
        "gate_candidates_simulated": len(gate),
        "gate_passed": sum(1 for g in gate.values() if g["pass"]),
        "gate_pass_rate": round(sum(1 for g in gate.values() if g["pass"]) / len(gate), 4),
        "passing_rejected_for_neighbour_blocklist": rejected_neighbour,
        "answers": len(allc), "daily": len(daily), "practice": len(practice),
        "two_char_share": round(sum(1 for c in allc if len(c["word"]) == 2) / len(allc), 3),
        "noun_share": round(sum(1 for c in allc if c["pos"] == "n") / len(allc), 3),
        "by_difficulty": dict(collections.Counter(c["difficulty"] for c in allc)),
        "by_category": dict(collections.Counter(c["category"] for c in allc)),
        "daily_by_difficulty": dict(collections.Counter(c["difficulty"] for c in daily)),
        "chip_median_of_medians": float(np.median([g["chip"]["median"] for g in gates])),
        "chip_p90_max": max(g["chip"]["p90"] for g in gates),
        "typist_median_of_medians": float(np.median([g["typist"]["median"] for g in gates])),
        "bank_jsonl_bytes": os.path.getsize(P.BANK_FILE),
        "review_status": "all pending: human neighbour review and synonym listing not done",
    }
    P.write_json(os.path.join(P.REPORTS, "bank_report.json"), rep)
    print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
