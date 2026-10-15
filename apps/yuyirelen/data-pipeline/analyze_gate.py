"""Quick look at the gate distribution (private words printed; local use only)."""
import collections
import json
import os

import numpy as np

import pcommon as P

g = json.load(open(os.path.join(P.PRIVATE, "gate.json"), encoding="utf-8"))
c = {x["idx"]: x for x in json.load(open(os.path.join(P.PRIVATE, "candidates.json"), encoding="utf-8"))}
cm = np.array([v["chip"]["median"] for v in g.values()])
print(np.histogram(cm, bins=[0, 10, 14, 18, 22, 26, 30, 34, 38, 42, 50, 300]))
ps = [(k, v) for k, v in g.items() if v["pass"]]
print(collections.Counter(c[int(k)]["category"] for k, v in ps))
print(collections.Counter("easy" if v["chip"]["median"] <= 17 else "medium" if v["chip"]["median"] <= 24 else "hard" for k, v in ps))
print([(c[int(k)]["word"], v["chip"]["median"]) for k, v in g.items() if v["chip"]["median"] <= 22][:30])
