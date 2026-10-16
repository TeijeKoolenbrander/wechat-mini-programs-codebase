# simstats report

contentVersion 2, configVersion 3, gateVersion 1, node v24.15.0, 8 worker(s)
seeds 100000 (offset 9000000); tau 0.7; jitter 0.35; poolCap 8; pMin 0.672; curve [7.665, 7.899, 8.132, 8.366, 8.6, 8.833, 9.067, 9.3, 9.534, 9.768, 10.001, 10.235]

models simulated in 14.3 s

## Player models (free play, 1 free re-spin per dimension)

| model | mean wins | median | 12-0 | target |
|---|---|---|---|---|
| random | 1.23 | 1 | 0.00% | 12-0 < 0.01% |
| naive | 5.61 | 6 | 0.15% | 12-0 < 0.2% |
| greedy | 7.32 | 7 | 0.44% | 12-0 <= 1% |
| sensible | 6.47 | 7 | 0.30% | median 6-7, 12-0 0.2-0.5% |

- NOTE random mean 1.23, naive mean 5.61, greedy mean 7.32 (soft: reported, never gating, D15)
- PASS greedy 12-0 0.44% <= 1%
- PASS random 12-0 0.00% < 0.01%
- PASS naive 12-0 0.15% < 0.2%
- PASS sensible 12-0 0.30% in 0.2-0.5%
- PASS sensible median 7 in 6-7

## Sensible band shares vs 7.5 targets

| band | wins | share | target | ok |
|---|---|---|---|---|
| 一统天下 | 12 | 0.30% | 0.20% - 0.50% | yes |
| 霸业将成 | 10-11 | 6.91% | 6.00% - 10.00% | yes |
| 雄踞一方 | 8-9 | 26.04% | 22.00% - 32.00% | yes |
| 三分鼎立 | 6-7 | 34.81% | 25.00% - 36.00% | yes |
| 偏安一方 | 4-5 | 22.67% | 15.00% - 25.00% | yes |
| 兵微将寡 | 2-3 | 8.17% | 5.00% - 12.00% | yes |
| 一败涂地 | 0-1 | 1.10% | 0.00% - 2.00% | yes |

Cumulative share of sensible runs reaching w wins or better (config.freeRarity):

`[1, 0.9983, 0.989, 0.9622, 0.9073, 0.8142, 0.6806, 0.5124, 0.3325, 0.1781, 0.0721, 0.0204, 0.003]`

Events fired in 24.56% of sensible runs (target 15-30%).

## Cell frequencies over seeds (AC 6: tiers never change draw odds)

21 cells, expected 4.76% each; max relative deviation 1.53% (uniform by construction, no weighting by tier or rarity).
- PASS cell frequencies uniform within 5%

## Multi-appearance and bonds (sensible player, free play)

Runs drafting at least one multi-appearance general: 88.05%; picks drafted from a cell other than the general's primary faction: 10.01%.

| bond | fires (sensible runs) |
|---|---|
| 桃园 (taoyuan) | 0.33% |
| 江东 (jiangdong) | 1.29% |
| 龙凤 (longfeng) | 0.01% |
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
| 父子同袍 (fuzi_lu) | 1.85% |
| 承业 (houji) | 0.00% |

## Optimal (复盘) rates and arguability

Optimal over primary tokens (no re-spins), 3000 seeds: 12-0 on 1.40%.
Optimal over the sensible player's final tokens (what 复盘 shows), 3000 seeds: 12-0 on 1.43%.
- NOTE optimal 12-0 on 1.40% of free seeds (soft; about 1-2% is accepted under D15)
2592 of 3000 runs (86.40%) exceed search.heavySets (5000) distinct sets and are served by getReplay first (spec 7.4).

- PASS most frequent general in optimal lineups: 刘备 in 35.20% (<= 60%)
- 主公: 22 different best occupants; top: 刘备 35.10%, 陆抗 9.87%, 皇甫嵩 9.13%
- 军师: 32 different best occupants; top: 周瑜 21.20%, 司马懿 16.93%, 诸葛亮 11.57%
- 先锋: 45 different best occupants; top: 张辽 28.57%, 孙坚 12.70%, 关羽 12.30%
- 猛将: 32 different best occupants; top: 文鸯 22.90%, 关羽 12.47%, 许褚 12.07%
- 守将: 47 different best occupants; top: 满宠 23.57%, 罗宪 16.53%, 曹操 12.93%

Bonds in optimal lineups: taoyuan 2.93%, jiangdong 2.13%, longfeng 0.30%, suwei 1.87%, xiliang 0.03%, shiyuan 4.00%, shenting 0.93%, xiapi 0.00%, hebei 0.00%, pingluan 0.03%, ershi 0.07%, pingwu 0.00%, henei 0.00%, fuzi_guan 0.27%, fuzi_lu 2.43%, houji 0.03%

## 复盘 search timing

1200 searches (node v24.15.0, this machine, one thread): p50 26.4 ms, p90 68.9 ms, p99 222.3 ms, max 373.4 ms; distinct sets p50 14336, max 32768; lineup evaluations p50 1152, p99 124363.
Client-side 复盘 (<= 5000 distinct sets, 13.92% of searches): p50 6.8 ms, p99 104.0 ms, max 106.9 ms.
Heavy (server getReplay first, 86.08% of searches): p50 29.6 ms, p99 224.6 ms, max 373.4 ms (cloud function timeout 10 s).
Constructed worst case (five biggest distinct cells): 32256 distinct sets, 136777 lineup evaluations, 263.3 ms.
- NOTE largest heavySets keeping this sample's client max under 250 ms: 24000
- PASS client-side 复盘 max 106.9 ms < 300 ms in node (p99 104.0 ms; heavy token sets go to getReplay)
- PASS heavy / worst-case search 263 ms is far inside the 10 s getReplay timeout

## Daily gates

Seeds where perfect play reaches 12-0: 1.35%.
gateCheck over 4000 candidate seeds: accepted 0.43%; optimal failed 98.65%; mean greedy 12-0 rate 14.03%; mean random 12-0 rate 0.00%.
gateCheck time per seed (under 8-way parallel load): median 43.1 ms, p99 319.6 ms.
Probability that at least one of 50 candidates is accepted: 19.18%.
- NOTE strict daily gate acceptance 0.43%: about 235 candidates per accepted seed, so the offline seed bank (--bank) is mandatory
- PASS the gate accepts some seeds (the offline bank can be filled)


RESULT: all targets met
