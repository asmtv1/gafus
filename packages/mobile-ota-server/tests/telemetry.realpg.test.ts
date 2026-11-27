/** Isolated QA only: verifies pseudonymization and report boundaries on real PG. */
import { randomUUID } from "node:crypto";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {prisma} from "@gafus/prisma";
import {ingestOtaTelemetry,hashInstallationForTelemetry,listOtaTelemetrySummaries,
  otaTelemetrySchema,pruneOtaTelemetry} from "../src/telemetry";
const enabled=!!process.env.GAFUS_OTA_TEST_PG_URL &&
  process.env.GAFUS_OTA_TEST_PG_URL===process.env.DATABASE_URL;
const suite=enabled?describe:describe.skip;
const nativeId=randomUUID(),installationId=randomUUID(),eventId=randomUUID();
const nativeFingerprint="a".repeat(64),sourceSha="b".repeat(40);
const secret="synthetic-local-telemetry-secret-not-for-real-releases";
const appId=`gafus-telemetry-qa-${randomUUID().slice(0,8)}`;
const base=otaTelemetrySchema.parse({eventId,installationId,platform:"ios",channel:"preview",
  runtimeVersion:"1.7.5",nativeFingerprint,event:"LAUNCHED"});
suite("local PostgreSQL client-reported OTA telemetry",()=>{
  beforeAll(async()=>{
    await prisma.$executeRaw`
      INSERT INTO "MobileNativeRelease"
      (id,"appId",platform,environment,distribution,"bundleId","appVersion","buildNumber",
       "runtimeVersion",channel,"updateUrl","signingKeyId","certificateSha256",
       "nativeFingerprint","sourceSha",verified)
      VALUES (${nativeId}::uuid,'gafus','ios','preview','internal','ru.gafus.app',
        '1.7.5',${appId},'1.7.5','preview','https://preview.gafus.test/ota/manifest',
        'qa-signer',${'f'.repeat(64)},${nativeFingerprint},${sourceSha},true)
    `;
  });
  afterAll(async()=>{
    await prisma.$executeRaw`
      DELETE FROM "MobileOtaTelemetryEvent" WHERE "installationHash"=${hashInstallationForTelemetry(installationId,secret)}
    `;
    await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=${nativeId}::uuid`;
  });
  it("stores only secret-keyed installation HMAC and dedupes event IDs",async()=>{
    const first=await ingestOtaTelemetry(base,"preview",secret);
    expect(first).toEqual({accepted:true,replayed:false});
    const same=await ingestOtaTelemetry(base,"preview",secret);
    expect(same).toEqual({accepted:true,replayed:true});
    const records=await prisma.$queryRaw<{installationHash:string;event:string}[]>`
      SELECT "installationHash",event FROM "MobileOtaTelemetryEvent" WHERE "eventId"=${eventId}::uuid
    `;
    expect(records).toEqual([{installationHash:hashInstallationForTelemetry(installationId,secret),event:"LAUNCHED"}]);
    expect(records[0].installationHash).not.toBe(installationId);
    expect(hashInstallationForTelemetry(installationId,secret+'-different')).not.toBe(records[0].installationHash);
  });
  it("rejects conflicting reuse, disabled secret, untrusted binaries or wrong environment",async()=>{
    await expect(ingestOtaTelemetry({...base,event:"CHECKED"},"preview",secret))
      .rejects.toMatchObject({code:"TELEMETRY_EVENT_CONFLICT"});
    await expect(ingestOtaTelemetry(base,"production",secret))
      .rejects.toMatchObject({code:"UNVERIFIED_NATIVE_TELEMETRY"});
    await expect(ingestOtaTelemetry(base,"preview","short"))
      .rejects.toMatchObject({code:"TELEMETRY_DISABLED"});
    await expect(ingestOtaTelemetry({...base,eventId:randomUUID(),nativeFingerprint:"0".repeat(64)},"preview",secret))
      .rejects.toMatchObject({code:"UNVERIFIED_NATIVE_TELEMETRY"});
    await expect(ingestOtaTelemetry({...base,eventId:randomUUID(),updateId:randomUUID()},"preview",secret))
      .rejects.toMatchObject({code:"UNVERIFIED_NATIVE_TELEMETRY"});
  });
  it("serializes simultaneous exact replays and conflicting payloads",async()=>{
    const event = {...base,eventId:randomUUID()};
    const results=await Promise.all([ingestOtaTelemetry(event,"preview",secret),
      ingestOtaTelemetry(event,"preview",secret)]);
    expect(results.map(x=>x.replayed).sort()).toEqual([false,true]);
    const sharedId=randomUUID();
    const conflicting=await Promise.allSettled([
      ingestOtaTelemetry({...base,eventId:sharedId,event:"LAUNCHED"},"preview",secret),
      ingestOtaTelemetry({...base,eventId:sharedId,event:"CHECKED"},"preview",secret),
    ]);
    expect(conflicting.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(conflicting.find(x=>x.status==="rejected")).toMatchObject({
      reason:{code:"TELEMETRY_EVENT_CONFLICT"},
    });
  });
  it("does not exceed the per-installation quota during concurrent writes",async()=>{
    const quotaInstallation=randomUUID();
    const hash=hashInstallationForTelemetry(quotaInstallation,secret);
    try {
      await prisma.$executeRaw`
        INSERT INTO "MobileOtaTelemetryEvent"
          (id,"eventId","installationHash",platform,environment,channel,"runtimeVersion","nativeFingerprint",event)
        SELECT gen_random_uuid(),gen_random_uuid(),${hash},'ios','preview','preview','1.7.5',
          ${nativeFingerprint},'CHECKED' FROM generate_series(1,149)
      `;
      const results=await Promise.allSettled(Array.from({length:4},()=>ingestOtaTelemetry({
        ...base,installationId:quotaInstallation,eventId:randomUUID(),
      },"preview",secret)));
      expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      expect(results.filter(x=>x.status==="rejected")).toHaveLength(3);
      for(const result of results)if(result.status==="rejected")
        expect(result.reason).toMatchObject({code:"TELEMETRY_QUOTA_EXCEEDED"});
    } finally {
      await prisma.$executeRaw`DELETE FROM "MobileOtaTelemetryEvent" WHERE "installationHash"=${hash}`;
    }
  });
  it("provides a bounded client-reported summary, no raw UUID or user data",async()=>{
    const summaries=await listOtaTelemetrySummaries() as Array<{
      platform:string;runtimeVersion:string;event:string;events:number;installations:number;
    }>;
    expect(summaries.some(row=>row.platform==="ios" && row.runtimeVersion==="1.7.5" &&
      row.event==="LAUNCHED" && row.events>=1 && row.installations>=1)).toBe(true);
  });
  it("keeps local event storage bounded per installation",async()=>{
    const hash=hashInstallationForTelemetry(installationId,secret);
    // Dedicated, disposable QA database. Each seeded row is pseudonymous.
    await prisma.$executeRaw`
      INSERT INTO "MobileOtaTelemetryEvent"
        (id,"eventId","installationHash",platform,environment,channel,"runtimeVersion",
         "nativeFingerprint",event)
      SELECT gen_random_uuid(),gen_random_uuid(),${hash},'ios','preview','preview','1.7.5',
        ${nativeFingerprint},'CHECKED' FROM generate_series(1,150)
    `;
    await expect(ingestOtaTelemetry({...base,eventId:randomUUID()},"preview",secret))
      .rejects.toMatchObject({code:"TELEMETRY_QUOTA_EXCEEDED"});
  });
  it("deletes only expired events and preserves fresh reports",async()=>{
    const oldId=randomUUID();
    const hash=hashInstallationForTelemetry(installationId,secret);
    await prisma.$executeRaw`
      INSERT INTO "MobileOtaTelemetryEvent"
        (id,"eventId","installationHash",platform,environment,channel,"runtimeVersion",
         "nativeFingerprint",event,"createdAt")
      VALUES (${randomUUID()}::uuid,${oldId}::uuid,${hash},'ios','preview','preview','1.7.5',
        ${nativeFingerprint},'CHECKED',NOW()-INTERVAL '31 days')
    `;
    const removed=await pruneOtaTelemetry();
    expect(removed).toBeGreaterThanOrEqual(1);
    const old=await prisma.$queryRaw<{id:string}[]>`
      SELECT id FROM "MobileOtaTelemetryEvent" WHERE "eventId"=${oldId}::uuid
    `;
    expect(old).toHaveLength(0);
    const present=await prisma.$queryRaw<{id:string}[]>`
      SELECT id FROM "MobileOtaTelemetryEvent" WHERE "eventId"=${eventId}::uuid
    `;
    expect(present).toHaveLength(1);
  });
});
