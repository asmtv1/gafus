import { defineConfig } from "vitest/config";
let safe=false;
try{const u=new URL(process.env.DATABASE_URL??"");safe=
  process.env.GAFUS_CHAT2_REALPG==="1" && u.protocol==="postgresql:" &&
  u.hostname==="127.0.0.1" && u.username==="qachat" && Number(u.port)>10000 &&
  /^\/chat2_delivery_[a-f0-9]{12}$/.test(u.pathname) &&
  process.env.GAFUS_CHAT2_DB_NAME===u.pathname.slice(1);
}catch{/* deny by default */}
if(!safe)throw Error("CHAT2_REALPG_DISPOSABLE_DATABASE_REQUIRED");
export default defineConfig({test:{environment:"node",fileParallelism:false,
  include:["scripts/qa/chat2-send.realpg.test.ts"]}});
