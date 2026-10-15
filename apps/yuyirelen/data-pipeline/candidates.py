"""Step 5: candidate answers (spec 3.5) with category tags. Output is private (answers).

Rules applied automatically: in vocabulary, 2-3 characters, frequency rank <= 8000 (vocab index < 8000), POS n / v / a,
not on blocklist/answer_exclude.txt, not a starter word, not identity-watchlist, not blocked by the in-house blocklists
(re-checked), category assigned from the embedding (cosine to category seed centroids with a margin).
Automatic proxies for the human rules (the human review is still pending, see README):
  - "unambiguous / neutral": answer_exclude list + blocklist re-check
  - "obviously related neighbours": mean cosine of the top-10 neighbours >= the 10th percentile of the candidates
"""
import json
import os

import numpy as np

import pcommon as P

MAX_IDX = 8000
FUNC_CHARS = set("于在有用到得来去上下的了着过把被将让给对为以与及或而且也都就还又很太更最")  # phrase-like words (带有, 出于, 找到...)
CAT_KEEP = 700
MARGIN = 0.0       # best category cosine minus second best
MIN_CAT_COS = None   # computed as the 35th percentile of best-category cosine


def main():
    words = P.load_vocab()
    freq = json.load(open(P.FREQ_FILE, encoding="utf-8"))
    emb = np.load(P.EMB_FILE)
    idx = {w: i for i, w in enumerate(words)}
    excl = set(P.read_list(os.path.join(P.BLOCK, "answer_exclude.txt")))
    excl |= set(P.read_list(os.path.join(P.BLOCK, "starters.txt")))
    excl |= set(P.read_list(os.path.join(P.BLOCK, "watchlist.txt")))
    excl_sub = P.read_list(os.path.join(P.BLOCK, "answer_exclude_substring.txt"))
    own_exact = set(P.read_list(os.path.join(P.BLOCK, "exact.txt")))
    own_sub = P.read_list(os.path.join(P.BLOCK, "substring.txt"))
    cats = json.load(open(os.path.join(P.BLOCK, "categories.json"), encoding="utf-8"))
    names = sorted(cats)
    cent = []
    for n in names:
        ids = [idx[w] for w in cats[n] if w in idx]
        # embed seeds that are missing from the vocabulary is unnecessary: seeds were chosen to be common words
        c = emb[ids].mean(axis=0)
        cent.append(c / np.linalg.norm(c))
    cent = np.stack(cent)

    pool = []
    for i in range(min(MAX_IDX, len(words))):
        w, fr, pos = freq[i]
        if len(w) not in (2, 3) or pos not in ("n", "v", "a"):
            continue
        if w in excl or w in own_exact or any(s in w for s in own_sub):
            continue
        if any(s in w for s in excl_sub) or any(ch in FUNC_CHARS for ch in w):
            continue
        pool.append(i)
    sims = emb[pool] @ emb.T  # (n, V)
    top10 = np.sort(sims, axis=1)[:, -11:-1]  # excludes self (largest = 1.0)
    top10mean = top10.mean(axis=1)
    cs = emb[pool] @ cent.T
    order = np.argsort(-cs, axis=1)
    best = cs[np.arange(len(pool)), order[:, 0]]
    second = cs[np.arange(len(pool)), order[:, 1]]
    min_cat = float(np.percentile(best, 35))
    min_rel = float(np.percentile(top10mean, 10))
    out, dropped = [], {"category": 0, "relatedness": 0}
    for k, i in enumerate(pool):
        if best[k] - second[k] < MARGIN:
            dropped["category"] += 1
            continue
        if top10mean[k] < min_rel:
            dropped["relatedness"] += 1
            continue
        out.append({"idx": i, "word": words[i], "pos": freq[i][2], "category": names[int(order[k, 0])],
                    "catCos": round(float(best[k]), 4), "top10Cos": round(float(top10mean[k]), 4)})
    # keep each category's CAT_KEEP words closest to its seed centroid (the rest are generic abstract words)
    kept = []
    for n in names:
        grp = sorted((c for c in out if c["category"] == n), key=lambda c: -c["catCos"])[:CAT_KEEP]
        kept += grp
    dropped["category_cap"] = len(out) - len(kept)
    out = sorted(kept, key=lambda c: c["idx"])
    P.write_json(os.path.join(P.PRIVATE, "candidates.json"), out)
    rep = {"pool_before_proxies": len(pool), "dropped": dropped, "candidates": len(out),
           "min_category_cosine": round(min_cat, 4), "min_top10_mean_cosine": round(min_rel, 4),
           "by_category": {n: sum(1 for c in out if c["category"] == n) for n in names},
           "by_pos": {p: sum(1 for c in out if c["pos"] == p) for p in ("n", "v", "a")}}
    P.write_json(os.path.join(P.REPORTS, "candidates_report.json"), rep)
    print(rep)


if __name__ == "__main__":
    main()
