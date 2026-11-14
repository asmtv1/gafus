#!/usr/bin/env node
/** Safe administrative 30-day OTA telemetry retention (not invoked by API GET). */
import { prisma } from "@gafus/prisma";
import { pruneOtaTelemetry } from "../dist/telemetry.js";

async function main(){
  const options=process.argv.slice(2);
  if(options.length!==1 || !["--dry-run","--execute"].includes(options[0]))
    throw Error("USAGE: prune-telemetry.mjs --dry-run|--execute");
  const url=process.env.DATABASE_URL;
  if(!url)throw Error("NO_DATABASE_CONFIGURED");
  const target=new URL(url);
  if(!["postgresql:","postgres:"].includes(target.protocol))throw Error("INVALID_DATABASE");
  const isLocal=["127.0.0.1","localhost"].includes(target.hostname) &&
    target.pathname.startsWith("/gafus_ota_");
  if(options[0]==="--execute" &&
    !(isLocal && process.env.GAFUS_OTA_TEST_ISOLATED==="1") &&
    !(process.env.MOBILE_OTA_MAINTENANCE_APPROVED==="true" && process.env.CI==="true"))
    throw Error("TELEMETRY_RETENTION_REQUIRES_EXPLICIT_PROTECTED_APPROVAL");
  try {
    const before=await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS expired FROM "MobileOtaTelemetryEvent"
      WHERE "createdAt" < NOW()-INTERVAL '30 days'
    `;
    const expired=Number(before[0]?.expired??0n);
    if(options[0]==="--dry-run")console.log(JSON.stringify({action:"DRY_RUN",wouldDelete:expired}));
    else {const removed=await pruneOtaTelemetry();console.log(JSON.stringify({action:"PRUNED",removed}));}
  } finally {await prisma.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
