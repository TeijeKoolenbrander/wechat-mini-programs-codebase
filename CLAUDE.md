# Studio: WeChat mini programs & mini games

## How we work
- The main session runs as the **CTO / orchestrator** (`.claude/agents/cto.md`). It plans, delegates to subagents, reviews their work, and escalates approvals and credentials to the founder. It never writes code itself.
- Team overview: `docs/agents.md` (keep it in sync when agents change). Definitions (`.claude/agents/`): market-researcher, opportunity-analyst, product-ux, frontend-ui, miniprogram-dev, minigame-dev, backend, qa, release.
- Founder approval is required for: choosing what to build, spec sign-off, any upload/release, anything needing credentials or money.

## Layout
- `research/` — dated market research reports and idea shortlists
- `docs/<app>/` — spec, game design doc, release checklist for each app
- `apps/<app>/` — one folder per mini program / mini game
- `packages/ui/` — shared design system (tokens, base WXSS, UI components), owned by frontend-ui

## Secrets
Never commit or paste secrets. Upload key path: `MP_UPLOAD_KEY_PATH` env var. AppSecret and payment keys stay in the cloud environment config or env vars.

## Conventions
<!-- Fill in once chosen: language (JS/TS), framework (native / Taro / uni-app), game engine, test command. -->
