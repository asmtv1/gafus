/** Exact disposable PostgreSQL acceptance: never load under the default unit config. */
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";
const name = process.env.GAFUS_ARCHQA_DB_NAME ?? "";
let acceptable=false;
try {
  const target=new URL(process.env.DATABASE_URL ?? "");
  acceptable=process.env.GAFUS_ARCHQA_REALPG==="1" &&
    /^archqa_schema_[a-f0-9]{12}$/.test(name) && target.pathname===`/${name}` &&
    target.protocol==="postgresql:" && target.hostname==="127.0.0.1" && target.username==="qapayment" &&
    Number(target.port)>10000;
} catch { /* denied by default */ }
if (!acceptable) throw Error("ARCHQA_PAYMENT_REALPG_DISPOSABLE_DATABASE_REQUIRED");
const config=mergeConfig(base,defineConfig({test:{include:["src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts"],fileParallelism:false}}));
if(config.test) {
  config.test.include=["src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts"];
  config.test.exclude=[];
}
export default config;
