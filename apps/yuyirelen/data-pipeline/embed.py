"""Step 2: embed every vocabulary word with bge-large-zh-v1.5 (bare word, no instruction prefix), L2-normalised.

usage: python embed.py [--model-dir DIR] [--limit N]
Writes out/private/emb.v1.npy (V x 1024 float32) and out/private/model_used.json.
"""
import argparse
import os
import time

import numpy as np

import pcommon as P

PRIMARY_DIR = os.path.join(P.CACHE, "bge-large-zh-v1.5")
PRIMARY_REV = "79e7739b6ab944e86d6171e44d24c997fc1e0116"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default=PRIMARY_DIR)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--batch", type=int, default=256)
    a = ap.parse_args()
    import torch
    from sentence_transformers import SentenceTransformer

    torch.set_num_threads(os.cpu_count() or 4)
    words = P.load_vocab()
    if a.limit:
        words = words[: a.limit]
    t0 = time.time()
    model = SentenceTransformer(a.model_dir, device="cpu")
    model.max_seq_length = 16  # words are 1-4 characters
    # sort by length so batches are uniform; restore order afterwards
    order = sorted(range(len(words)), key=lambda i: (len(words[i]), i))
    emb = model.encode([words[i] for i in order], batch_size=a.batch, normalize_embeddings=True,
                       convert_to_numpy=True, show_progress_bar=False)
    out = np.zeros_like(emb, dtype=np.float32)
    out[np.array(order)] = emb.astype(np.float32)
    np.save(P.EMB_FILE, out)
    info = {
        "model": "BAAI/bge-large-zh-v1.5",
        "revision": PRIMARY_REV,
        "licence": "MIT",
        "dims": int(out.shape[1]),
        "fallback_used": False,
        "device": "cpu",
        "torch": torch.__version__,
        "sentence_transformers": __import__("sentence_transformers").__version__,
        "embed_seconds": round(time.time() - t0, 1),
        "words": len(words),
    }
    P.write_json(P.MODEL_FILE, info)
    print(info)


if __name__ == "__main__":
    main()
