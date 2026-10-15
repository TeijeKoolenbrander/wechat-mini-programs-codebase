"""Re-check the generated data against the OUTPUT_FORMAT.md contract (spec 3.7 verify-bank pattern), then write manifest.json.

Exit code 1 on any violation; the manifest is only written when everything passes.
"""
import base64
import collections
import json
import os
import sys

import numpy as np

import pcommon as P


def main():
    errs = []
    words = P.load_vocab()
    v = len(words)
    if len(set(words)) != v:
        errs.append("vocab has duplicates")
    if not P.V_MIN <= v <= P.V_MAX:
        errs.append("vocab size out of range")
    near = np.fromfile(P.NEAR_FILE, dtype="<u2")
    if near.size != v * P.NEAR_K:
        errs.append("near.bin size mismatch")
    else:
        near = near.reshape(v, P.NEAR_K)
        if int(near.max()) >= v:
            errs.append("near index out of range")
        if (near == np.arange(v)[:, None]).any():
            errs.append("near row contains self")
        srt = np.sort(near, axis=1)
        if (srt[:, 1:] == srt[:, :-1]).any():
            errs.append("near row has duplicates")
    n = 0
    seen_id, seq, pno = set(), [], []
    docs = []
    with open(P.BANK_FILE, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            docs.append(d)
            n += 1
            tag = d["_id"]
            if tag in seen_id:
                errs.append("dup _id")
            seen_id.add(tag)
            raw = base64.b64decode(d["ranks"])
            ranks = np.frombuffer(raw, dtype="<u2")
            if ranks.size != v:
                errs.append("%s ranks length" % tag)
                continue
            if not np.array_equal(np.sort(ranks), np.arange(1, v + 1, dtype="<u2")):
                errs.append("%s ranks not a permutation" % tag)
            if ranks[d["wordIdx"]] != 1:
                errs.append("%s answer not rank 1" % tag)
            if words[d["wordIdx"]] != d["word"] or len(d["word"]) not in (2, 3):
                errs.append("%s word mismatch/length" % tag)
            if d["wordIdx"] >= 8000:
                errs.append("%s not common enough" % tag)
            if len(d["top100"]) != 100 or d["top100"][0] != d["wordIdx"] or any(ranks[j] != k + 1 for k, j in enumerate(d["top100"])):
                errs.append("%s top100 inconsistent" % tag)
            g = d["gate"]
            if not (10 <= g["chipMedian"] <= 30 and g["chipP90"] <= 45 and g["typistMedian"] <= 60 and g["solve80"] >= 0.95):
                errs.append("%s gate fields outside windows" % tag)
            if d["vocabVersion"] != P.VOCAB_VERSION:
                errs.append("%s vocabVersion" % tag)
            if os.path.getsize(os.path.join(P.PRIVATE, "bank_ranks", tag + ".bin")) != 2 * v:
                errs.append("%s bank_ranks file size" % tag)
            (seq if d["pool"] == "daily" else pno).append(d)
    seq.sort(key=lambda d: d["seq"])
    if [d["seq"] for d in seq] != list(range(1, len(seq) + 1)):
        errs.append("daily seq not 1..n")
    if sorted(d["practiceNo"] for d in pno) != list(range(1, len(pno) + 1)):
        errs.append("practiceNo not 1..n")
    for k, d in enumerate(seq):
        if k and d["category"] == seq[k - 1]["category"]:
            errs.append("daily category repeat at seq %d" % d["seq"])
        if k and d["difficulty"] == "hard" and seq[k - 1]["difficulty"] == "hard":
            errs.append("two hard days in a row at seq %d" % d["seq"])
    for k in range(len(seq)):
        if sum(1 for d in seq[k:k + 7] if d["difficulty"] == "hard") > 2:
            errs.append("more than 2 hard in a week at seq %d" % seq[k]["seq"])
            break
    if errs:
        print("VERIFY FAILED:\n" + "\n".join(errs[:50]))
        sys.exit(1)
    model = json.load(open(P.MODEL_FILE, encoding="utf-8"))
    files = {}
    for p in (P.VOCAB_FILE, P.NEAR_FILE):
        files[os.path.basename(p)] = {"bytes": os.path.getsize(p), "sha256": P.sha256(p)}
    manifest = {
        "vocabVersion": P.VOCAB_VERSION, "gateVersion": P.GATE_VERSION, "configVersion": P.CONFIG_VERSION,
        "vocabSize": v, "nearK": P.NEAR_K, "answers": n, "daily": len(seq), "practice": len(pno),
        "model": {"id": model["model"], "revision": model["revision"], "licence": model["licence"], "dims": model["dims"],
                  "fallbackUsed": model["fallback_used"]},
        "files": files,
        "bankJsonl": {"bytes": os.path.getsize(P.BANK_FILE), "sha256": P.sha256(P.BANK_FILE), "committed": False},
    }
    P.write_json(os.path.join(P.PUBLIC, "manifest.json"), manifest)
    print("VERIFY OK: %d answers (%d daily, %d practice), V=%d" % (n, len(seq), len(pno), v))


if __name__ == "__main__":
    main()
