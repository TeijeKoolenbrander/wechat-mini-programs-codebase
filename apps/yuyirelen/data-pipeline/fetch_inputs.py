"""Fetch public build inputs (private, gitignored): the Sensitive-lexicon word lists (MIT).

usage: python -I fetch_inputs.py <out_dir>
"""
import json
import os
import sys
import urllib.parse
import urllib.request

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
REPO = "konsheng/Sensitive-lexicon"
API = "https://api.github.com/repos/%s/contents/Vocabulary" % REPO


def get(u):
    u = urllib.parse.quote(u, safe=":/?=&%")
    req = urllib.request.Request(u, headers={"User-Agent": "yuyirelen-pipeline"})
    return urllib.request.urlopen(req, timeout=60).read()


for e in json.loads(get(API)):
    if e["name"].endswith(".txt"):
        with open(os.path.join(OUT, e["name"]), "wb") as f:
            f.write(get(e["download_url"]))
        print("fetched", e["name"].encode("unicode_escape").decode())
with open(os.path.join(OUT, "LICENSE"), "wb") as f:
    f.write(get("https://raw.githubusercontent.com/%s/main/LICENSE" % REPO))
