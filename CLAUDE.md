# Studio: WeChat mini programs & mini games

The studio is governed by docs/constitution.md; it overrides conflicting defaults below.

## How we work
- The main session runs as the **CTO / orchestrator** (`.claude/agents/cto.md`). It plans, delegates to subagents, reviews their work, and escalates approvals and credentials to the founder. It never writes code itself.
- Team overview: `docs/agents.md` (keep it in sync when agents change). Definitions (`.claude/agents/`): market-researcher, opportunity-analyst, product-ux, frontend-ui, miniprogram-dev, minigame-dev, backend, qa, release.
- Founder approval is required for: choosing what to build, any upload/release, anything needing credentials or money, legal filings and attestations (认证, 备案, 软著, signing), pushing to or merging into `main`, and irreversible destructive actions (constitution Article 4). Specs and phases are not founder gates: once an idea is approved, the CTO delivers the complete app and ends with one Founder Handoff (`docs/<app>/release/HANDOFF.md`).
## Layout
- `research/` — dated market research reports and idea shortlists
- `docs/<app>/` — spec, game design doc, `decisions.md` (CTO decision log), and `release/` (release pack and `HANDOFF.md`) for each app
- `apps/<app>/` — one folder per mini program / mini game
- `packages/ui/` — shared design system (tokens, base WXSS, UI components), owned by frontend-ui

## Secrets
Never commit or paste secrets. Upload key path: `MP_UPLOAD_KEY_PATH` env var. AppSecret and payment keys stay in the cloud environment config or env vars.

## Conventions
<!-- Fill in once chosen: language (JS/TS), framework (native / Taro / uni-app), game engine, test command. -->
- **Test AppID:** every app under testing uses the shared test AppID `wxcd03c1b62d7eb0e0` in its `project.config.json` by default, unless the founder says otherwise for a specific app. The app's own registered AppID is used only for release builds; record it in `docs/<app>/release/` (not in `project.config.json`) until the founder switches that app over. An AppID is public, not a secret. Never put the AppSecret anywhere in the repo.
