/** Disposable service-recovery fixture, reachable ONLY through the A2 private
 * launcher. No production object-store credentials or release keys. */
import { createHash, randomBytes, randomUUID, sign, X509Certificate } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { prisma } from "../src/client";
const ownerName = "a2restoreowner";
const outsiderName = "a2restoreoutsider";
const roomId = "a2-restore-room";
const courseType = "a2-restore-private";
const mediaId = "a2-restore-media";
const fingerprint = "b".repeat(64);
const keyId = "a2-restore-test";
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

export async function seedRestoreFixture(workDir: string, hashPassword: (password: string) => Promise<string>) {
  const password = randomBytes(24).toString("base64url");
  const hash = await hashPassword(password);
  // Real X.509 code-signing trust, as expected by the external backup
  // validator. Only a disposable fixture key is ever generated here.
  const certPath = join(workDir, "qa-ota-cert.pem");
  const keyPath = join(workDir, "qa-ota-key.pem");
  execFileSync("openssl", ["req","-x509","-newkey","rsa:2048","-nodes","-days","3",
    "-subj","/CN=GAFUS isolated restore QA","-addext","extendedKeyUsage=codeSigning",
    "-keyout",keyPath,"-out",certPath], {stdio:"ignore"});
  const certificatePem = await readFile(certPath, "utf8");
  const privateKey = await readFile(keyPath);
  const publicPem = new X509Certificate(certificatePem).publicKey.export({ type:"spki",format:"pem" }).toString();
  const otaOrigin = process.env.A2_OBS_OTA_ORIGIN ?? "https://ota-restore.invalid/source-ota";
  if (!/^https:\/\/ota-restore\.invalid\/(?:source-ota|gafus-qa-source-[a-f0-9]{12}-ota)$/.test(otaOrigin))
    throw Error("A2_OTA_ORIGIN_NOT_ISOLATED");
  const asset = Buffer.from("/* isolated previous OTA bundle */");
  const activeAsset = Buffer.from("/* isolated active OTA bundle */");
  const media = Buffer.from("isolated media snapshot bytes");
  const objectDir = join(workDir, "objects");
  await mkdir(objectDir, { mode: 0o700 });
  await writeFile(join(objectDir, "previous.bundle"), asset, { flag: "wx", mode: 0o600 });
  await writeFile(join(objectDir, "active.bundle"), activeAsset, { flag: "wx", mode: 0o600 });
  await writeFile(join(objectDir, "media.bin"), media, { flag: "wx", mode: 0o600 });
  const ids = await prisma.$transaction(async tx => {
    const trainer = await tx.user.create({ data: { username: "a2restoretrainer", password: hash,
      passwordSetAt: new Date(), registrationPending: false, role: "TRAINER" } });
    const owner = await tx.user.create({ data: { username: ownerName, password: hash,
      passwordSetAt: new Date(), registrationPending: false, role: "USER" } });
    const outsider = await tx.user.create({ data: { username: outsiderName, password: hash,
      passwordSetAt: new Date(), registrationPending: false, role: "USER" } });
    const course = await tx.course.create({ data: { type: courseType, name: "Isolated private course",
      trainingLevel: "BEGINNER", duration: "1", logoImg: "", authorId: trainer.id, isPrivate: true } });
    const day = await tx.trainingDay.create({ data: { title: "Isolated day", authorId: trainer.id } });
    const link = await tx.dayOnCourse.create({ data: { courseId: course.id, dayId: day.id, order: 1 } });
    const step = await tx.step.create({ data: { title: "Isolated step", authorId: trainer.id, type: "TRAINING", durationSec: 90 } });
    await tx.stepOnDay.create({ data: { dayId: day.id, stepId: step.id, order: 1 } });
    await tx.courseAccess.create({ data: { courseId: course.id, userId: owner.id } });
    await tx.chat2Conversation.create({ data: { id: roomId, kind: "GROUP", visibility: "PRIVATE",
      name: "Isolated recovery room", createdById: owner.id, members: { create: { userId: owner.id, role: "OWNER" } } } });
    await tx.chat2Media.create({ data: { id: mediaId, conversationId: roomId, ownerId: owner.id,
      objectKey: "a2-restore/media.bin", name: "media.bin", kind: "file", mime: "application/octet-stream",
      bytes: media.byteLength, status: "READY" } });
    const native = await tx.mobileNativeRelease.create({ data: {
      appId: "gafus", platform: "ios", environment: "preview", distribution: "internal",
      bundleId: "ru.gafus.app", appVersion: "1.7.6", buildNumber: "900001",
      runtimeVersion: "1.7.6", channel: "preview", updateUrl: "http://127.0.0.1:56244/ota/manifest",
      signingKeyId: keyId, certificateSha256: sha(certificatePem), certificatePem,
      nativeFingerprint: fingerprint, sourceSha: "a".repeat(40), verified: true, verifiedAt: new Date(),
    } });
    async function release(revision: number) {
      const updateId = randomUUID();
      const bytes = revision===1 ? asset : activeAsset;
      const assetKey = revision===1 ? "previous.bundle" : "active.bundle";
      // Synthetic HTTPS signed locator, never fetched from DNS. The private
      // test client maps the exact verified path to its loopback delivery.
      const immutableUrl = otaOrigin + "/ota/preview/gafus/1.7.6/ios/assets/" + assetKey;
      const body = Buffer.from(JSON.stringify({ id: updateId, createdAt: new Date().toISOString(),
        runtimeVersion: "1.7.6", launchAsset: { key: assetKey, hash: Buffer.from(sha(bytes),"hex").toString("base64url"),
          contentType: "application/javascript", url: immutableUrl },
        assets: [], metadata: { channel: "preview", environment: "preview", sourceSha: "a".repeat(40) }, extra: {ota:{revision}} }));
      const signature = sign("RSA-SHA256", body, privateKey).toString("base64");
      return tx.mobileOtaRelease.create({ data: { nativeReleaseId: native.id, appId: "gafus",
        platform: "ios", environment: "preview", channel: "preview", runtimeVersion: "1.7.6",
        sourceSha: "a".repeat(40), revision, updateId, manifestBody: body,
        signatureHeader: 'sig="'+signature+'", keyid="'+keyId+'", alg="rsa-v1_5-sha256"',
        signingKeyId: keyId, state: "READY", readyAt: new Date(), signingExpiresAt: new Date(new X509Certificate(certificatePem).validTo),
        artifacts: { create: { assetKey, immutableUrl,
          sha256: sha(bytes), mimeType: "application/javascript", sizeBytes: BigInt(bytes.byteLength), verified: true } },
      } });
    }
    const previous = await release(1);
    const active = await release(2);
    await tx.mobileOtaDeployment.create({ data: { appId: "gafus", platform: "ios", environment: "preview",
      channel: "preview", runtimeVersion: "1.7.6", signingKeyId: keyId, nativeFingerprint: fingerprint,
      activeReleaseId: active.id, previousReleaseId: previous.id, paused: false, rolloutPercent: 0 } });
    return { ownerId: owner.id, outsiderId: outsider.id, dayId: link.id, previousUpdateId: previous.updateId, activeUpdateId: active.updateId };
  });
  return { ...ids, password, ownerName, outsiderName, roomId, courseType, mediaId, mediaSha256: sha(media),
    previousAssetSha256: sha(asset), activeAssetSha256: sha(activeAsset), certificateSha256: sha(certificatePem), otaOrigin, publicPem, fingerprint, keyId, walkId: randomUUID() };
}

export async function readRestoreMedia(workDir: string) {
  const row = await prisma.chat2Media.findUniqueOrThrow({ where: { id: mediaId } });
  const bytes = await readFile(join(workDir, "objects", "media.bin"));
  if (row.objectKey !== "a2-restore/media.bin" || row.bytes !== bytes.byteLength ||
      row.status !== "READY" || row.conversationId !== roomId) throw Error("A2_MEDIA_SNAPSHOT_MISMATCH");
  return { sha256: sha(bytes), ownerId: row.ownerId, bytes: bytes.byteLength };
}
export async function readRestoreAsset(workDir: string, key: "previous.bundle" | "active.bundle") {
  return readFile(join(workDir, "objects", key));
}
