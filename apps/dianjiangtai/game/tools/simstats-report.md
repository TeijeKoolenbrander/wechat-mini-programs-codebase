# simstats report

contentVersion 1, configVersion 1, gateVersion 1, node v24.15.0
seeds 100000; tau 0.7; jitter 0.35; curve [7.47, 7.734, 7.997, 8.261, 8.525, 8.788, 9.052, 9.315, 9.579, 9.843, 10.106, 10.37]

models simulated in 172.9 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 2.14 | 2 | 0.00% | mean 4.5-5.5 |
| naive | 5.73 | 6 | 0.09% | mean 7-8 |
| greedy | 7.48 | 8 | 0.41% | mean 8-9, 12-0 <= 5% |
| sensible | 6.61 | 7 | 0.25% | median 7, 12-0 1-3% |

- NOTE random mean 2.14 (soft; original target 4.5-5.5)
- NOTE naive mean 5.73 (soft; original target 7-8)
- NOTE greedy mean 7.48 (soft; original target 8-9)
- PASS greedy 12-0 0.41% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.09% < 0.2%
- PASS sensible 12-0 0.25% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.25% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 7.61% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 28.54% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 34.44% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 20.31% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 7.60% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 1.26% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.9976, 0.9874, 0.9615, 0.9114, 0.8301, 0.7084, 0.5486, 0.364, 0.1957, 0.0786, 0.0205, 0.0025]`

Events fired in 27.99% of sensible runs (target 15-30%).

## Cell frequencies over seeds (AC 6: tiers never change draw odds)

16 cells, expected 6.25% each; max relative deviation 1.12% (uniform by construction, no weighting by tier or rarity).
- PASS cell frequencies uniform within 5%

## Optimal (复盘) rates and search timing

Optimal over primary tokens (no re-spins), 3000 seeds: 12-0 on 1.67% (target >= 95%).
Optimal over the sensible player's final tokens (what 复盘 shows), 3000 seeds: 12-0 on 1.73%.
- NOTE optimal 12-0 on 1.67% of free seeds (soft; original target >= 95%, relaxed by the 12-0-is-really-hard decision)

Search time over 6000 searches (node v24.15.0, this machine): p50 22.4 ms, p90 80.0 ms, p99 192.6 ms, max 405.2 ms; lineup evaluations p50 23520, p99 208800, max 384960.
Client-side 复盘 (the sensible player's final tokens, <= 2500 distinct sets): 2788 searches, p50 20.7 ms, p99 140.1 ms, max 301.2 ms. 212 of 3000 runs (7.07%) exceed that size and are served by getReplay first (spec 7.4).
Constructed worst case (largest set count over all token combinations sampled, five biggest distinct cells): 4116 distinct sets, 233880 lineup evaluations, 205.2 ms.
- FAIL client-side 复盘 max 301.2 ms < 300 ms in node (heavy token sets go to getReplay; the constructed worst case is one of them)

## Arguability

- PASS most frequent general in optimal lineups: 皇甫嵩 in 48.73% (<= 60%)
- 主公: 9 different best occupants; top: 刘备 33.73%, 皇甫嵩 26.33%, 张鲁 16.73%
- 军师: 12 different best occupants; top: 周瑜 42.20%, 诸葛亮 26.47%, 陆逊 11.27%
- 先锋: 15 different best occupants; top: 张辽 33.47%, 孙坚 16.23%, 关羽 14.27%
- 猛将: 12 different best occupants; top: 许褚 32.40%, 关羽 27.70%, 孟获 14.70%
- 守将: 16 different best occupants; top: 曹操 26.93%, 皇甫嵩 21.97%, 张鲁 15.00%

## Daily gates

Seeds where perfect play reaches 12-0 (the 'relaxed' daily fallback, spec 5.2): 1.07%.
gateCheck over 1500 candidate seeds: accepted 0.33%; optimal failed 98.93%; mean greedy 12-0 rate 17.50%; mean random 12-0 rate 0.28%.
gateCheck time per seed: median 21.3 ms, p99 218.4 ms; p99 x 50 candidates = 10.9 s (cloud-function-equivalent Node runtime).
Probability that at least one of 50 candidates is accepted: 15.38%.
- NOTE strict daily gate acceptance 0.33%; P(at least one of 50 live tries passes) 15.38%; about 300 candidates per accepted seed, so the offline seed bank (--bank) is mandatory


RESULT: 1 target(s) not met
  not met: client-side 复盘 max 301.2 ms < 300 ms in node (heavy token sets go to getReplay; the constructed worst case is one of them)
