#!/usr/bin/env bash
# Full rebuild. Run from this folder with the venv created (see README). Output contract: OUTPUT_FORMAT.md.
set -euo pipefail
PY=./.venv/Scripts/python   # on Linux/macOS: ./.venv/bin/python
[ -d inputs/sensitive_public ] || $PY fetch_inputs.py "$PWD/inputs/sensitive_public"
[ -f cache/bge-large-zh-v1.5/pytorch_model.bin ] || $PY download_model.py "$PWD/cache"
$PY build_vocab.py
$PY embed.py
$PY near.py
$PY candidates.py
$PY bot_gate.py --runs 200
$PY build_bank.py --daily 130 --practice 400
$PY verify_bank.py
