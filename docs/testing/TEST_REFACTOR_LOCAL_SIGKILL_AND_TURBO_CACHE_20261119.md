# GAFUS — supervised SIGKILL recovery and Turbo test-cache hash (2026-11-19)

**Scope:** disposable local QA in /Users/asmtv1/Desktop/gafus-refactor, uncommitted working tree, branch main, HEAD 04052d616fa72f8edd2ad49f496f5c744c710fed. Not a CI workflow gate, native-device release approval, production evidence or full ten-stage migration.

## SIGKILL of owned wrapper — real PostgreSQL18 and Redis

Reproduction: node scripts/qa/test-owned-local-services-lifecycle.mjs

**PASS 7/7**, exit 0. Receipt:

    .qa/testing/qa-local-lifecycle-44b7f900-4c0d-4332-9074-9753e7e8000b/summary.json

Two concurrently running isolated localhost PostgreSQL and Redis pairs have separate data and ports. Targeted SIGTERM releases A without stopping B, then stops B. Deliberate startup failure exits 3 with cleanup. The new test sends SIGKILL only to its exact owned shell wrapper after READY. The outer QA supervisor stays alive, verifies postmaster.pid data directory and port plus Redis INFO server process_id against the startup receipt, and stops only those verified processes. Two negative tests forge Redis PID and PG port: the supervisor refuses to stop the nonmatching processes, which remain responsive. Cleanup succeeds with real identifiers, confirming directory deletion and freed ports.

**Limit:** requires outer supervisor to stay alive and retain READY data. Does not establish cleanup after SIGKILL of the supervisor itself, power loss, loss of all receipts or Docker Compose cancellation. Docker Engine was unavailable.

Changed source: scripts/qa/test-owned-local-services-lifecycle.mjs.

## Turbo test cache missing directly executed Web Vite config

Before: actual dry-run pnpm exec turbo run test --filter=@gafus/web-vite --dry=json had 717 hashed input files for @gafus/web-vite#test. It omitted vite.config.test.mjs even though package test directly executes that file, and also omitted vite.config.mjs. Fingerprint: df636a4b2d754ac4.

Changed only the existing test input globs in turbo.json to also include vite.config.*. After: 719 inputs including both Vite configs, fingerprint 62664c83ec6c4d60. All existing concurrently modified turbo.json content was preserved.

Regression contract: node --test tests/support/turbo-test-cache-inputs.test.mjs — **2/2 PASS**, exit 0. It validates source inclusion against current real dry-run without pinning a hash that may change under concurrent development.

Saved raw evidence:

    .qa/testing/turbo-cache-verification/before.json
    .qa/testing/turbo-cache-verification/after.json

The all-package fixture/config/test mutation-key proof and release-level CI acceptance remain open. No mandatory workflow/gate was edited.

## Safety checkpoints

- The 13 new package test routes are non-gating test:unit; the original 57 test scripts remain the only existing Turbo test tasks.
- tests/support/workspace-advisory-routing.test.mjs: 3/3 PASS, actual Turbo dry-run showed only nonexistent placeholders for the 13 optional names.
- Existing test-system contracts: 71/71 PASS in the earlier local five-stage run.
- No commit, push, deployment, real provider call, customer data mutation or cloud deletion. The project is dirty from parallel work; git diff --check PASS.
