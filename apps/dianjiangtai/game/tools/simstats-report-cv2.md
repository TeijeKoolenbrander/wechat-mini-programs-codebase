# simstats report

contentVersion 2, configVersion 3, gateVersion 1, node v24.15.0, 8 worker(s)
seeds 100000 (offset 0); tau 0.7; jitter 0.35; poolCap 8; pMin 0.672; curve [7.665, 7.899, 8.132, 8.366, 8.6, 8.833, 9.067, 9.3, 9.534, 9.768, 10.001, 10.235]

models simulated in 82.7 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 1.23 | 1 | 0.00% | 12-0 < 0.01% |
| naive | 5.61 | 6 | 0.14% | 12-0 < 0.2% |
| greedy | 7.32 | 7 | 0.44% | 12-0 <= 1% |
| sensible | 6.47 | 7 | 0.26% | median 6-7, 12-0 0.2-0.5% |

- NOTE random mean 1.23, naive mean 5.61, greedy mean 7.32 (soft: reported, never gating, D15)
- PASS greedy 12-0 0.44% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.14% < 0.2%
- PASS sensible 12-0 0.26% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.26% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 6.92% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 26.04% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 34.81% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 22.65% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 8.22% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 1.10% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.9984, 0.989, 0.9621, 0.9067, 0.8138, 0.6803, 0.5119, 0.3322, 0.1775, 0.0718, 0.0199, 0.0026]`

Events fired in 24.32% of sensible runs (target 15-30%).

## Cell frequencies over seeds (AC 6: tiers never change draw odds)

21 cells, expected 4.76% each; max relative deviation 1.12% (uniform by construction, no weighting by tier or rarity).
- PASS cell frequencies uniform within 5%

## Multi-appearance and bonds (sensible player, free play)

Runs drafting at least one multi-appearance general: 88.51%; picks drafted from a cell other than the general's primary faction: 10.02%.

| bond | fires (sensible runs) |
|---|---|
| 桃园 (taoyuan) | 0.32% |
| 江东 (jiangdong) | 1.26% |
| 龙凤 (longfeng) | 0.00% |
| 宿卫 (suwei) | 0.01% |
| 西凉 (xiliang) | 0.00% |
| 释怨 (shiyuan) | 0.01% |
| 神亭 (shenting) | 0.21% |
| 下邳 (xiapi) | 0.00% |
| 河北 (hebei) | 0.00% |
| 平乱 (pingluan) | 0.01% |
| 二士 (ershi) | 0.00% |
| 平吴 (pingwu) | 0.00% |
| 河内 (henei) | 0.00% |
| 父子同袍 (fuzi_guan) | 0.00% |
| 父子同袍 (fuzi_lu) | 1.90% |
| 承业 (houji) | 0.00% |

## Optimal (复盘) rates and arguability

Optimal over primary tokens (no re-spins), 3000 seeds: 12-0 on 1.53%.
Optimal over the sensible player's final tokens (what 复盘 shows), 3000 seeds: 12-0 on 1.57%.
- NOTE optimal 12-0 on 1.53% of free seeds (soft; about 1-2% is accepted under D15)
2590 of 3000 runs (86.33%) exceed search.heavySets (5000) distinct sets and are served by getReplay first (spec 7.4).

- PASS most frequent general in optimal lineups: 刘备 in 34.77% (<= 60%)
- 主公: 24 different best occupants; top: 刘备 34.73%, 陆抗 10.10%, 皇甫嵩 9.50%
- 军师: 34 different best occupants; top: 周瑜 18.03%, 司马懿 17.43%, 诸葛亮 12.63%
- 先锋: 43 different best occupants; top: 张辽 27.53%, 关羽 12.63%, 孙坚 11.90%
- 猛将: 30 different best occupants; top: 文鸯 22.87%, 关羽 13.43%, 甘宁 11.63%
- 守将: 46 different best occupants; top: 满宠 26.17%, 罗宪 16.87%, 曹操 11.47%

Bonds in optimal lineups: taoyuan 3.23%, jiangdong 2.20%, longfeng 0.60%, suwei 1.37%, xiliang 0.03%, shiyuan 4.03%, shenting 0.73%, xiapi 0.00%, hebei 0.00%, pingluan 0.07%, ershi 0.07%, pingwu 0.03%, henei 0.00%, fuzi_guan 0.50%, fuzi_lu 2.80%, houji 0.03%

## 复盘 search timing

1200 searches (node v24.15.0, this machine, one thread): p50 40.6 ms, p90 131.3 ms, p99 362.0 ms, max 1140.6 ms; distinct sets p50 14080, max 32768; lineup evaluations p50 1467, p99 111850.
Client-side 复盘 (<= 5000 distinct sets, 16.50% of searches): p50 10.2 ms, p99 58.5 ms, max 65.4 ms.
Heavy (server getReplay first, 83.50% of searches): p50 48.3 ms, p99 371.5 ms, max 1140.6 ms (cloud function timeout 10 s).
Constructed worst case (five biggest distinct cells): 32256 distinct sets, 136777 lineup evaluations, 393.7 ms.
- NOTE largest heavySets keeping this sample's client max under 250 ms: 7000
- PASS client-side 复盘 max 65.4 ms < 300 ms in node (p99 58.5 ms; heavy token sets go to getReplay)
- PASS heavy / worst-case search 394 ms is far inside the 10 s getReplay timeout

## Daily gates

Seeds where perfect play reaches 12-0: 1.35%.
gateCheck over 4000 candidate seeds: accepted 0.43%; optimal failed 98.65%; mean greedy 12-0 rate 14.03%; mean random 12-0 rate 0.00%.
gateCheck time per seed (under 8-way parallel load): median 54.3 ms, p99 416.6 ms.
Probability that at least one of 50 candidates is accepted: 19.18%.
- NOTE strict daily gate acceptance 0.43%: about 235 candidates per accepted seed, so the offline seed bank (--bank) is mandatory
- PASS the gate accepts some seeds (the offline bank can be filled)


RESULT: all targets met
