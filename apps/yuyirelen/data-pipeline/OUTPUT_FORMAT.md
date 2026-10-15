# Output format of the similarity-data pipeline

Contract for the backend (cloud functions, import scripts). All files are produced by `run_all.ps1` / the numbered scripts (see README.md). `V` = vocabulary size (30,000 for `vocabVersion` 1). Current build: 491 answers = 130 `daily` (seq 1-130) + 361 `practice` (practiceNo 1-361), `bank.import.jsonl` about 39.7 MB. All integers are **little-endian**.

Directory layout (relative to `apps/yuyirelen/data-pipeline/`):

| Path | Committed? | Purpose |
|---|---|---|
| `out/public/vocab.v1.txt` | yes | the vocabulary |
| `out/public/near.v1.bin` | yes | 联想词 neighbour table |
| `out/public/manifest.json` | yes | versions, model id + revision, SHA-256 of every output |
| `out/public/watchlist_chips.txt` | yes | top-10 neighbours of identity-adjacent words, for hand review |
| `out/private/bank.import.jsonl` | **no (spoilers, > 20 MB)** | `answer_bank` import file |
| `out/private/bank_ranks/<_id>.bin` | **no** | the same rank arrays as raw files (fallback storage, see below) |
| `out/private/*` (embeddings, candidates, review sheets) | no | local only, deleted after the founder's import |
| `reports/*.json` | yes | aggregate statistics, no answer words |

## 1. `vocab.v1.txt`
UTF-8, LF, one word per line, **no header**, no blank lines. Line number (0-based) = `vocabIdx`. Sorted by jieba frequency, descending (ties by word). Words are 1-4 simplified Chinese characters (GB2312 level-1 characters, plus a few reviewed manual additions that use any GB2312 character). `vocabVersion` = 1. Unique words only.

## 2. `near.v1.bin`
Raw `uint16` array, row-major, shape `[V][20]` (`V * 20 * 2` bytes = 1,200,000 bytes for V = 30,000). Row `i` = the 20 nearest **other** vocabulary words of word `i`, by cosine similarity descending (ties: lower index first). Self is never in its own row. The game's 联想词 are the first 5 words of the row that are not already in the player's ladder.

```js
const near = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2); // node on a little-endian host
const neighbours = (i) => near.subarray(i * 20, i * 20 + 20);
```

## 3. `bank.import.jsonl` (answer bank, spoiler data)
JSON Lines (one JSON object per line, UTF-8), directly importable into the cloud database collection `answer_bank` (console import, "JSON Lines"). One line per answer. Fields:

| Field | Type | Meaning |
|---|---|---|
| `_id` | string | random 16 hex characters; never derived from the word |
| `pool` | `"daily"` or `"practice"` | |
| `seq` | int | present only for `daily`: consumption order (1, 2, 3, ...), already arranged so no two `hard` days are adjacent, at most 2 `hard` per 7 days, no repeated category on consecutive days |
| `practiceNo` | int | present only for `practice`: public number 练习 #n (1, 2, ...) |
| `vocabVersion` | int | 1 |
| `gateVersion` | int | 1 (difficulty-gate parameters, see README) |
| `wordIdx` | int | answer's `vocabIdx` |
| `word` | string | the answer word (equals `vocab[wordIdx]`) |
| `synonyms` | int[] | vocab indices of reviewed exact synonyms (empty until a human reviewer fills them) |
| `ranks` | string | **base64 of a `Uint16Array(V)` (little-endian)**: `ranks[vocabIdx]` = rank of that word for this answer, 1 = the answer itself, 1..V a permutation. Length 40,000 base64 chars per 30,000 words (about 80 KB) |
| `top100` | int[100] | `vocabIdx` of the words at rank 1..100 (`top100[0] == wordIdx`); precomputed for the reveal list |
| `difficulty` | `"easy"`, `"medium"` or `"hard"` | **relative** tag: rank of the answer's chip-walker median within the gate-passing set (lowest 35% `easy`, next 45% `medium`, top 20% `hard`). The spec's absolute bands (easy 10-17 / medium 18-24 / hard 25-30) would leave `easy` empty with the spec'd bot (see README, deviations) |
| `category` | string | one of `food animal home nature weather school work sport transport feeling season tool` (assigned by embedding similarity to seed words; unbalanced, `work` is a catch-all, see README) |
| `gate` | object | `{chipMedian, chipP90, typistMedian, solve80, chipSolve80, typistSolve80}` (numbers, from 200 bot runs each) |
| `reviewStatus` | `"pending"` | **no entry has been human-reviewed.** The neighbour review and synonym listing (spec 3.5) are still to be done by product-ux/QA/founder; set to `"approved"` only after that. Functions should publish only `approved` entries in production |
| `reviewedBy` | string[] | empty until reviewed |
| `used` | bool | `false` |
| `retired` | bool | `false` |

Not included (set by the importer/functions): `usedFor`, `importedAt`.

Decoding in a function:

```js
const buf = Buffer.from(doc.ranks, 'base64');          // 2 * V bytes
const ranks = new Uint16Array(buf.buffer, buf.byteOffset, V); // little-endian host
const rank = ranks[vocabIdx];
```

`bank_ranks/<_id>.bin` is the same array as raw bytes (`2 * V` bytes) for the spec's fallback "store each rank array in cloud storage and reference it from the bank entry". The id equals the `_id` of the bank line.

## 4. `manifest.json` (public)
`{vocabVersion, gateVersion, configVersion, vocabSize, nearK, model: {id, revision, licence, dims}, files: {name: {bytes, sha256}}}`. Rebuilding with the same inputs must reproduce `vocab.v1.txt` byte-identically; `near.v1.bin` is reproducible on the same torch/CPU build (floating-point sum order can flip near-ties across machines).

## 5. Rules the data satisfies (checked by `verify_bank.py`)
- `ranks` is a permutation of 1..V; `ranks[wordIdx] == 1`; ties broken by lower `vocabIdx`.
- `vocab[wordIdx] == word`; 2-3 characters; `wordIdx` < 8,000 (frequency rank).
- `near` rows hold distinct in-range indices, never the row's own index.
- Gate fields are inside the spec windows (chip median 10-30, chip p90 <= 45, typist median <= 60, both bots >= 95% solved within 80 steps).
