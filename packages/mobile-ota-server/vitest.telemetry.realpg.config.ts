import { defineConfig } from 'vitest/config';
// Exact disposable PG port and DB name. Never reuse an OTA/shared DB.
const url=process.env.DATABASE_URL??'';
const isolated=process.env.GAFUS_TELEMETRY_TEST_ISOLATED==='true'
  && process.env.GAFUS_API_REALPG_ISOLATED==='1'
  && /^postgresql:\/\/[^@\s]+@127\.0\.0\.1:65493\/gafus_refactor_telemetry_sdk57_qa(?:\?schema=public)?$/.test(url);
if(!isolated)throw new Error('TELEMETRY_TEST_REQUIRES_ISOLATED_PG');
export default defineConfig({test:{environment:'node',fileParallelism:false,
  include:['tests/diagnostics-*.realpg.test.ts']}});
