# simstats report

contentVersion 2, configVersion 2, gateVersion 1, node v24.15.0, 8 worker(s)
seeds 100000 (offset 0); tau 0.7; jitter 0.35; poolCap 8; pMin 0.672; curve [7.36, 7.624, 7.887, 8.151, 8.415, 8.678, 8.942, 9.205, 9.469, 9.733, 9.996, 10.26]

models simulated in 21.2 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 1.50 | 1 | 0.00% | 12-0 < 0.01% |
| naive | 6.05 | 6 | 0.17% | 12-0 < 0.2% |
| greedy | 7.66 | 8 | 0.56% | 12-0 <= 1% |
| sensible | 6.86 | 7 | 0.33% | median 6-7, 12-0 0.2-0.5% |

- NOTE random mean 1.50, naive mean 6.05, greedy mean 7.66 (soft: reported, never gating, D15)
- PASS greedy 12-0 0.56% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.17% < 0.2%
- PASS sensible 12-0 0.33% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.33% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 8.90% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 30.66% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 35.03% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 19.09% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 5.43% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 0.55% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.9993, 0.9945, 0.9784, 0.9402, 0.8665, 0.7494, 0.5875, 0.399, 0.2205, 0.0924, 0.0256, 0.0033]`

Events fired in 24.10% of sensible runs (target 15-30%).

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

Optimal over primary tokens (no re-spins), 3000 seeds: 12-0 on 1.97%.
Optimal over the sensible player's final tokens (what 复盘 shows), 3000 seeds: 12-0 on 2.03%.
- NOTE optimal 12-0 on 1.97% of free seeds (soft; about 1-2% is accepted under D15)
2590 of 3000 runs (86.33%) exceed search.heavySets (5000) distinct sets and are served by getReplay first (spec 7.4).

- PASS most frequent general in optimal lineups: 刘备 in 34.50% (<= 60%)
- 主公: 23 different best occupants; top: 刘备 34.47%, 陆抗 10.13%, 皇甫嵩 9.53%
- 军师: 35 different best occupants; top: 周瑜 18.03%, 司马懿 17.67%, 诸葛亮 12.67%
- 先锋: 45 different best occupants; top: 张辽 27.30%, 关羽 13.00%, 孙坚 11.97%
- 猛将: 31 different best occupants; top: 文鸯 23.13%, 关羽 13.20%, 甘宁 11.87%
- 守将: 47 different best occupants; top: 满宠 26.07%, 罗宪 16.83%, 曹操 11.50%

Bonds in optimal lineups: taoyuan 3.23%, jiangdong 2.23%, longfeng 0.57%, suwei 1.43%, xiliang 0.03%, shiyuan 3.90%, shenting 0.73%, xiapi 0.00%, hebei 0.00%, pingluan 0.13%, ershi 0.00%, pingwu 0.03%, henei 0.00%, fuzi_guan 0.43%, fuzi_lu 2.80%, houji 0.07%

## 复盘 search timing

1200 searches (node v24.15.0, this machine, one thread): p50 41.5 ms, p90 118.3 ms, p99 340.8 ms, max 1597.1 ms; distinct sets p50 14080, max 32768; lineup evaluations p50 1552, p99 138779.
Client-side 复盘 (<= 5000 distinct sets, 16.50% of searches): p50 9.5 ms, p99 90.5 ms, max 111.8 ms.
Heavy (server getReplay first, 83.50% of searches): p50 48.3 ms, p99 354.0 ms, max 1597.1 ms (cloud function timeout 10 s).
Constructed worst case (five biggest distinct cells): 32256 distinct sets, 211211 lineup evaluations, 473.9 ms.
- NOTE largest heavySets keeping this sample's client max under 250 ms: 13000
- PASS client-side 复盘 max 111.8 ms < 300 ms in node (p99 90.5 ms; heavy token sets go to getReplay)
- PASS heavy / worst-case search 474 ms is far inside the 10 s getReplay timeout

## Daily gates

Seeds where perfect play reaches 12-0: 1.68%.
gateCheck over 4000 candidate seeds: accepted 0.55%; optimal failed 98.32%; mean greedy 12-0 rate 15.97%; mean random 12-0 rate 0.00%.
gateCheck time per seed (under 8-way parallel load): median 44.6 ms, p99 396.0 ms.
Probability that at least one of 50 candidates is accepted: 24.10%.
- NOTE strict daily gate acceptance 0.55%: about 182 candidates per accepted seed, so the offline seed bank (--bank) is mandatory
- PASS the gate accepts some seeds (the offline bank can be filled)


RESULT: all targets met
