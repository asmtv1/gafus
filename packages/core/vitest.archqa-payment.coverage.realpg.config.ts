/** Disposable PostgreSQL: collect the one source-adapter test, not its imported test a second time. */
import {defineConfig,mergeConfig} from 'vitest/config';
import base from './vitest.archqa-payment.realpg.config';
const config=mergeConfig(base,defineConfig({test:{fileParallelism:false}}));
if(config.test){
  config.test.include=['src/services/appSubscription/__tests__/paymentService.coverage.realpg.cover.mjs'];
  config.test.exclude=[];
}
export default config;
