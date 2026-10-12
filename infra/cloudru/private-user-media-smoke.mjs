/** Live owner-media flow: strictly synthetic random keys, no user records or private file names. */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  uploadPrivateUserMedia,
  signPrivateUserMedia,
  deletePrivateUserMedia,
} = require("../../packages/cdn-upload/dist/privateUserMedia.js");
const kinds = [
  {
    kind: "questions",
    path: () => `questions/${randomUUID()}/${randomUUID()}.jpg`,
    body: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    mime: "image/jpeg",
  },
  {
    kind: "documents",
    path: () => `users/${randomUUID()}/pets/${randomUUID()}/documents/${randomUUID()}.pdf`,
    body: Uint8Array.from(Buffer.from("%PDF-1.4\n%%EOF\n")),
    mime: "application/pdf",
  },
];
let failures = 0;
for (const caseData of kinds) {
  const status = { kind: caseData.kind, upload: false, signedGet: false, deletion: false };
  const path = caseData.path();
  // Calculate exact randomized object location even if PUT times out after commit.
  // The helper can then safely clean up the validation object in finally.
  const { privateMediaLocation } = require("../../packages/cdn-upload/dist/privateUserMedia.js");
  const reference = privateMediaLocation(caseData.kind, path);
  let stage = "upload";
  try {
    const uploaded = await uploadPrivateUserMedia(
      caseData.kind,
      path,
      caseData.body,
      caseData.mime,
    );
    if (uploaded !== reference) throw new Error("PRIVATE_SMOKE_LOCATION_MISMATCH");
    status.upload = reference.startsWith(`cloudru:${caseData.kind}:`);
    stage = "presign";
    const signed = await signPrivateUserMedia(
      reference,
      120,
      caseData.kind === "documents" ? "Тест.pdf" : undefined,
    );
    stage = "download";
    const response = await fetch(signed, { signal: AbortSignal.timeout(10_000) });
    status.signedGet =
      response.ok && Buffer.from(await response.arrayBuffer()).equals(Buffer.from(caseData.body));
  } catch (e) {
    status.failedStep = stage;
    status.errorType = e?.name === "Error" ? "request-error" : String(e?.name).slice(0, 45);
  } finally {
    try {
      await deletePrivateUserMedia(reference);
      status.deletion = true;
    } catch {
      status.failedDelete = true;
    }
  }
  if (!status.upload || !status.signedGet || !status.deletion) failures++;
  console.log(JSON.stringify(status));
}
if (failures) process.exitCode = 1;
