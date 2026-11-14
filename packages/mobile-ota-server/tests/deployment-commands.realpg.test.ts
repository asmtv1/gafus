/** Run with GAFUS_OTA_TEST_PG_URL pointing to isolated, migrated PostgreSQL only. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { listMobileOtaReleases } from "../src/queries";
import { mobileOtaManifestRepository } from "../src/repository";
import { registerSourcePatchDefinition, registerSourcePatchApplication } from "../src/patch-commands";
import { createMobileOtaDeployment, updateMobileOtaDeployment } from "../src/deployment-commands";
import { installationInOtaCohort } from "../src/rollout-policy";

const configured = process.env.GAFUS_OTA_TEST_PG_URL;
if (configured && process.env.DATABASE_URL !== configured) throw Error("OTA_TEST_DATABASE_MISMATCH");
const suite = configured ? describe : describe.skip;
const releaseIds = [randomUUID(),randomUUID(),randomUUID()];
const nativeId = randomUUID();
const deploymentId = randomUUID();
const appId = `ota-test-${randomUUID().slice(0, 12)}`;
const keyId = "preview-test";
const nativeFingerprint = "b".repeat(64);
const match = { appId, platform: "ios" as const, environment: "preview" as const,
  channel: "test", runtimeVersion: "1.7.5", keyId, nativeFingerprint };
const signature = `sig="AQIDBA==", keyid="${keyId}", alg="rsa-v1_5-sha256"`;
let revision = 1;

suite("signed OTA deployment on isolated REAL PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$executeRaw`
      INSERT INTO "MobileNativeRelease"
      (id, "appId", platform, environment, distribution, "bundleId", "appVersion", "buildNumber",
       "runtimeVersion", channel, "updateUrl", "signingKeyId", "certificateSha256", "nativeFingerprint", "sourceSha", verified)
      VALUES (${nativeId}::uuid, ${appId}, 'ios', 'preview', 'internal', 'ru.gafus.app',
        '1.7.5', '100', '1.7.5', 'test', 'https://gafus.test/ota/manifest', ${keyId},
        ${'a'.repeat(64)}, ${'b'.repeat(64)}, ${'c'.repeat(40)}, true)
    `;
    for (let i=0;i<3;i++) {
      const id = releaseIds[i];
      const body = Buffer.from(JSON.stringify({ id, runtimeVersion: "1.7.5", createdAt: new Date(2026, 10, 13+i).toISOString() }));
      await prisma.$executeRaw`
        INSERT INTO "MobileOtaRelease"
          (id, "nativeReleaseId", "appId", platform, environment, channel, "runtimeVersion",
           "sourceSha", revision, "updateId", "manifestBody", "signatureHeader", "signingKeyId", state, "createdAt")
        VALUES (${id}::uuid, ${nativeId}::uuid, ${appId}, 'ios', 'preview', 'test', '1.7.5',
          ${'c'.repeat(40)}, ${i+1}, ${id}::uuid, ${body}, ${signature}, ${keyId}, 'READY',
          ${new Date(2026,10,13+i)})
      `;
      await prisma.$executeRaw`
        INSERT INTO "MobileOtaArtifact"
          (id, "releaseId", "assetKey", "immutableUrl", sha256, "mimeType", "sizeBytes", verified)
        VALUES (${randomUUID()}::uuid, ${id}::uuid, 'bundle', 'https://cdn.test/bundle',
          ${'f'.repeat(64)}, 'application/javascript', 100, true)
      `;
    }
    await prisma.$executeRaw`
      INSERT INTO "MobileOtaDeployment"
        (id, "appId", platform, environment, channel, "runtimeVersion", "signingKeyId", "nativeFingerprint",
          "rowVersion", paused, "rolloutPercent", "updatedAt")
      VALUES (${deploymentId}::uuid, ${appId}, 'ios', 'preview', 'test', '1.7.5', ${keyId}, ${nativeFingerprint}, 1, true, 0, NOW())
    `;
  });
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "MobileOtaAuditEvent" WHERE "deploymentId"=${deploymentId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "MobileOtaDeployment" WHERE id=${deploymentId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "MobileOtaArtifact" WHERE "releaseId" IN (${releaseIds[0]}::uuid,${releaseIds[1]}::uuid,${releaseIds[2]}::uuid)`;
    await prisma.$executeRaw`DELETE FROM "MobileOtaRelease" WHERE "nativeReleaseId"=${nativeId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=${nativeId}::uuid`;
  });
  async function apply(action: "PUBLISH" | "PAUSE" | "ROLLOUT", input: Partial<Parameters<typeof updateMobileOtaDeployment>[0]> = {}) {
    return updateMobileOtaDeployment({
      deploymentId, actorId: "qa-admin", operationId: randomUUID(), expectedVersion: revision,
      reason: "QA isolated PostgreSQL verification", action, ...input,
    });
  }
  it("creates paused deployment for verified native with idempotent and conflict-safe SQL", async () => {
    const independentNativeId = randomUUID();
    const operationId = `qa-create-${randomUUID()}`;
    const reason = "Verified physical preview binary";
    let createdId: string | null = null;
    await prisma.$executeRaw`
      INSERT INTO "MobileNativeRelease"
      (id, "appId", platform, environment, distribution, "bundleId", "appVersion", "buildNumber",
       "runtimeVersion", channel, "updateUrl", "signingKeyId", "certificateSha256", "nativeFingerprint", "sourceSha", verified)
      VALUES (${independentNativeId}::uuid, ${appId}, 'ios', 'preview', 'internal', 'ru.gafus.app',
        '1.7.5', '101', '1.7.5', 'newchannel', 'https://preview.gafus.test/ota/manifest', ${keyId},
        ${'a'.repeat(64)}, ${'b'.repeat(64)}, ${'c'.repeat(40)}, true)
    `;
    try {
      const created=await createMobileOtaDeployment({
        nativeReleaseId:independentNativeId, actorId:"qa-admin", operationId, reason,
      });
      createdId=created.id;
      expect(created).toMatchObject({version:1,paused:true,replayed:false});
      const row=await prisma.$queryRaw<{paused:boolean;rolloutPercent:number;activeReleaseId:string|null}[]>`
        SELECT paused, "rolloutPercent", "activeReleaseId" FROM "MobileOtaDeployment" WHERE id=${created.id}::uuid
      `;
      expect(row[0]).toEqual({paused:true,rolloutPercent:0,activeReleaseId:null});
      const repeated=await createMobileOtaDeployment({
        nativeReleaseId:independentNativeId, actorId:"qa-admin", operationId, reason,
      });
      expect(repeated).toMatchObject({id:created.id,replayed:true});
      await expect(createMobileOtaDeployment({
        nativeReleaseId:independentNativeId, actorId:"qa-admin", operationId:randomUUID(), reason,
      })).rejects.toMatchObject({code:"DEPLOYMENT_ALREADY_EXISTS"});
      await expect(createMobileOtaDeployment({
        nativeReleaseId:independentNativeId, actorId:"other-admin", operationId, reason,
      })).rejects.toMatchObject({code:"OPERATION_CONFLICT"});
    } finally {
      if (createdId) {
        await prisma.$executeRaw`DELETE FROM "MobileOtaAuditEvent" WHERE "deploymentId"=${createdId}::uuid`;
        await prisma.$executeRaw`DELETE FROM "MobileOtaDeployment" WHERE id=${createdId}::uuid`;
      }
      await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=${independentNativeId}::uuid`;
    }
  });
  it("records a private source patch and DRAFT-only application with idempotent SQL", async () => {
    const patchHash=randomUUID().replaceAll("-","").repeat(2);
    const definition={
      operationId:`qa-define-${randomUUID()}`,version:"1.0.0",sha256:patchHash,
      allowedBases:["c".repeat(40)],
      allowedPaths:["apps/mobile/src/features/app-subscription/lib/appleAppSubscriptionPurchase.ts"],
      nativeRequirements:{
        publication:"NEW_NATIVE_BUILD_AND_APP_REVIEW" as const,
        targetPlatform:"ios" as const,minimumVersion:"1.7.5",otaCompatible:false as const,
      },
      sourceLocation:`private://mobile-patches/${patchHash}.patch`,
    };
    let id:string|null=null;
    try {
      const patch=await registerSourcePatchDefinition(definition,"qa-admin");
      id=patch.id;
      expect(patch).toMatchObject({replayed:false,state:"PRIVATE_SOURCE_ONLY"});
      const duplicate=await registerSourcePatchDefinition(definition,"qa-admin");
      expect(duplicate).toMatchObject({id,replayed:true});
      await expect(registerSourcePatchDefinition({...definition,operationId:randomUUID()},"qa-admin"))
        .rejects.toMatchObject({code:"SOURCE_PATCH_OPERATION_CONFLICT"});
      await expect(registerSourcePatchDefinition({
        ...definition,sha256:"f".repeat(64),sourceLocation:"private://mobile-patches/other.patch",
      },"qa-admin")).rejects.toMatchObject({code:"SOURCE_PATCH_OPERATION_CONFLICT"});
      const parallelDefinition={
        ...definition,operationId:`qa-define-${randomUUID()}`,sha256:"e".repeat(64),
        sourceLocation:"private://mobile-patches/parallel-source.patch",version:"1.0.1",
      };
      const submissions=await Promise.all(Array.from({length:3},()=>
        registerSourcePatchDefinition(parallelDefinition,"qa-admin")));
      expect(new Set(submissions.map(item=>item.id)).size).toBe(1);
      expect(submissions.filter(item=>item.replayed===false)).toHaveLength(1);
      await prisma.$executeRaw`
        DELETE FROM "MobilePatchDefinition" WHERE id=${submissions[0].id}::uuid
      `;
      const applyInput={patchDefinitionId:patch.id,nativeReleaseId:nativeId,
        baseSha:"c".repeat(40),operationId:`qa-apply-${randomUUID()}`};
      const application=await registerSourcePatchApplication(applyInput,"qa-admin");
      expect(application).toMatchObject({state:"DRAFT",replayed:false});
      const same=await registerSourcePatchApplication(applyInput,"qa-admin");
      expect(same).toMatchObject({id:application.id,replayed:true});
      await expect(registerSourcePatchApplication({...applyInput,baseSha:"d".repeat(40),operationId:randomUUID()},"qa-admin"))
        .rejects.toMatchObject({code:"SOURCE_PATCH_NOT_APPLICABLE"});
      const state=await prisma.$queryRaw<{state:string;resultSha:string|null}[]>`
        SELECT state,"resultSha" FROM "MobilePatchApplication" WHERE id=${application.id}::uuid
      `;
      expect(state[0]).toEqual({state:"DRAFT",resultSha:null});
    } finally {
      if(id) {
        await prisma.$executeRaw`DELETE FROM "MobilePatchApplication" WHERE "patchDefinitionId"=${id}::uuid`;
        await prisma.$executeRaw`DELETE FROM "MobilePatchDefinition" WHERE id=${id}::uuid`;
      }
    }
  });
  it("admin release summaries carry the exact native fingerprint used for safe selection", async () => {
    const summaries=await listMobileOtaReleases() as Array<{
      id:string;nativeFingerprint:string;assetCount:number;assetsVerified:boolean;
    }>;
    const own=summaries.find(row=>row.id===releaseIds[0]);
    expect(own).toMatchObject({
      nativeFingerprint,assetCount:1,assetsVerified:true,
    });
  });
  it("no update is returned before explicitly verified publication", async () => {
    expect(await mobileOtaManifestRepository.findPublishedManifest(match)).toBeNull();
  });
  it("rejects a publication with a wrong runtime and leaves current pointer intact", async () => {
    await expect(apply("PUBLISH", { releaseId: randomUUID() })).rejects.toMatchObject({ code: "UNVERIFIED_RELEASE" });
    expect(await mobileOtaManifestRepository.findPublishedManifest(match)).toBeNull();
  });
  it("publishes a verified matching release atomically and idempotently", async () => {
    const operationId = randomUUID();
    const first = await apply("PUBLISH", { releaseId: releaseIds[0], operationId });
    expect(first).toMatchObject({ paused: false, replayed: false, version: 2 });
    revision = first.version;
    const repeated = await apply("PUBLISH", { releaseId: releaseIds[0], operationId, expectedVersion: 1 });
    expect(repeated).toMatchObject({ replayed: true, version: 2 });
    await expect(apply("PAUSE", { operationId, expectedVersion: 1 })).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
    const update = await mobileOtaManifestRepository.findPublishedManifest(match);
    expect(update?.updateId).toBe(releaseIds[0]);
    expect(update?.manifestBody.byteLength).toBeGreaterThan(0);
    expect(await mobileOtaManifestRepository.findPublishedManifest({ ...match, runtimeVersion: "1.7.6" })).toBeNull();
    expect(await mobileOtaManifestRepository.findPublishedManifest({ ...match, keyId: "wrong" })).toBeNull();
    expect(await mobileOtaManifestRepository.findPublishedManifest({ ...match, nativeFingerprint: "0".repeat(64) })).toBeNull();
  });
  it("revoking native trust immediately disables OTA manifest delivery without losing history", async () => {
    expect((await mobileOtaManifestRepository.findPublishedManifest(match))?.updateId).toBe(releaseIds[0]);
    await prisma.$executeRaw`
      UPDATE "MobileNativeRelease" SET verified=false WHERE id=${nativeId}::uuid
    `;
    try {
      expect(await mobileOtaManifestRepository.findPublishedManifest(match)).toBeNull();
    } finally {
      await prisma.$executeRaw`
        UPDATE "MobileNativeRelease" SET verified=true WHERE id=${nativeId}::uuid
      `;
    }
    expect((await mobileOtaManifestRepository.findPublishedManifest(match))?.updateId).toBe(releaseIds[0]);
  });
  it("same runtime/key but a different native fingerprint serves a disjoint update", async () => {
    const otherNative = randomUUID();
    const otherUpdate = randomUUID();
    const otherFingerprint = "d".repeat(64);
    let otherDeployment: string | null = null;
    await prisma.$executeRaw`
      INSERT INTO "MobileNativeRelease"
      (id, "appId", platform, environment, distribution, "bundleId", "appVersion", "buildNumber",
       "runtimeVersion", channel, "updateUrl", "signingKeyId", "certificateSha256", "nativeFingerprint", "sourceSha", verified)
      VALUES (${otherNative}::uuid, ${appId}, 'ios', 'preview', 'internal', 'ru.gafus.app',
        '1.7.5', '102', '1.7.5', 'test', 'https://preview.gafus.test/ota/manifest', ${keyId},
        ${'a'.repeat(64)}, ${otherFingerprint}, ${'c'.repeat(40)}, true)
    `;
    try {
      const manifest = Buffer.from(JSON.stringify({
        id:otherUpdate,createdAt:"2026-11-20T00:00:00.000Z",runtimeVersion:"1.7.5",
      }));
      await prisma.$executeRaw`
        INSERT INTO "MobileOtaRelease"
        (id,"nativeReleaseId","appId",platform,environment,channel,"runtimeVersion",
         "sourceSha",revision,"updateId","manifestBody","signatureHeader","signingKeyId",state,"createdAt")
        VALUES (${otherUpdate}::uuid,${otherNative}::uuid,${appId},'ios','preview','test','1.7.5',
          ${'c'.repeat(40)},4,${otherUpdate}::uuid,${manifest},${signature},${keyId},'READY',
          ${new Date("2026-11-20T00:00:00.000Z")})
      `;
      await prisma.$executeRaw`
        INSERT INTO "MobileOtaArtifact"
         (id,"releaseId","assetKey","immutableUrl",sha256,"mimeType","sizeBytes",verified)
        VALUES (${randomUUID()}::uuid,${otherUpdate}::uuid,'bundle','https://cdn.test/bundle2',
          ${'f'.repeat(64)},'application/javascript',200,true)
      `;
      const deployment=await createMobileOtaDeployment({
        nativeReleaseId:otherNative,actorId:"qa-admin",operationId:randomUUID(),
        reason:"Compatible native fingerprint isolation QA",
      });
      otherDeployment=deployment.id;
      await updateMobileOtaDeployment({
        deploymentId:deployment.id,actorId:"qa-admin",operationId:randomUUID(),
        expectedVersion:1,reason:"Publish independently verified binary",action:"PUBLISH",releaseId:otherUpdate,
      });
      const old=await mobileOtaManifestRepository.findPublishedManifest(match);
      const other=await mobileOtaManifestRepository.findPublishedManifest({...match,nativeFingerprint:otherFingerprint});
      expect(old?.updateId).toBe(releaseIds[0]);
      expect(other?.updateId).toBe(otherUpdate);
      expect(await mobileOtaManifestRepository.findPublishedManifest({...match,nativeFingerprint:"0".repeat(64)}))
        .toBeNull();
    } finally {
      if(otherDeployment) {
        await prisma.$executeRaw`DELETE FROM "MobileOtaAuditEvent" WHERE "deploymentId"=${otherDeployment}::uuid`;
        await prisma.$executeRaw`DELETE FROM "MobileOtaDeployment" WHERE id=${otherDeployment}::uuid`;
      }
      await prisma.$executeRaw`DELETE FROM "MobileOtaArtifact" WHERE "releaseId"=${otherUpdate}::uuid`;
      await prisma.$executeRaw`DELETE FROM "MobileOtaRelease" WHERE id=${otherUpdate}::uuid`;
      await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=${otherNative}::uuid`;
    }
  });
  it("parallel CAS publish resolves to exactly one verified result", async () => {
    const results = await Promise.allSettled([
      apply("PUBLISH", { releaseId: releaseIds[1] }),
      apply("PUBLISH", { releaseId: releaseIds[2] }),
    ]);
    const success = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(success).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({ code: "STALE_VERSION" });
    revision = (success[0] as PromiseFulfilledResult<{version:number}>).value.version;
  });
  it("stages 1% to 10% to 50% to 100% without moving existing installations backwards", async () => {
    const nextId = randomUUID();
    const date = new Date("2026-11-30T00:00:00.000Z");
    const bundle = Buffer.from(JSON.stringify({id:nextId,createdAt:date.toISOString(),runtimeVersion:"1.7.5"}));
    const last=await prisma.$queryRaw<{activeReleaseId:string}[]>`
      SELECT "activeReleaseId" FROM "MobileOtaDeployment" WHERE id=${deploymentId}::uuid
    `;
    const previous=last[0].activeReleaseId;
    const identities = Array.from({length:10000},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,"0")}`);
    const inCohort=identities.find(id=>installationInOtaCohort(deploymentId,id,1));
    const outside=identities.find(id=>!installationInOtaCohort(deploymentId,id,50));
    expect(inCohort).toBeTruthy();expect(outside).toBeTruthy();
    await prisma.$executeRaw`
      INSERT INTO "MobileOtaRelease"
        (id,"nativeReleaseId","appId",platform,environment,channel,"runtimeVersion",
         "sourceSha",revision,"updateId","manifestBody","signatureHeader","signingKeyId",state,"createdAt")
      VALUES (${nextId}::uuid,${nativeId}::uuid,${appId},'ios','preview','test','1.7.5',
        ${'c'.repeat(40)},15,${nextId}::uuid,${bundle},${signature},${keyId},'READY',${date})
    `;
    await prisma.$executeRaw`
      INSERT INTO "MobileOtaArtifact"
        (id,"releaseId","assetKey","immutableUrl",sha256,"mimeType","sizeBytes",verified)
      VALUES (${randomUUID()}::uuid,${nextId}::uuid,'bundle','https://cdn.test/new-immutable',
        ${'f'.repeat(64)},'application/javascript',100,true)
    `;
    try {
      const published=await apply("PUBLISH",{releaseId:nextId,rolloutPercent:1});
      revision=published.version;
      expect((await mobileOtaManifestRepository.findPublishedManifest({...match,installationId:inCohort}))?.updateId).toBe(nextId);
      expect((await mobileOtaManifestRepository.findPublishedManifest({...match,installationId:outside}))?.updateId).toBe(previous);
      expect((await mobileOtaManifestRepository.findPublishedManifest(match))?.updateId).toBe(previous);
      await expect(apply("ROLLOUT",{rolloutPercent:1})).rejects.toMatchObject({code:"ROLLOUT_MUST_INCREASE"});
      await expect(apply("ROLLOUT",{rolloutPercent:5})).rejects.toMatchObject({code:"INVALID_ROLLOUT"});
      for(const percent of [10,50,100]) {
        const changed=await apply("ROLLOUT",{rolloutPercent:percent});
        revision=changed.version;
        expect((await mobileOtaManifestRepository.findPublishedManifest({...match,installationId:inCohort}))?.updateId).toBe(nextId);
      }
      expect((await mobileOtaManifestRepository.findPublishedManifest({...match,installationId:outside}))?.updateId).toBe(nextId);
      expect((await mobileOtaManifestRepository.findPublishedManifest(match))?.updateId).toBe(nextId);
      await expect(apply("ROLLOUT",{rolloutPercent:50})).rejects.toMatchObject({code:"ROLLOUT_MUST_INCREASE"});
    } finally {
      await prisma.$executeRaw`DELETE FROM "MobileOtaArtifact" WHERE "releaseId"=${nextId}::uuid`;
      // If the release is active, remove the pointer before removing the test record.
      await prisma.$executeRaw`
        UPDATE "MobileOtaDeployment" SET "activeReleaseId"=${previous}::uuid, "previousReleaseId"=${releaseIds[0]}::uuid
        WHERE id=${deploymentId}::uuid
      `;
      await prisma.$executeRaw`DELETE FROM "MobileOtaRelease" WHERE id=${nextId}::uuid`;
    }
  });
  it("pauses without removing the last known good release", async () => {
    const paused = await apply("PAUSE");
    revision = paused.version;
    expect(paused.paused).toBe(true);
    expect(await mobileOtaManifestRepository.findPublishedManifest(match)).toBeNull();
  });
  it("blocks re-serving an older update as rollback", async () => {
    await expect(apply("PUBLISH", { releaseId: releaseIds[0] })).rejects.toMatchObject({
      code: "ROLLBACK_REQUIRES_NEW_UPDATE",
    });
  });
});
