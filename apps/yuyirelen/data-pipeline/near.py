"""Step 4: near.v1.bin = for every vocabulary word its NEAR_K nearest other words (uint16 LE, row-major V x 20).

These are the 联想词 source: the game shows the first 5 not-yet-guessed words of the row.
Also writes out/public/watchlist_chips.txt (top-5 chips of identity-adjacent words, for hand review) and
reports/near_report.json (aggregate stats, no answers).
"""
import os

import numpy as np
import torch

import pcommon as P


def topk_neighbours(emb, k, chunk=2048):
    v = emb.shape[0]
    e = torch.from_numpy(emb)
    out = np.zeros((v, k), dtype=np.uint16)
    outsim = np.zeros((v, k), dtype=np.float32)
    extra = 8
    for s in range(0, v, chunk):
        sims = e[s:s + chunk] @ e.T
        idx = torch.arange(s, min(s + chunk, v))
        sims[torch.arange(len(idx)), idx] = -2.0  # exclude self
        vals, ids = torch.topk(sims, k + extra, dim=1)
        vals, ids = vals.numpy(), ids.numpy()
        for r in range(len(idx)):
            # deterministic tie-break: similarity desc, then lower index
            order = np.lexsort((ids[r], -vals[r]))[:k]
            out[s + r] = ids[r][order]
            outsim[s + r] = vals[r][order]
    return out, outsim


def main():
    words = P.load_vocab()
    emb = np.load(P.EMB_FILE)
    assert emb.shape[0] == len(words)
    near, sims = topk_neighbours(emb, P.NEAR_K)
    near.astype("<u2").tofile(P.NEAR_FILE)
    np.save(os.path.join(P.PRIVATE, "near_sims.npy"), sims)
    # aggregate stats
    overlap = 0
    for i in range(len(words)):
        ci = set(words[i])
        overlap += sum(1 for j in near[i][:5] if ci & set(words[j]))
    rep = {
        "vocab_size": len(words),
        "near_k": P.NEAR_K,
        "near_bytes": os.path.getsize(P.NEAR_FILE),
        "top5_share_with_char_overlap": round(overlap / (5 * len(words)), 4),
        "mean_top1_cosine": round(float(sims[:, 0].mean()), 4),
        "mean_top20_cosine": round(float(sims.mean()), 4),
    }
    P.write_json(os.path.join(P.REPORTS, "near_report.json"), rep)
    wl_path = os.path.join(P.BLOCK, "watchlist.txt")
    idx = {w: i for i, w in enumerate(words)}
    with open(os.path.join(P.PUBLIC, "watchlist_chips.txt"), "w", encoding="utf-8", newline="\n") as f:
        for w in P.read_list(wl_path):
            if w in idx:
                f.write("%s\t%s\n" % (w, " ".join(words[j] for j in near[idx[w]][:10])))
    print(rep)


if __name__ == "__main__":
    main()
