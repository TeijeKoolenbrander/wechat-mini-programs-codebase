# Agent Team

This studio's engineering work is done by a team of Claude agents. The founder works with one agent, the **CTO**, which plans the work, hands it to specialist subagents, and checks their results.

The team operates under [`docs/constitution.md`](constitution.md), which overrides any conflicting instruction here or in the agent definitions.

Agent definitions live in `.claude/agents/<name>.md`. To change a role, edit its file. To add a role, add a new file and list it in the CTO's team table in `cto.md`.

## Org chart

```
Founder (what to build, credentials, uploads/releases, filings)
 └─ cto: orchestrator, plans, delegates, reviews
     ├─ Research
     │   ├─ market-researcher   (several run in parallel)
     │   └─ opportunity-analyst
     └─ Build
         ├─ product-ux
         ├─ frontend-ui
         ├─ miniprogram-dev
         ├─ minigame-dev
         ├─ backend
         ├─ qa
         └─ release
```

Subagents can't start other subagents. All work is assigned by the CTO.

## Agent list

| Agent | Role | Model | Writes to | Can change code? |
|---|---|---|---|---|
| `cto` | Orchestrator | Opus | — | No (read-only, delegates) |
| `market-researcher` | Market research | Sonnet | `research/` | No |
| `opportunity-analyst` | Idea scoring & recommendation | Opus | `research/` | No |
| `product-ux` | Specs, flows, wireframes | Opus | `docs/` | No |
| `frontend-ui` | Visual UI & design system | Sonnet | `packages/ui/`, `apps/<app>/` (`.wxml`/`.wxss`) | Yes |
| `miniprogram-dev` | Mini program logic | Sonnet | `apps/<app>/` (`.js`/`.ts`) | Yes |
| `minigame-dev` | Mini game engine & gameplay | Sonnet | `apps/<app>/` | Yes |
| `backend` | Cloud functions, database, payments | Sonnet | `apps/<app>/cloudfunctions`, server code | Yes |
| `qa` | Automated testing & verification | Sonnet | Test files only | Tests only |
| `release` | Compliance check & CI upload | Sonnet | `docs/<app>/release-checklist.md`, CI config | Release tooling only |

## Agent summaries

### cto: Orchestrator
The founder's single point of contact.
- Turns the founder's goals into plans and tracks tasks.
- Writes a full brief for each subagent and runs independent work in parallel.
- Reviews every change for correctness, security, and fit before reporting it done.
- Has no Edit/Write tools, so it has to delegate. It raises compliance blockers (版号, 软著, 备案, privacy) at the idea stage.
- Once an idea is approved, delivers the complete, release-ready app without interim approvals, logging its decisions in `docs/<app>/decisions.md`.
- **Leaves to the founder** (constitution Article 5): choosing what to build, credentials, any upload or release, money, legal filings, merges into `main`, and irreversible actions. These are collected in one Founder Handoff (`docs/<app>/release/HANDOFF.md`).

### market-researcher: Market research
Researches a single angle of the WeChat mini program / mini game market.
- Searches in Chinese and English, using data platforms (阿拉丁指数, DataEye, 引力引擎), industry press (游戏葡萄, 36氪, GameLook), and official WeChat sources.
- Every claim has a source URL and date. Facts are kept separate from inferences. If a figure can't be found, it says so rather than inventing one.
- **Output:** `research/YYYY-MM-DD-<topic>.md` with key findings, evidence, candidate ideas, risks, and open questions.

### opportunity-analyst: Idea evaluation
Turns research into a decision.
- Scores ideas from 1 to 5 on demand, competition, monetization fit, build effort, compliance risk, virality, and time to first revenue.
- For the top 5: tests what has to be true, names the biggest risk, and proposes a cheap validation experiment.
- It's told to argue against weak ideas, not cheer them on.
- **Output:** `research/YYYY-MM-DD-shortlist.md` with a score table, pitches, and a clear "build this first" recommendation.

### product-ux: Product & UX
Defines what gets built.
- Writes specs for mini programs and game design docs for mini games: core loop, session length, social hooks, ad placement.
- Follows WeChat design conventions (WeUI, the 小程序设计指南) and keeps the MVP small.
- Flags compliance-sensitive features such as user data, payments, user-generated content, and virtual currency.
- Writes the registration copy (name and fallbacks, 简介, short name) for the registration pack at the start of each app (constitution Article 4.4).
- **Output:** `docs/<app>/spec.md` with ASCII wireframes and numbered acceptance criteria that QA tests against.

