# GAFUS Refactor scripts

Only use the GAFUS Refactor working directory. Never access GAFUS Main or run production data changes.

- Root-level files: workspace commands, Prisma safety checks, build utilities, maintenance. Paths may be referenced by root package.json and CI.
- [qa/](qa/README.md): current Chromium and native acceptance scripts. Read before running; some tests modify local data.
- [docs/](docs/): documentation source-index generator (`python3 scripts/docs/generate_reference.py`).
- [refactor/](refactor/README.md): isolated historical/manual runtime and visual test harnesses.

**Guardrails:** Do not blindly run apply-migration.sh, reset-db.sh, restore-from-backup.sh, deployment, or cloud helpers. Inspect targets and permissions first.
