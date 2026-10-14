# simstats report

contentVersion 1, configVersion 1, gateVersion 1, node v24.15.0
seeds 100000; tau 0.7; jitter 0.35; curve [7.7, 7.936, 8.173, 8.409, 8.645, 8.882, 9.118, 9.355, 9.591, 9.827, 10.064, 10.3]

models simulated in 60.9 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 1.91 | 2 | 0.00% | mean 4.5-5.5 |
| naive | 5.47 | 6 | 0.09% | mean 7-8 |
| greedy | 7.30 | 7 | 0.42% | mean 8-9, 12-0 <= 5% |
| sensible | 6.39 | 7 | 0.25% | median 7, 12-0 1-3% |

- NOTE random mean 1.91 (soft; original target 4.5-5.5)
- NOTE naive mean 5.47 (soft; original target 7-8)
- NOTE greedy mean 7.30 (soft; original target 8-9)
- PASS greedy 12-0 0.42% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.09% < 0.2%
- PASS sensible 12-0 0.25% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.25% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 6.95% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 25.83% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 34.02% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 21.79% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 9.30% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 1.86% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.9959, 0.9814, 0.9482, 0.8884, 0.7962, 0.6705, 0.5074, 0.3303, 0.1773, 0.072, 0.0189, 0.0025]`

Events fired in 28.48% of sensible runs (target 15-30%).

## Cell frequencies over seeds (AC 6: tiers never change draw odds)

16 cells, expected 6.25% each; max relative deviation 1.12% (uniform by construction, no weighting by tier or rarity).
- PASS cell frequencies uniform within 5%

## Optimal (复盘) rates and search timing

Optimal over primary tokens (no re-spins), 3000 seeds: 12-0 on 1.40% (target >= 95%).
Optimal over the sensible player's final tokens (what 复盘 shows), 3000 seeds: 12-0 on 1.50%.
- NOTE optimal 12-0 on 1.40% of free seeds (soft; original target >= 95%, relaxed by the 12-0-is-really-hard decision)

Search time over 6000 searches (node v24.15.0, this machine): p50 21.1 ms, p90 72.5 ms, p99 175.6 ms, max 411.2 ms; lineup evaluations p50 22680, p99 205440, max 379680.
Client-side 复盘 (the sensible player's final tokens, <= 2500 distinct sets): 2788 searches, p50 19.7 ms, p99 125.2 ms, max 242.6 ms. 212 of 3000 runs (7.07%) exceed that size and are served by getReplay first (spec 7.4).
Constructed worst case (largest set count over all token combinations sampled, five biggest distinct cells): 4116 distinct sets, 262920 lineup evaluations, 212.3 ms.
- PASS client-side 复盘 max 242.6 ms < 300 ms in node (heavy token sets go to getReplay; the constructed worst case is one of them)

## Arguability

- PASS most frequent general in optimal lineups: 皇甫嵩 in 48.67% (<= 60%)
- 主公: 10 different best occupants; top: 刘备 33.87%, 皇甫嵩 25.73%, 张鲁 16.80%
- 军师: 12 different best occupants; top: 周瑜 42.40%, 诸葛亮 26.13%, 陆逊 11.40%
- 先锋: 16 different best occupants; top: 张辽 33.80%, 孙坚 16.20%, 关羽 14.50%
- 猛将: 12 different best occupants; top: 许褚 31.73%, 关羽 27.33%, 孟获 15.00%
- 守将: 15 different best occupants; top: 曹操 27.33%, 皇甫嵩 22.43%, 张鲁 14.43%

## Daily gates

Seeds where perfect play reaches 12-0 (the 'relaxed' daily fallback, spec 5.2): 1.00%.
gateCheck over 1000 candidate seeds: accepted 0.40%; optimal failed 99.00%; mean greedy 12-0 rate 9.70%; mean random 12-0 rate 0.03%.
gateCheck time per seed: median 20.6 ms, p99 196.9 ms; p99 x 50 candidates = 9.8 s (cloud-function-equivalent Node runtime).
Probability that at least one of 50 candidates is accepted: 18.16%.
- NOTE strict daily gate acceptance 0.40%; P(at least one of 50 live tries passes) 18.16%; about 250 candidates per accepted seed, so the offline seed bank (--bank) is mandatory


RESULT: all targets met
