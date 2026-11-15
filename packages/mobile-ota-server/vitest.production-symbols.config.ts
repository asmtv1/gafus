import { defineConfig } from 'vitest/config';
/** Unit-only: no PostgreSQL, Cloud.ru or GitHub. */
export default defineConfig({test:{include:['tests/ci-registration-production-symbols.test.ts'],
  environment:'node',fileParallelism:false}});
