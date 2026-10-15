# WeChat Mini Program Studio

A studio repo that builds WeChat mini programs (小程序) and mini games (小游戏).

## How it works

The work is automated with Claude Code and subagents, to get from idea to a release-ready mini program as efficiently as possible. Claude Code runs as the CTO/orchestrator (`.claude/agents/cto.md`): it plans, delegates every task to a specialist subagent, runs independent work in parallel, and reviews the results. It does not write code itself.

| Stage | Subagents |
|---|---|
| Research | market-researcher, opportunity-analyst |
| Spec | product-ux |
| Build | frontend-ui, miniprogram-dev, minigame-dev, backend |
| Verify and ship | qa, release |

Pipeline: idea → research → spec → build → QA → CTO review → release pack. See [`docs/agents.md`](docs/agents.md) for the team.

## The founder's role

The founder chooses what to build and holds all credentials. Uploads, releases, spending, legal filings (认证, 备案, 软著) and pushes or merges to `main` are founder-only ([`docs/constitution.md`](docs/constitution.md), Article 5). Once an idea is approved, the team first produces the registration pack (`docs/<app>/release/registration/`), then builds the complete app with no interim approvals. Each app ends with one Founder Handoff: `docs/<app>/release/HANDOFF.md`.

## Layout

- `apps/<app>/`: one folder per mini program or mini game
- `docs/<app>/`: spec, direction, `decisions.md` (decision log) and `release/`
- `research/`: dated market research and idea shortlists
- `packages/ui/`: shared design system (planned)
- `.claude/agents/`: agent definitions

## Apps

- `dianjiangtai` 点将台: mini game, v1 in build. Flip five command tokens, draft five 三国 generals, and see whether the army wins all twelve battles; then argue about it in the group chat.
- `bibiyi` 比一比: mini game, in build. Two cards: guess whether the second number is more or less than the first; keep the streak going on one national daily deck, and one miss ends the run.
- `chuanhua` 传画接龙: mini game, in build. A sentence passes through the group chat as drawing, guess, drawing; then the whole garbled chain is revealed at once.
- `kedupan` 群友刻度盘: mini game, in build. Place a needle on a scale between two ends (cold to hot, cheap to expensive) for five daily items; then see how close you are to the nation and to your group.
- `yuyirelen` 语义热冷: mini game, in build. Everyone hunts the same secret word each day; each guess shows how close it is in meaning, and the fewest steps in the group wins.
- `cheatshaizi` 骰盅: mini program and mini game, private tool (not for public release). A phone dice cup for 吹牛 / 大话骰 with hidden weighted and override modes.

## Secrets

Secrets are never committed or pasted in chat. The upload key path is read from the `MP_UPLOAD_KEY_PATH` env var; AppSecret and payment keys stay in the cloud environment config or env vars.
