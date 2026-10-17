# 群友刻度盘 AppIDs

- Shared test AppID (development, in `apps/kedupan/game/project.config.json`, founder instruction, see CLAUDE.md): `wxcd03c1b62d7eb0e0`.
- Real registered AppID for the release build: **NOT YET REGISTERED**. The founder registers it in HANDOFF section 0 and tells the CTO. Record it here, then pass it to the release switch with `--appid` (never commit it into `project.config.json`):

  `REAL_APPID = wx________________`   (fill in after registration)

An AppID is public, not a secret. The AppSecret never goes in the repo, in chat or in a doc.
