import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  previewVersionPublication,
  publishVersionUpdate,
  type PublishInput,
  type VersionScope,
} from "../src/version-publication";
import { allowsAndroidQaCheckout, allowsVersionCheckout, selectVersionUpdate } from "../src/version-selection";
import { mobileOtaManifestRepository } from "../src/repository";

const suite = process.env.GAFUS_OTA_TEST_ISOLATED === "1" ? describe : describe.skip;
const ios: VersionScope = { platform: "ios", runtimeVersion: "1.7.5" };
const android: VersionScope = { platform: "android", runtimeVersion: "1.7.6" };
const actor = randomUUID(),
  keyId = "version-test",
  installation = randomUUID();
const natives: string[] = [],
  releases: string[] = [],
  users: string[] = [];
const fp = "a".repeat(64);
async function native(s: VersionScope, build: string, fingerprint: string, verified = true) {
  const id = randomUUID(),
    embedded = randomUUID();
  await prisma.$executeRaw`INSERT INTO "MobileNativeRelease" (id,"appId",platform,environment,distribution,"bundleId",
    "appVersion","buildNumber","runtimeVersion",channel,"updateUrl","signingKeyId","certificateSha256","nativeFingerprint",
    "sourceSha",verified,"embeddedUpdateId") VALUES (${id}::uuid,'gafus',${s.platform},'production','internal','ru.gafus.app',
    ${s.runtimeVersion},${build},${s.runtimeVersion},'production','https://gafus.ru/ota/manifest',${keyId},
    ${"a".repeat(64)},${fingerprint},${"b".repeat(40)},${verified},${embedded}::uuid)`;
  natives.push(id);
  return {
    ...s,
    id,
    embeddedUpdateId: embedded,
    nativeFingerprint: fingerprint,
    keyId,
    installationId: installation,
  };
}
async function release(
  n: Awaited<ReturnType<typeof native>>,
  rev: number,
  checkout: boolean,
  recoveryFor: number | null = null,
) {
  const id = randomUUID(),
    update = randomUUID(),
    title = recoveryFor ? "Безопасное обновление" : "Тестовое обновление";
  releases.push(id);
  await prisma.$executeRaw`INSERT INTO "MobileOtaRelease" (id,"nativeReleaseId","appId",platform,environment,channel,
    "runtimeVersion","sourceSha",revision,"updateId","manifestBody","signatureHeader","signingKeyId",state,"releaseTitle",
    "allowsCheckout","recoveryFor","signingExpiresAt","createdAt") VALUES (${id}::uuid,${n.id}::uuid,'gafus',${n.platform},'production',
    'production',${n.runtimeVersion},${n.id.replaceAll("-", "").padEnd(40, "0")},${rev},${update}::uuid,${Buffer.from(update)},
    'test signature',${keyId},'READY',${title},${checkout},${recoveryFor},now()+interval '1 day',${new Date(1800000000000 + rev * 1000)})`;
  await prisma.$executeRaw`INSERT INTO "MobileOtaArtifact"(id,"releaseId","assetKey","immutableUrl",sha256,"mimeType","sizeBytes",verified)
    VALUES (${randomUUID()}::uuid,${id}::uuid,'bundle','https://example.test/bundle',${"d".repeat(64)},'application/javascript',100,true)`;
  return update;
}
async function command(scope: VersionScope, action: PublishInput["action"]) {
  const p = await previewVersionPublication(scope);
  return {
    ...scope,
    action,
    key: action === "MANDATORY" ? (p.active?.key ?? null) :
      (p.choices.find((c) => c.recoveryFor === null)?.key ?? null),
    token: p.token,
    required: action === "MANDATORY",
    operationId: randomUUID(),
    actorId: actor,
  };
}
const manifest = (c: Awaited<ReturnType<typeof native>>, testerAllowed = false) =>
  mobileOtaManifestRepository.findPublishedManifest({
    ...c,
    appId: "gafus",
    environment: "production",
    channel: "production",
    testerAllowed,
  });
