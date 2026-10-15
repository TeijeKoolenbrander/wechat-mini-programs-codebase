"""Step 1: build the vocabulary from jieba dict.txt (MIT) with POS / frequency / charset / sensitive filters.

Outputs: out/public/vocab.v1.txt, out/private/vocab_freq.json, reports/vocab_report.json
"""
import glob
import json
import os

import jieba

import pcommon as P

KEEP_POS = {"n", "v", "vn", "a", "an", "ad", "d", "t", "s"}
MAX_SINGLE = 1500           # cap on single-character words (polysemous, weak embeddings)
CANDIDATES = 40000
PUBLIC_PROTECT_TOP = 2500  # the public list is noisy (it lists 没有, 时间, 电话...); apply it only below this frequency rank
BAD_EDGE = set("的了着过地得吗呢吧啊呀")  # function characters at word edges mark phrases, not words


def in_gb2312_level1(ch):
    """GB2312 level-1 hanzi (zones 16-55) = 3755 common simplified characters.
    Used as a reproducible, licence-free stand-in for the 3,500-char 一级字表 (see README, deviations)."""
    try:
        b = ch.encode("gb2312")
    except UnicodeEncodeError:
        return False
    return len(b) == 2 and 0xB0 <= b[0] <= 0xD7


def in_gb2312_any(ch):
    try:
        ch.encode("gb2312")
        return True
    except UnicodeEncodeError:
        return False


def load_public_sensitive():
    exact, tri = set(), set()
    for p in glob.glob(os.path.join(P.INPUTS, "sensitive_public", "*.txt")):
        with open(p, encoding="utf-8", errors="ignore") as f:
            for line in f:
                t = line.strip()
                if not t or len(t) > 8:
                    continue
                exact.add(t)
                if len(t) >= 3:
                    tri.add(t)
    return exact, tri


def main():
    dict_path = os.path.join(os.path.dirname(jieba.__file__), "dict.txt")
    rep = {"jieba_version": jieba.__version__}
    rows = []
    with open(dict_path, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) < 3:
                continue
            w, fr, pos = parts[0], int(parts[1]), parts[2]
            rows.append((w, fr, pos))
    rep["dict_rows"] = len(rows)

    cand, drops = [], {"length": 0, "chars": 0, "pos": 0, "edge": 0}
    for w, fr, pos in rows:
        if not 1 <= len(w) <= 4:
            drops["length"] += 1
            continue
        if not all(in_gb2312_level1(c) for c in w):
            drops["chars"] += 1
            continue
        if pos not in KEEP_POS or (pos == "d" and len(w) < 2):
            drops["pos"] += 1
            continue
        if len(w) >= 2 and (w[-1] in BAD_EDGE or w[0] in BAD_EDGE):
            drops["edge"] += 1
            continue
        if len(w) == 1 and pos not in {"n", "v", "a"}:
            drops["pos"] += 1
            continue
        cand.append((w, fr, pos))
    # dedupe (keep highest freq), sort by freq desc then word (deterministic)
    best = {}
    for w, fr, pos in cand:
        if w not in best or fr > best[w][0]:
            best[w] = (fr, pos)
    cand = sorted(((w, fr, pos) for w, (fr, pos) in best.items()), key=lambda x: (-x[1], x[0]))
    singles = 0
    kept = []
    for w, fr, pos in cand:
        if len(w) == 1:
            if singles >= MAX_SINGLE:
                continue
            singles += 1
        kept.append((w, fr, pos))
        if len(kept) >= P.V_TARGET * 4 // 3:
            break
    # NOTE: we keep a surplus before the sensitive filter, then cut to V_TARGET.
    rep["after_basic_filters"] = len(cand)
    rep["basic_drops"] = drops
    rep["candidates_before_sensitive"] = len(kept)

    own_exact = set(P.read_list(os.path.join(P.BLOCK, "exact.txt")))
    own_sub = P.read_list(os.path.join(P.BLOCK, "substring.txt"))
    pub_exact, pub_tri = load_public_sensitive()
    rep["public_list_terms"] = len(pub_exact)
    stats = {"own_exact": 0, "own_substring": 0, "public_exact": 0, "public_substring3": 0}
    removed_samples = {k: [] for k in stats}
    survivors = []
    for rank0, (w, fr, pos) in enumerate(kept):
        reason = None
        if w in own_exact:
            reason = "own_exact"
        elif any(s in w for s in own_sub):
            reason = "own_substring"
        elif rank0 >= PUBLIC_PROTECT_TOP and w in pub_exact and len(w) >= 2:
            reason = "public_exact"
        elif rank0 >= PUBLIC_PROTECT_TOP and len(w) >= 3 and any(w[i:j] in pub_tri for i in range(len(w)) for j in range(i + 3, len(w) + 1)):
            reason = "public_substring3"
        if reason:
            stats[reason] += 1
            if len(removed_samples[reason]) < 40:
                removed_samples[reason].append(w)
            continue
        survivors.append((w, fr, pos))
    rep["sensitive_removed"] = stats
    # Private-only samples (to eyeball over-blocking); written to the private dir, not reports.
    P.write_json(os.path.join(P.PRIVATE, "sensitive_removed_samples.json"), removed_samples)

    # Coverage check (spec step 7): add missing reviewer-list words through the same blocklists.
    cov = P.read_list(os.path.join(P.BLOCK, "coverage.txt"))
    have = {w for w, _, _ in survivors}
    cut = survivors[: P.V_TARGET]
    cutset = {w for w, _, _ in cut}
    cov_u = sorted(set(cov))
    missing = [w for w in cov_u if w not in cutset]
    rep["coverage_list_size"] = len(cov_u)
    rep["coverage_present_before_add"] = len(cov_u) - len(missing)
    # words in dict.txt with any POS get their freq; else freq 1
    freq_any = {}
    for w, fr, pos in rows:
        freq_any[w] = max(fr, freq_any.get(w, 0))
    added = []
    for w in missing:
        if w in own_exact or any(s in w for s in own_sub):
            continue
        if not all(in_gb2312_any(c) for c in w):
            continue
        added.append((w, freq_any.get(w, 1), "manual"))
    # Replace the tail of `cut` so total stays <= V_TARGET
    cut = cut[: P.V_TARGET - len(added)] + added
    cut.sort(key=lambda x: (-x[1], x[0]))
    final = cut
    rep["coverage_added"] = len(added)
    rep["coverage_missing_after"] = len([w for w in cov_u if w not in {x[0] for x in final}])
    assert P.V_MIN <= len(final) <= P.V_MAX, len(final)
    assert len(final) <= 65535
    with open(P.VOCAB_FILE, "w", encoding="utf-8", newline="\n") as f:
        for w, _, _ in final:
            f.write(w + "\n")
    P.write_json(P.FREQ_FILE, [[w, fr, pos] for w, fr, pos in final])
    lens = {}
    for w, _, _ in final:
        lens[len(w)] = lens.get(len(w), 0) + 1
    rep["vocab_size"] = len(final)
    rep["length_histogram"] = {str(k): v for k, v in sorted(lens.items())}
    pos_h = {}
    for _, _, p in final:
        pos_h[p] = pos_h.get(p, 0) + 1
    rep["pos_histogram"] = pos_h
    rep["min_freq_in_vocab"] = final[-1][1]
    P.write_json(os.path.join(P.REPORTS, "vocab_report.json"), rep)
    print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
