"""Shared paths/constants for the yuyirelen similarity-data pipeline."""
import hashlib
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
BLOCK = os.path.join(HERE, "blocklist")
INPUTS = os.path.join(HERE, "inputs")
CACHE = os.path.join(HERE, "cache")  # model weights (gitignored)
PUBLIC = os.path.join(HERE, "out", "public")  # committed: vocab, near.bin, manifest
PRIVATE = os.path.join(HERE, "out", "private")  # gitignored: embeddings, answers, bank
REPORTS = os.path.join(HERE, "reports")  # committed: aggregate reports, no answer words
for d in (PUBLIC, PRIVATE, REPORTS, CACHE):
    os.makedirs(d, exist_ok=True)

VOCAB_VERSION = 1
GATE_VERSION = 1
CONFIG_VERSION = 1
V_TARGET = 30000
V_MIN, V_MAX = 20000, 40000
NEAR_K = 20
SEED = 20261015

VOCAB_FILE = os.path.join(PUBLIC, "vocab.v%d.txt" % VOCAB_VERSION)
NEAR_FILE = os.path.join(PUBLIC, "near.v%d.bin" % VOCAB_VERSION)
EMB_FILE = os.path.join(PRIVATE, "emb.v%d.npy" % VOCAB_VERSION)
FREQ_FILE = os.path.join(PRIVATE, "vocab_freq.json")  # per-word jieba freq + pos, aligned with vocab lines
MODEL_FILE = os.path.join(PRIVATE, "model_used.json")
BANK_FILE = os.path.join(PRIVATE, "bank.import.jsonl")


def read_list(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                out.append(line)
    return out


def load_vocab():
    with open(VOCAB_FILE, encoding="utf-8") as f:
        return [l.rstrip("\n") for l in f if l.rstrip("\n")]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path, obj):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def temperature(rank, v):
    """Spec 4.3: T = round(100 * (1 - ln r / ln V))."""
    import math
    return int(round(100 * (1 - math.log(rank) / math.log(v))))
