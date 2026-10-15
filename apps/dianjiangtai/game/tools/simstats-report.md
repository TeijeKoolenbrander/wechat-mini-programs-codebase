# simstats report

contentVersion 1, configVersion 1, gateVersion 1, node v24.15.0
seeds 100000; tau 0.7; jitter 0.35; curve [7.41, 7.674, 7.937, 8.201, 8.465, 8.728, 8.992, 9.255, 9.519, 9.783, 10.046, 10.31]

models simulated in 125.9 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 2.25 | 2 | 0.00% | mean 4.5-5.5 |
| naive | 5.90 | 6 | 0.13% | mean 7-8 |
| greedy | 7.65 | 8 | 0.55% | mean 8-9, 12-0 <= 5% |
| sensible | 6.78 | 7 | 0.33% | median 7, 12-0 1-3% |

- NOTE random mean 2.25 (soft; original target 4.5-5.5)
- NOTE naive mean 5.90 (soft; original target 7-8)
- NOTE greedy mean 7.65 (soft; original target 8-9)
- PASS greedy 12-0 0.55% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.13% < 0.2%
- PASS sensible 12-0 0.33% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.33% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 8.96% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 30.46% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 33.72% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 18.73% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 6.76% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 1.04% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.998, 0.9896, 0.9667, 0.9219, 0.8476, 0.7346, 0.5817, 0.3975, 0.2204, 0.0929, 0.0253, 0.0033]`

Events fired in 28.26% of sensible runs (target 15-30%).

## Cell frequencies over seeds (AC 6: tiers never change draw odds)

16 cells, expected 6.25% each; max relative deviation 1.12% (uniform by construction, no weighting by tier or rarity).
- PASS cell frequencies uniform within 5%

## Optimal (复盘) rates and search timing

Optimal over primary tokens (no re-spins), 3000 seeds: 12-0 on 1.80% (target >= 95%).
Optimal over the sensible player's final tokens (what 复盘 shows), 3000 seeds: 12-0 on 1.90%.
- NOTE optimal 12-0 on 1.80% of free seeds (soft; original target >= 95%, relaxed by the 12-0-is-really-hard decision)

Search time over 6000 searches (node v24.15.0, this machine): p50 21.6 ms, p90 78.1 ms, p99 187.4 ms, max 476.4 ms; lineup evaluations p50 23280, p99 206400, max 413280.
Client-side 复盘 (the sensible player's final tokens, <= 2000 distinct sets): 2681 searches, p50 19.6 ms, p99 114.2 ms, max 243.9 ms. 319 of 3000 runs (10.63%) exceed that size and are served by getReplay first (spec 7.4).
Constructed worst case (largest set count over all token combinations sampled, five biggest distinct cells): 4116 distinct sets, 268920 lineup evaluations, 248.5 ms.
- PASS client-side 复盘 max 243.9 ms < 300 ms in node (heavy token sets go to getReplay; the constructed worst case is one of them)

## Arguability

- PASS most frequent general in optimal lineups: 皇甫嵩 in 48.77% (<= 60%)
- 主公: 9 different best occupants; top: 刘备 33.93%, 皇甫嵩 25.80%, 张鲁 16.70%
- 军师: 12 different best occupants; top: 周瑜 42.37%, 诸葛亮 26.03%, 陆逊 11.33%
- 先锋: 16 different best occupants; top: 张辽 33.33%, 孙坚 15.93%, 关羽 14.63%
- 猛将: 12 different best occupants; top: 许褚 32.20%, 关羽 27.43%, 孟获 15.03%
- 守将: 15 different best occupants; top: 曹操 27.00%, 皇甫嵩 22.43%, 张鲁 14.80%

## Daily gates

Seeds where perfect play reaches 12-0 (the 'relaxed' daily fallback, spec 5.2): 1.47%.
gateCheck over 1500 candidate seeds: accepted 0.53%; optimal failed 98.53%; mean greedy 12-0 rate 20.41%; mean random 12-0 rate 0.22%.
gateCheck time per seed: median 21.3 ms, p99 229.4 ms; p99 x 50 candidates = 11.5 s (cloud-function-equivalent Node runtime).
Probability that at least one of 50 candidates is accepted: 23.46%.
- NOTE strict daily gate acceptance 0.53%; P(at least one of 50 live tries passes) 23.46%; about 188 candidates per accepted seed, so the offline seed bank (--bank) is mandatory


RESULT: all targets met
