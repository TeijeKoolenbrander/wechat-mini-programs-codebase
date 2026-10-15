# seed-bank/

Output folder for the offline daily seed bank (spec 5.2). The files here are **spoilers** (they list future daily seeds) and are git-ignored: never commit them, delete them after the import. A `bank*.json` file anywhere under `apps/dianjiangtai/` also trips the cloudfunctions `qa-trust` test (AC 54) while it exists, so keep it here only while preparing the import.

Simplest and safest: generate straight into a folder outside the repo (for example `--bank-file $TMPDIR/bank-cv2-60d.json`) and pass that path to `prepare-bank.js`. Then no bank file ever sits under `apps/dianjiangtai/`, the `qa-trust` AC 54 test stays green, and nothing can be committed by accident. The commands below write into this folder instead, which also works because the ignore file here covers it (delete the file after the import).

Generate (contentVersion 2, configVersion 2, strict gate: optimal = 12-0, greedy window, random window):

```
node apps/dianjiangtai/game/tools/simstats.js --seeds 1000 --optseeds 100 --gateseeds 100 --timeseeds 10 \
  --bank 60 --bank-file apps/dianjiangtai/seed-bank/bank-cv2-60d.json
```

(The `--seeds/--optseeds/...` flags only shrink the statistics sections that run before the bank step. `--workers N` sets the thread count, `--bank-offset K` starts the candidate stream elsewhere to make a different bank.)

Then, per `apps/dianjiangtai/cloudfunctions/README.md` ("Seed bank flow"):

```
node apps/dianjiangtai/cloudfunctions/scripts/prepare-bank.js apps/dianjiangtai/seed-bank/bank-cv2-60d.json <tmp>/bank.import.jsonl
```

`prepare-bank.js` re-verifies every entry with the real core (matching versions, stored best lineup scores 12-0). Each entry: `{seed, contentVersion, configVersion, gateVersion, best:{lineup:[{slot,generalId,faction}], record, evaluated, sets}, gates, used:false}`; the `faction` on each lineup entry is the drafted-cell faction that cohesion needs.

Candidate seeds are `hash32('bank:' + contentVersion + ':' + i)` for `i >= bank-offset`, so a bank is reproducible; two banks from different offsets do not overlap.