### frontend-ui: Frontend UI engineer
Owns how everything looks and feels.
- Builds and maintains the shared design system in `packages/ui/`: tokens, base WXSS, and presentational components.
- Builds page layout and styling (`.wxml`/`.wxss`), animations, adaptation to different screens (rpx, safe areas, capsule button), dark mode, and accessibility.
- Builds mini game menus, HUD, settings, and result screens.
- Components are presentational only. No API calls or business logic.

### miniprogram-dev: Mini program developer
Owns how mini programs work.
- Page logic and state (`.js`/`.ts`), `wx` API integration, login and the user-consent flows, and calls to cloud functions.
- Keeps packages small with subpackages (分包) and keeps `setData` payloads small.
- Never trusts the client for validation, prices, or permissions, and keeps secrets out of client code.

### minigame-dev: Mini game developer
Builds the games.
- Game loop, rendering, input, physics, audio, and the asset pipeline, in the chosen engine (native Canvas/WebGL, Cocos Creator, LayaAir, …).
- Targets 60 fps on mid-range Android and a fast first load.
- Handles rewarded video and interstitial ads (with fallback when an ad fails), share cards, and friend leaderboards (open data domain).
- Keeps game logic separate from rendering so it can be unit tested.

### backend: Backend engineer
Builds the server side.
- WeChat Cloud Development by default (cloud functions, database, storage), or a self-hosted server if the brief specifies one.
- Takes the user's identity from the trusted context (OPENID), never from client input, and sets strict database security rules.
- Runs payments and virtual currency server side only, with verified, idempotent callbacks. Secrets live in environment variables.

### qa: QA engineer
Verifies the work independently.
- Tests against the spec's acceptance criteria, not the developer's summary.
- Writes unit tests (Jest) and end-to-end tests (`miniprogram-automator` with WeChat DevTools), and checks edge cases: no network, denied permissions, failed ad loads, and different screen sizes.
- Changes test files only. Bugs are reported back, not fixed.
- **Output:** PASS/FAIL per acceptance criterion, plus repro steps for each bug.

### release: Release engineer
Gets builds onto the platform safely.
- **Registration pack first** (constitution Article 4.4): as soon as an app is approved, writes `docs/<app>/release/registration/` (name with 3+ fallbacks, 简介, short name, 服务类目, avatar PNG/JPG, registration steps), with `product-ux` supplying the copy, and keeps it up to date.
- **Rules check:** service category, privacy guidelines, ICP filing (备案), software copyright (软著), game publishing licence (版号), content rules, package size, and secrets.
- **Upload:** uses `miniprogram-ci` with the key at `MP_UPLOAD_KEY_PATH`, **only after founder approval**.
- **Never** submits for review or publishes. The founder does that in mp.weixin.qq.com.
- **Output:** `docs/<app>/release-checklist.md` with each item marked PASS / FAIL / NEEDS-FOUNDER.

## Standard workflows

**Idea discovery**
`market-researcher` ×2–4 (parallel) → `opportunity-analyst` → CTO presents the top 3–5 → founder picks one.

**Build**
`release` + `product-ux` registration pack in `docs/<app>/release/registration/` (immediately, constitution Article 4.4) → `product-ux` spec (CTO signs off) → `backend` + `frontend-ui` + `miniprogram-dev`/`minigame-dev` (parallel, without overlapping files) → `qa` → CTO review → `release` pack and Founder Handoff in `docs/<app>/release/` → founder approves the upload → `release` uploads → founder submits for review.

## Founder responsibilities
- Decide what to build, and approve uploads. Work through the Founder Handoff at the end of each build.
- Provide the AppIDs and the upload private key (stored outside the repo, with its path in the `MP_UPLOAD_KEY_PATH` environment variable).
- Handle filings and licences: 认证, 备案, 软著, and 版号 where needed; merge into `main`.
- Submit for review and publish in the WeChat admin console.

## Running the team
- Start Claude Code in `codebase/`. The CTO loads automatically (`.claude/settings.json` sets `"agent": "cto"`); if it doesn't, run `claude --agent cto`.
- To change or add agents, edit the files in `.claude/agents/`, or ask Claude to. The `/agents` wizard has been removed.