suite("version-scoped OTA lifecycle", () => {
  beforeAll(async () => {
    const scopes = await prisma.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM "MobileNativeRelease" WHERE
      "appId"='gafus' AND environment='production' AND (platform='ios' AND "runtimeVersion" IN ('1.7.5','1.7.6') OR platform='android' AND "runtimeVersion"='1.7.6')`;
    if (scopes[0].count) throw Error("VERSION_TEST_REQUIRES_EMPTY_TARGETS");
    vi.stubEnv(
      "MOBILE_OTA_INSTALLATION_HASH_KEY",
      "version-qa-test-only-secret-at-least-32-characters",
    );
    vi.stubEnv("MOBILE_OTA_DELIVERY_ENV", "production");
    vi.stubEnv("MOBILE_OTA_IOS_YOOKASSA_ENABLED", "true");
    vi.stubEnv("MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED", "false");
    vi.stubEnv("MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED", "false");
    vi.stubEnv("MOBILE_OTA_ANDROID_QA_YOOKASSA_ENABLED", "true");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$executeRaw`DELETE FROM "MobileOtaInstallationObservation" WHERE "nativeReleaseId"=ANY(${natives}::uuid[])`;
    await prisma.$executeRaw`DELETE FROM "MobileOtaPublication" WHERE "actorId"=${actor}`;
    await prisma.$executeRaw`DELETE FROM "MobileOtaArtifact" WHERE "releaseId"=ANY(${releases}::uuid[])`;
    await prisma.$executeRaw`DELETE FROM "MobileOtaRelease" WHERE id=ANY(${releases}::uuid[])`;
    await prisma.$executeRaw`DELETE FROM "MobileNativeRelease" WHERE id=ANY(${natives}::uuid[])`;
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });
  it("restricts Android card checkout to testers and revokes it before recovery", async () => {
    const scope: VersionScope = { platform: "android", runtimeVersion: "99.0.1" };
    const qa = await native(scope, "17509", fp);
    const store = await native(scope, "17510", "e".repeat(64));
    await prisma.$executeRaw`UPDATE "MobileNativeRelease" SET distribution='store' WHERE id=${store.id}::uuid`;
    const tester = await prisma.user.create({ data: { username: "asmtv1", password: "unused" } });
    const other = await prisma.user.create({ data: { username: "android-card-ordinary", password: "unused" } });
    users.push(tester.id, other.id);
    const update = await release(qa, 1, true);
    await publishVersionUpdate(await command(scope, "TEST"));
    await selectVersionUpdate({ ...qa, testerAllowed: true, currentUpdateId: update }, "manifest");
    expect(await allowsAndroidQaCheckout(tester.id, scope.runtimeVersion, installation, fp, update)).toBe(true);
    expect(await allowsAndroidQaCheckout(other.id, scope.runtimeVersion, installation, fp, update)).toBe(false);
    expect(await allowsAndroidQaCheckout(tester.id, ios.runtimeVersion, installation, fp, update)).toBe(false);
    expect(await allowsAndroidQaCheckout(tester.id, scope.runtimeVersion, installation, store.nativeFingerprint, update)).toBe(false);
    expect(await manifest(store, true)).toBeNull();
    expect(await manifest(qa)).toBeNull();
    await expect(publishVersionUpdate(await command(scope, "ALL"))).rejects.toThrow("только тестерам");
    await expect(publishVersionUpdate(await command(scope, "RECOVER"))).rejects.toThrow("остановлены");
    expect(await allowsAndroidQaCheckout(tester.id, scope.runtimeVersion, installation, fp, update)).toBe(false);
    const safe = await release(qa, 2, false, 1);
    await publishVersionUpdate(await command(scope, "RECOVER"));
    expect((await manifest(qa, true))?.updateId).toBe(safe);
    expect(await allowsAndroidQaCheckout(tester.id, scope.runtimeVersion, installation, fp, update)).toBe(false);
  });

  it("requires signed targets, separates mandatory from publication, and isolates runtimes", async () => {
    const a = await native(ios, "98", fp),
      b = await native(ios, "99", fp),
      c = await native(ios, "100", "c".repeat(64));
    const bad = await native(ios, "101", fp, false);
    const d = await native(android, "17506", fp);
    const admin = await prisma.user.create({ data: { username: "admin", password: "unused" } });
    users.push(admin.id);
    const ordinary = await prisma.user.create({
      data: { username: "qa-" + actor, password: "unused" },
    });
    users.push(ordinary.id);
    const first = await release(a, 1, true);
    const second = await release(b, 1, true);
    await expect(publishVersionUpdate(await command(ios, "TEST"))).rejects.toThrow("каждой");
    await release(c, 1, true);
    const standard = await release(d, 1, false);
    const iosNext = { platform: "ios", runtimeVersion: "1.7.6" } as const;
    const nextNative = await native(iosNext, "17601", fp);
    const nextUpdate = await release(nextNative, 1, true);
    await expect(publishVersionUpdate(await command(ios, "ALL"))).rejects.toThrow("подписанная и подтверждённая App Store-сборка");
    await expect(publishVersionUpdate(await command(ios, "MANDATORY"))).rejects.toThrow("Сначала");
    const test = await command(ios, "TEST");
    await expect(publishVersionUpdate({ ...test, required: true })).rejects.toThrow("отдельным");
    const [published, replayed] = await Promise.all([
      publishVersionUpdate(test), publishVersionUpdate(test),
    ]);
    expect(published).toEqual(replayed);
    const [row] = await prisma.$queryRaw<{count: bigint}[]>`SELECT count(*)::bigint AS count
      FROM "MobileOtaPublication" WHERE "operationId"=${test.operationId}::uuid`;
    expect(Number(row?.count ?? 0n)).toBe(1);
    const preview = await previewVersionPublication(ios);
    expect(preview.choices[0]).toMatchObject({ compatible: 3, excluded: 1, tested: true });
    for (const n of [a, b, c]) expect(await manifest(n, true)).toBeTruthy();
    expect(await manifest(bad, true)).toBeNull();
    expect(await manifest({ ...a, embeddedUpdateId: randomUUID() }, true)).toBeNull();
    expect(await manifest({ ...a, nativeFingerprint: "f".repeat(64) }, true)).toBeNull();
    expect(await manifest(a)).toBeNull();
    expect(await selectVersionUpdate(a, "policy", admin.id)).toMatchObject({ revision: 1, required: false });
    const mandatory = await command(ios, "MANDATORY");
    await prisma.$executeRaw`UPDATE "MobileOtaArtifact" SET verified=false
      WHERE "releaseId"=(SELECT id FROM "MobileOtaRelease" WHERE "updateId"=${second}::uuid)`;
    await expect(publishVersionUpdate(mandatory)).rejects.toThrow("изменился");
    await expect(publishVersionUpdate(await command(ios, "MANDATORY"))).rejects.toThrow("подписанными");
    await prisma.$executeRaw`UPDATE "MobileOtaArtifact" SET verified=true
      WHERE "releaseId"=(SELECT id FROM "MobileOtaRelease" WHERE "updateId"=${second}::uuid)`;
    await publishVersionUpdate(await command(ios, "MANDATORY"));
    expect(await selectVersionUpdate(a, "policy", admin.id)).toMatchObject({ revision: 1, required: true });
    await publishVersionUpdate({ ...(await command(ios, "MANDATORY")), required: false, key: null });
    expect(await selectVersionUpdate(a, "policy", admin.id)).toMatchObject({ required: false });
    expect(await selectVersionUpdate(a, "policy", ordinary.id)).toBeUndefined();
    await selectVersionUpdate({ ...a, testerAllowed: true, currentUpdateId: first }, "manifest");
    expect(await allowsVersionCheckout(admin.id, "1.7.5", installation, fp, first)).toBe(true);
    expect(await allowsVersionCheckout(ordinary.id, "1.7.5", installation, fp, first)).toBe(false);
    expect(await allowsVersionCheckout(admin.id, "1.7.5", randomUUID(), fp, first)).toBe(false);
    for (const target of [
      { ...a, runtimeVersion: "1.7.6" },
      { ...a, runtimeVersion: "1.7.7" },
      { ...a, platform: "android" as const },
    ])
      expect(await manifest(target, true)).toBeNull();
    await publishVersionUpdate(await command(android, "TEST"));
    expect(await manifest(d, true)).toBeTruthy();
    expect(await manifest({ ...d, runtimeVersion: "1.7.5" }, true)).toBeNull();
    await publishVersionUpdate(await command(android, "ALL"));
    expect((await manifest(d))?.updateId).toBe(standard);
    await expect(publishVersionUpdate(await command(ios, "ALL"))).rejects.toThrow("подписанная и подтверждённая App Store-сборка");
    await publishVersionUpdate(await command(iosNext, "TEST"));
    await selectVersionUpdate({ ...nextNative, testerAllowed: true, currentUpdateId: nextUpdate }, "manifest");
    expect(await allowsVersionCheckout(admin.id, "1.7.6", installation, fp, nextUpdate)).toBe(true);
    expect(await allowsVersionCheckout(admin.id, "1.7.6", installation, fp, first)).toBe(false);
    expect(await allowsVersionCheckout(admin.id, "1.7.5", installation, fp, nextUpdate)).toBe(false);
    await expect(publishVersionUpdate(await command(ios, "RECOVER"))).rejects.toThrow("остановлены");
    expect(await allowsVersionCheckout(admin.id, "1.7.5", installation, fp, first)).toBe(false);
    expect(await manifest(a, true)).toBeNull();
    const safe = await release(a, 2, false, 1);
    await release(b, 2, false, 1);
    await release(c, 2, false, 1);
    await publishVersionUpdate(await command(ios, "RECOVER"));
    expect((await manifest(a, true))?.updateId).toBe(safe);
    expect(await selectVersionUpdate(a, "policy", admin.id)).toMatchObject({
      revision: 2,
      required: false,
      allowsCheckout: false,
    });
    await publishVersionUpdate(await command(ios, "MANDATORY"));
    expect(await selectVersionUpdate(a, "policy", admin.id)).toMatchObject({ revision: 2, required: true });
    expect(await allowsVersionCheckout(admin.id, "1.7.6", installation, fp, nextUpdate)).toBe(true);
    expect(await manifest(d, true)).toBeTruthy();

    // Public App Store checkout requires the TEST stage and two separate kill-switches.
    await prisma.$executeRaw`UPDATE "MobileNativeRelease" SET distribution='app-store'
      WHERE id=ANY(${[a.id, b.id, c.id]}::uuid[])`;
    const publicUpdate = await release(a, 3, true);
    await release(b, 3, true);
    await release(c, 3, true);
    await publishVersionUpdate(await command(ios, "TEST"));
    await selectVersionUpdate({ ...a, testerAllowed: true, currentUpdateId: publicUpdate }, "manifest");
    expect(await allowsVersionCheckout(admin.id, "1.7.5", installation, fp, publicUpdate)).toBe(true);
    expect(await allowsVersionCheckout(ordinary.id, "1.7.5", installation, fp, publicUpdate)).toBe(false);
    await expect(publishVersionUpdate(await command(ios, "ALL"))).rejects.toThrow("без явного разрешения");
    vi.stubEnv("MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED", "true");
    await publishVersionUpdate(await command(ios, "ALL"));
    expect((await manifest(a))?.updateId).toBe(publicUpdate);
    await selectVersionUpdate({ ...a, testerAllowed: false, currentUpdateId: publicUpdate }, "manifest");
    expect(await allowsVersionCheckout(ordinary.id, "1.7.5", installation, fp, publicUpdate)).toBe(false);
    vi.stubEnv("MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED", "true");
    expect(await allowsVersionCheckout(ordinary.id, "1.7.5", installation, fp, publicUpdate)).toBe(true);
    expect(await allowsVersionCheckout(ordinary.id, "1.7.5", installation, fp, first)).toBe(false);
    vi.stubEnv("MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED", "false");
    expect(await allowsVersionCheckout(ordinary.id, "1.7.5", installation, fp, publicUpdate)).toBe(false);
  });
});
