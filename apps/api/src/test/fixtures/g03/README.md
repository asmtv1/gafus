# G03 synthetic readback fault adapter

Test-only opt-in adapter imported by `apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts`. Source must be checked in for a fresh checkout; the historical G03 scratch directory is Git-ignored.

`AG1_G03_REALJWT_PG_REDIS=1` is required for fault injection; the real PG/Redis test must only be run with its explicitly isolated, scoped resources. No production use.
