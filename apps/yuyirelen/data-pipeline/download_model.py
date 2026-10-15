"""Download BAAI/bge-large-zh-v1.5 at a pinned revision into cache/ (never committed).

huggingface_hub's own downloader timed out on the build machine while plain HTTPS worked, so this uses urllib with
HTTP range resume. The repo only ships pytorch_model.bin (no safetensors).
usage: python download_model.py <cache_dir>
"""
import os
import sys
import urllib.request

REPO = "BAAI/bge-large-zh-v1.5"
REV = "79e7739b6ab944e86d6171e44d24c997fc1e0116"
FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "vocab.txt", "special_tokens_map.json",
         "modules.json", "sentence_bert_config.json", "config_sentence_transformers.json", "1_Pooling/config.json",
         "README.md", "pytorch_model.bin"]


def fetch(url, dest):
    have = os.path.getsize(dest) if os.path.exists(dest) else 0
    req = urllib.request.Request(url, headers={"Range": "bytes=%d-" % have} if have else {})
    try:
        r = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        if e.code == 416:  # already complete
            return
        raise
    with open(dest, "ab" if have and r.status == 206 else "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)


def main():
    root = os.path.join(sys.argv[1], "bge-large-zh-v1.5")
    for name in FILES:
        dest = os.path.join(root, name)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        fetch("https://huggingface.co/%s/resolve/%s/%s" % (REPO, REV, name), dest)
        print("ok", name, os.path.getsize(dest))


if __name__ == "__main__":
    main()
