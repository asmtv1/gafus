import { defineConfig } from "vitest/config";
const actual=process.env.DATABASE_URL ?? "";
const existing=/^postgresql:\/\/asmtv1@127\.0\.0\.1:55673\/gafus_ota_preview_qa\?schema=public$/;
const disposable=(() => {
  try {
    const u=new URL(actual);
    return u.protocol==="postgresql:" && u.hostname==="127.0.0.1" &&
      u.username==="qaota" && Number(u.port)>10000 &&
      /^\/gafus_ota_isolated_[a-f0-9]{12}$/.test(u.pathname) &&
      u.searchParams.get("schema")==="public" && [...u.searchParams.keys()].length===1;
  } catch { return false; }
})();
if(process.env.GAFUS_OTA_TEST_ISOLATED!=="1" ||
   process.env.GAFUS_OTA_TEST_PG_URL!==actual ||
   !(existing.test(actual)||disposable)) throw Error("OTA_ISOLATED_QA_DATABASE_REQUIRED");
export default defineConfig({test:{environment:"node",fileParallelism:false,include:["tests/**/*.realpg.test.ts"]}});
