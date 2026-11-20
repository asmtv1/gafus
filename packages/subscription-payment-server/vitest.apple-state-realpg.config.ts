import { defineConfig } from "vitest/config";
const name=process.env.GAFUS_ARCHQA_DB_NAME ?? "";
let allowed=false;
try {
  const url=new URL(process.env.DATABASE_URL ?? "");
  allowed=process.env.GAFUS_ARCHQA_REALPG==="1" &&
    /^archqa_schema_[a-f0-9]{12}$/.test(name) && url.pathname===`/${name}` &&
    url.hostname==="127.0.0.1" && url.username==="qapayment" &&
    Number(url.port)>10000;
} catch { /* denied by default */ }
if(!allowed) throw Error("APPLE_STATE_DISPOSABLE_DATABASE_REQUIRED");
export default defineConfig({test:{include:["src/appleSubscriptionState.realpg.test.ts","src/subscriptionTransitions.realpg.test.ts"],environment:"node",fileParallelism:false}});
