# QA execution scripts

The current QA status and complete test plan are in [docs/qa](../../docs/qa/CURRENT_RELEASE_STATUS.md), [functional matrix](../../docs/qa/FUNCTIONAL_MATRIX.md) and [next actions](../../docs/qa/NEXT_ACTIONS.md).

Scripts may create/edit/delete local test entities and depend on authenticated Chromium sessions, a specific test PostgreSQL copy, and local service ports. **Never run these against production data.** QA scripts were preserved in place to avoid breaking ongoing acceptance work.
