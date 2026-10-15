# 语义热冷 similarity-data pipeline (offline)

Builds the vocabulary, the 联想词 neighbour table and the answer bank for `yuyirelen`. Nothing here runs at game time. The exact output files and fields are in **`OUTPUT_FORMAT.md`** (the backend codes against that).

## Run it

Python 3.11 (built with 3.11.x on Windows 11, CPU only, 8 cores). Pinned packages are in `requirements.txt`: jieba 0.42.1, numpy 2.4.6, torch 2.14.1 (CPU), sentence-transformers 6.1.0, transformers 5.19.0, tokenizers 0.23.3, safetensors 0.8.0, huggingface_hub 1.33.0.

```
py -3.11 -m venv .venv
./.venv/Scripts/python -m pip install -r requirements.txt     # Linux/macOS: .venv/bin/python
bash run_all.sh                                               # about 45 minutes, 40 of them embedding
./.venv/Scripts/python -m unittest test_pipeline              # unit tests (no model needed)
```

Steps (each also runnable alone): `fetch_inputs.py` (public sensitive lists, private) -> `download_model.py` (weights into `cache/`, never committed) -> `build_vocab.py` -> `embed.py` -> `near.py` -> `candidates.py` -> `bot_gate.py` -> `build_bank.py` -> `verify_bank.py` (also writes `out/public/manifest.json`).

Committed: `out/public/*` (vocab 219 KB, `near.v1.bin` 1.2 MB, manifest, watchlist chips), `reports/*.json` (aggregates only), scripts, `blocklist/*`. **Gitignored:** `.venv/`, `cache/` (model weights, 1.3 GB), `inputs/`, `out/private/` (embeddings 123 MB, candidates, gate results, `bank.import.jsonl` 39.7 MB, `bank_ranks/`, review sheet). The bank is gitignored both because it is spoiler data (spec 3.7) and because it is over 20 MB. Regenerate with `run_all.sh` (the bot seeds and the selection seed are fixed, so the same embeddings give the same bank).

## Results of the current build (vocabVersion 1, gateVersion 1)

| Item | Value |
|---|---|
| Vocabulary | 30,000 words (24,495 two-character; 1,496 single; 3,430 three; 579 four), min jieba frequency 22 |
| Model | BAAI/bge-large-zh-v1.5 at revision `79e7739b6ab944e86d6171e44d24c997fc1e0116`, CPU fp32, bare word, L2-normalised. Fallback not needed |
| Runtime | vocab 5 s, embedding 2,398 s (40 min), near.bin 19 s, candidates 4 s, bot gate over 2,472 candidates x 400 runs 46 s (7 worker processes), bank 2 min |
| Artifacts | `vocab.v1.txt` 219,210 B; `near.v1.bin` 1,200,000 B; `bank.import.jsonl` 39,732,457 B (491 documents, about 81 KB each); embeddings 123 MB (private) |
| Answers | 491 = 130 daily + 361 practice (spec launch minimum: 90 + 300) |
| Gate | 670 of 2,472 simulated candidates passed (27.1%); all 491 chosen answers pass |
| Chosen answers | 2-character 95.7%, nouns 72.1%, chip-walker median of medians 28, typist median of medians 47, max chip p90 45 |
| Neighbours | 90.6% of the top-5 neighbours share a character with the word (see risks) |
| Coverage list | 354 everyday words; 298 present after the filters, 56 added by the reviewed manual add-list, 0 missing |
| Sensitive filter | removed: 359 own-exact, 151 own-substring, 581 public-exact (frequency rank > 2,500 only), 28 public-substring |

## Licences (all checked 2026-10-15)

| Component | Licence | Source |
|---|---|---|
| BAAI/bge-large-zh-v1.5 (primary model) | MIT (model card metadata `license:mit`; "can be used for commercial purposes free of charge") | https://huggingface.co/BAAI/bge-large-zh-v1.5 |
| Qwen3-Embedding-0.6B (fallback, not used) | Apache-2.0 | https://huggingface.co/Qwen/Qwen3-Embedding-0.6B |
| jieba 0.42.1 and its `dict.txt` | MIT | https://github.com/fxsjy/jieba |
| konsheng/Sensitive-lexicon (private build input, never shipped) | MIT (GitHub licence API reports `MIT`, LICENSE file fetched: "MIT License, Copyright (c) 2024~2099 Konsheng"). This resolves the spec's UNVERIFIED flag | https://github.com/konsheng/Sensitive-lexicon |
| GB2312 character table (Python `gb2312` codec) | a national standard character set, used only as a character filter | n/a |
| numpy (BSD-3), PyTorch (BSD-3), sentence-transformers (Apache-2.0), transformers (Apache-2.0) | tooling only | their PyPI pages |

