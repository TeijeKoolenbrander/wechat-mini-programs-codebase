# 点将台 AppIDs

- **Real (registered) release AppID: `wx172906d7bfd6036f`.** The account is already registered (founder). Use it only for the release build, by passing it to the release switch: `node tools/release-config.js --env <envId> --appid wx172906d7bfd6036f` (`build-upload.md` section 2; `apps/dianjiangtai/game/RELEASE.md`). Never write it into the committed `project.config.json`: the committed tree stays on the test AppID (the AppID tests are mode-aware).
- **Shared test AppID (development), committed in `apps/dianjiangtai/game/project.config.json` (founder instruction, see CLAUDE.md): `wxcd03c1b62d7eb0e0`.** All development, QA and the harness use it. `release-config.js --dev` restores it byte for byte.

  `REAL_APPID = wx172906d7bfd6036f`   (registered)

  `ACCEPTED_NAME = ________________`  (名称 accepted at registration; must equal the name on both 备案 forms; the founder tells the CTO, `registration/REGISTRATION-STEPS.md` step 1)

  `CLOUD_ENV_ID = dianjiangtai-prod-________`  (environment ID, after HANDOFF section 4; goes into `--env`)

An AppID is public, not a secret. The AppSecret never goes in the repo, in chat or in a doc. The upload key lives outside the repo; its path is in the `MP_UPLOAD_KEY_PATH` environment variable.

## A stray file to leave out of git

`apps/dianjiangtai/project.config.json` (one level above `game/`) is **untracked** and carries the real AppID `wx172906d7bfd6036f` with `compileType: game` and no `packOptions.ignore`. It looks like a DevTools artefact from opening `apps/dianjiangtai` instead of `apps/dianjiangtai/game`. Do not commit it, and do not open `apps/dianjiangtai` for any upload: DevTools would then try to package `cloudfunctions/`, `seed-bank/` and the docs. **Open `apps/dianjiangtai/game`** (it holds `game.js`, `game.json` and the right `project.config.json`). Found 2026-10-15 (release); not touched, because only `docs/dianjiangtai/release/` was in scope. The same kind of file exists untracked for `apps/bibiyi/`.
