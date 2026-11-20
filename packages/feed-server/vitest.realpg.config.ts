import { defineConfig } from "vitest/config";
let valid=false;
try{
  const u=new URL(process.env.DATABASE_URL??"");
  valid=process.env.GAFUS_FEED_QA==="1" && u.hostname==="127.0.0.1" &&
    u.username==="qafeed" && u.protocol==="postgresql:" && Number(u.port)>10000 &&
    /^\/feed_parity_[a-f0-9]{12}$/.test(u.pathname) &&
    process.env.GAFUS_FEED_QA_DB_NAME===u.pathname.slice(1);
}catch{/* fail closed */}
if(!valid)throw Error("FEED_DISPOSABLE_POSTGRES_REQUIRED");
export default defineConfig({test:{environment:"node",fileParallelism:false,include:["src/chronologicalRows.realpg.test.ts","src/smartPreferencesRows.realpg.test.ts"]}});
