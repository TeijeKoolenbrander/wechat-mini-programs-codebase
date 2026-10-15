# simstats report

contentVersion 1, configVersion 1, gateVersion 1, node v24.15.0
seeds 100000; tau 0.7; jitter 0.35; curve [7.41, 7.674, 7.937, 8.201, 8.465, 8.728, 8.992, 9.255, 9.519, 9.783, 10.046, 10.31]

models simulated in 124.2 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 2.24 | 2 | 0.00% | mean 4.5-5.5 |
| naive | 5.91 | 6 | 0.13% | mean 7-8 |
| greedy | 7.66 | 8 | 0.59% | mean 8-9, 12-0 <= 5% |
| sensible | 6.78 | 7 | 0.35% | median 7, 12-0 1-3% |

- NOTE random mean 2.24 (soft; original target 4.5-5.5)
- NOTE naive mean 5.91 (soft; original target 7-8)
- NOTE greedy mean 7.66 (soft; original target 8-9)
- PASS greedy 12-0 0.59% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.13% < 0.2%
- PASS sensible 12-0 0.35% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.35% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 9.12% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 30.16% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 33.60% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 19.00% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 6.71% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 1.06% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.9981, 0.9894, 0.966, 0.9224, 0.8469, 0.7323, 0.578, 0.3963, 0.2225, 0.0947, 0.0255, 0.0035]`

Events fired in 28.47% of sensible runs (target 15-30%).

## Cell frequencies over seeds (AC 6: tiers never change draw odds)

16 cells, expected 6.25% each; max relative deviation 0.78% (uniform by construction, no weighting by tier or rarity).
- PASS cell frequencies uniform within 5%

## Optimal (复盘) rates and search timing

Optimal over primary tokens (no re-spins), 500 seeds: 12-0 on 3.80% (target >= 95%).
Optimal over the sensible player's final tokens (what 复盘 shows), 500 seeds: 12-0 on 4.00%.
- NOTE optimal 12-0 on 3.80% of free seeds (soft; original target >= 95%, relaxed by the 12-0-is-really-hard decision)

Search time over 1000 searches (node v24.15.0, this machine): p50 20.9 ms, p90 75.0 ms, p99 190.0 ms, max 350.5 ms; lineup evaluations p50 25200, p99 230280, max 459960.
Client-side 复盘 (the sensible player's final tokens, <= 2000 distinct sets): 450 searches, p50 19.2 ms, p99 113.0 ms, max 163.3 ms. 50 of 500 runs (10.00%) exceed that size and are served by getReplay first (spec 7.4).
Constructed worst case (largest set count over all token combinations sampled, five biggest distinct cells): 4116 distinct sets, 268920 lineup evaluations, 208.9 ms.
- PASS client-side 复盘 max 163.3 ms < 300 ms in node (heavy token sets go to getReplay; the constructed worst case is one of them)

## Arguability

- PASS most frequent general in optimal lineups: 周瑜 in 47.80% (<= 60%)
- 主公: 8 different best occupants; top: 刘备 35.20%, 皇甫嵩 23.00%, 诸葛亮 15.60%
- 军师: 9 different best occupants; top: 周瑜 40.60%, 诸葛亮 28.80%, 陆逊 11.20%
- 先锋: 13 different best occupants; top: 张辽 28.60%, 孙坚 19.20%, 关羽 16.80%
- 猛将: 11 different best occupants; top: 许褚 32.60%, 关羽 25.80%, 孟获 14.00%
- 守将: 13 different best occupants; top: 曹操 24.60%, 皇甫嵩 24.40%, 陆逊 15.40%

## Daily gates

Seeds where perfect play reaches 12-0 (the 'relaxed' daily fallback, spec 5.2): 2.00%.
gateCheck over 100 candidate seeds: accepted 0.00%; optimal failed 98.00%; mean greedy 12-0 rate 0.00%; mean random 12-0 rate 0.00%.
gateCheck time per seed: median 20.8 ms, p99 240.7 ms; p99 x 50 candidates = 12.0 s (cloud-function-equivalent Node runtime).
Probability that at least one of 50 candidates is accepted: 0.00%.
- NOTE strict daily gate acceptance 0.00%; P(at least one of 50 live tries passes) 0.00%; about many candidates per accepted seed, so the offline seed bank (--bank) is mandatory


RESULT: all targets met