The shipped files (`vocab.v1.txt`, `near.v1.bin`, the bank) are derived data. Add the MIT notices of jieba and bge-large-zh-v1.5 to `apps/yuyirelen/THIRD_PARTY_NOTICES.md`.

## Sensitive-word handling

Four layers: (1) the public lexicon (private input; applied only to words ranked below 2,500 by frequency because the list itself contains ordinary words such as 没有, 时间, 电话; exact match for all lengths, substring match for list terms of 3 or more characters); (2) our in-house blocklists in `blocklist/` (`exact.txt` about 600 words across politics, sex, violence, drugs, gambling, crime, death, insults, religion, disease stigma, brands, vulgar slang; `substring.txt` about 75 substrings); (3) answer-only exclusions (`answer_exclude*.txt`: people words, illness, money, alcohol, military, religion, officialdom, function characters), plus a rule that an answer's public top-100 list may not contain a blocklisted or heavy-topic word (68 otherwise-passing answers rejected); (4) `blocklist/watchlist.txt` identity-adjacent words, whose top-10 neighbours are listed in `out/public/watchlist_chips.txt` for hand review. **The in-house list is minimal and written by an engineer, not reviewed by product-ux or QA.** The two-reviewer read-through of the 30,000 words and the founder spot-check (spec 3.3 step 4) have NOT happened. The lists are build inputs and are not shipped.

## Deviations from the spec (and why)

1. **Character set:** the 3,500-character 一级字表 file is not available offline under a clear licence, so the filter is GB2312 level-1 (3,755 common simplified characters, zones 16-55). Manual coverage additions may use any GB2312 character.
2. **Coverage list is 354 words, not 500.** Written in-house; a reviewer should extend it.
3. **No bake-off.** Rating neighbour lists blind needs humans. bge-large-zh-v1.5 is used as the default, as the spec says to keep it unless the bake-off says otherwise. The character-overlap number above (90.6% of top-5 neighbours share a character) is the metric the spec's bake-off would compare, and it is high. Recommend running the bake-off on the 40 sample answers before the human review, since a switch rebuilds the bank (`embed.py --model-dir` takes another local model; the script's model metadata would need updating for Qwen3).
4. **The vocabulary is jieba's newspaper-skewed dictionary.** Frequency rank <= 8,000 in this vocabulary contains many formal words (计划, 实践, 事实), so the automatic answer proxies (answer-exclude lists, function-character filter, category-centrality ranking) cannot replace human review. Many bank answers are weak daily words. Expect the reviewers to reject a large share; a larger candidate pool needs a higher frequency cut-off or a second word source (THUOCL food/animal, as the spec allows).
5. **The spec'd chip-walker bot is much weaker than the spec assumed.** Across 2,472 candidates the chip-walker median was 34 (5th-95th percentile 25-49); only 1 candidate had a median under 18 and 27% passed the 10-30 window. The gate windows were kept exactly as specified, so the 491 answers all have a bot median between 15 and 30. Consequences: (a) difficulty tags (`easy/medium/hard`) are **relative** (35/45/20 split of the passing set), because the absolute bands would leave `easy` empty and make the schedule rule (at most 2 hard per week) impossible; (b) the CTO should decide whether to widen the gate (for example median 10-36) or accept that real humans, who choose chips deliberately, will be faster than the random bot.
6. **Category balance missed.** Categories come from embedding similarity to 14 seed words each. The frequency-8000 pool has few animal/season/food words that pass the gate: animal 8, season 11, weather 15, sport 19, tool 19, food 21, home 26, transport 29, school 43, nature 50, feeling 72, work 178 (`work` is a catch-all for abstract words). The daily schedule still guarantees no repeated category on consecutive days.
7. **Answer counts:** the nouns >= 70% rule cut the bank from a target of 540 to 491.
8. **Synonyms are empty** and every document has `reviewStatus: "pending"`; the human top-100 review and synonym listing (spec 3.5) are not done.
9. The bot sets an unsolved run to 1,200 steps and caps simulation at 200 steps. Duplicates cost no step. The first-character hint (hint 3) costs a step but gives the bot nothing. The typist switches to chip-walking after hint 4 is taken.
10. `near.bin` holds 20 neighbours per word (the spec table); the "top-5 联想词" are its first five entries after skipping words already guessed.
11. The bge repository ships only `pytorch_model.bin` (no safetensors), loaded with torch. `huggingface_hub`'s downloader timed out on this machine, so `download_model.py` uses plain HTTPS with resume at the pinned revision.

## Determinism

Vocabulary, selection and bot runs use fixed seeds (`pcommon.SEED`). `vocab.v1.txt` is reproducible byte for byte. Embeddings and neighbour order can differ in the last float bits on a different CPU/torch build, which can flip exact near-ties; the manifest records SHA-256 of the produced files.
