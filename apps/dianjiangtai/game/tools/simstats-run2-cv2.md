# simstats report

contentVersion 2, configVersion 2, gateVersion 1, node v24.15.0, 8 worker(s)
seeds 100000 (offset 100000); tau 0.7; jitter 0.35; poolCap 8; pMin 0.672; curve [7.36, 7.624, 7.887, 8.151, 8.415, 8.678, 8.942, 9.205, 9.469, 9.733, 9.996, 10.26]

models simulated in 14.5 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 1.51 | 1 | 0.00% | 12-0 < 0.01% |
| naive | 6.05 | 6 | 0.19% | 12-0 < 0.2% |
| greedy | 7.68 | 8 | 0.61% | 12-0 <= 1% |
| sensible | 6.88 | 7 | 0.39% | median 6-7, 12-0 0.2-0.5% |

- NOTE random mean 1.51, naive mean 6.05, greedy mean 7.68 (soft: reported, never gating, D15)
- PASS greedy 12-0 0.61% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.19% < 0.2%
- PASS sensible 12-0 0.39% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.39% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 9.08% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 30.78% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 34.94% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 18.98% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 5.30% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 0.54% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.9991, 0.9946, 0.9788, 0.9416, 0.8683, 0.7518, 0.5894, 0.4024, 0.2234, 0.0946, 0.0274, 0.0039]`

Events fired in 24.03% of sensible runs (target 15-30%).

## Cell frequencies over seeds (AC 6: tiers never change draw odds)

21 cells, expected 4.76% each; max relative deviation 1.99% (uniform by construction, no weighting by tier or rarity).
- PASS cell frequencies uniform within 5%

## Multi-appearance and bonds (sensible player, free play)

Runs drafting at least one multi-appearance general: 88.21%; picks drafted from a cell other than the general's primary faction: 9.94%.

| bond | fires (sensible runs) |
|---|---|
| 桃园 (taoyuan) | 0.31% |
| 江东 (jiangdong) | 1.24% |
| 龙凤 (longfeng) | 0.01% |
| 宿卫 (suwei) | 0.01% |
| 西凉 (xiliang) | 0.00% |
| 释怨 (shiyuan) | 0.02% |
| 神亭 (shenting) | 0.24% |
| 下邳 (xiapi) | 0.00% |
| 河北 (hebei) | 0.00% |
| 平乱 (pingluan) | 0.01% |
| 二士 (ershi) | 0.00% |
| 平吴 (pingwu) | 0.00% |
| 河内 (henei) | 0.00% |
| 父子同袍 (fuzi_guan) | 0.00% |
| 父子同袍 (fuzi_lu) | 1.88% |
| 承业 (houji) | 0.00% |

## Optimal (复盘) rates and arguability

Optimal over primary tokens (no re-spins), 3000 seeds: 12-0 on 1.90%.
Optimal over the sensible player's final tokens (what 复盘 shows), 3000 seeds: 12-0 on 2.00%.
- NOTE optimal 12-0 on 1.90% of free seeds (soft; about 1-2% is accepted under D15)
2608 of 3000 runs (86.93%) exceed search.heavySets (5000) distinct sets and are served by getReplay first (spec 7.4).

- PASS most frequent general in optimal lineups: 刘备 in 34.67% (<= 60%)
- 主公: 23 different best occupants; top: 刘备 34.67%, 陆抗 9.73%, 皇甫嵩 9.53%
- 军师: 30 different best occupants; top: 周瑜 20.33%, 司马懿 16.80%, 诸葛亮 12.30%
- 先锋: 42 different best occupants; top: 张辽 28.77%, 关羽 12.50%, 孙坚 11.83%
- 猛将: 27 different best occupants; top: 文鸯 21.87%, 关羽 15.00%, 甘宁 12.67%
- 守将: 48 different best occupants; top: 满宠 25.50%, 罗宪 16.13%, 曹操 12.43%

Bonds in optimal lineups: taoyuan 3.73%, jiangdong 2.30%, longfeng 0.37%, suwei 1.53%, xiliang 0.07%, shiyuan 4.57%, shenting 0.63%, xiapi 0.00%, hebei 0.00%, pingluan 0.17%, ershi 0.03%, pingwu 0.03%, henei 0.00%, fuzi_guan 0.47%, fuzi_lu 3.13%, houji 0.03%

## 复盘 search timing

1200 searches (node v24.15.0, this machine, one thread): p50 27.1 ms, p90 87.1 ms, p99 253.6 ms, max 588.7 ms; distinct sets p50 14080, max 32768; lineup evaluations p50 1580, p99 124181.
Client-side 复盘 (<= 5000 distinct sets, 13.17% of searches): p50 7.0 ms, p99 82.4 ms, max 112.2 ms.
Heavy (server getReplay first, 86.83% of searches): p50 30.6 ms, p99 257.1 ms, max 588.7 ms (cloud function timeout 10 s).
Constructed worst case (five biggest distinct cells): 32256 distinct sets, 211211 lineup evaluations, 394.9 ms.
- NOTE largest heavySets keeping this sample's client max under 250 ms: 8000
- PASS client-side 复盘 max 112.2 ms < 300 ms in node (p99 82.4 ms; heavy token sets go to getReplay)
- PASS heavy / worst-case search 395 ms is far inside the 10 s getReplay timeout

## Daily gates

Seeds where perfect play reaches 12-0: 1.60%.
gateCheck over 2000 candidate seeds: accepted 0.55%; optimal failed 98.40%; mean greedy 12-0 rate 18.70%; mean random 12-0 rate 0.00%.
gateCheck time per seed (under 8-way parallel load): median 51.2 ms, p99 433.5 ms.
Probability that at least one of 50 candidates is accepted: 24.10%.
- NOTE strict daily gate acceptance 0.55%: about 182 candidates per accepted seed, so the offline seed bank (--bank) is mandatory
- PASS the gate accepts some seeds (the offline bank can be filled)


RESULT: all targets met
