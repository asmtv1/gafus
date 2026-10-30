/** Physical isolated dev-only MinIO proof for the original pet-avatar object path.
 * Prerequisite: guarded project-local MinIO listener on 127.0.0.1:9000.
 * Never logs signatures, credentials, full keys, or binary contents.
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  isolatedAvatarLocationFromOwnPath, isIsolatedAvatarPath,
} from "../../packages/cdn-upload/src/isolatedAvatarMedia";
import {
  uploadFileToCDN, getSignedDownloadUrl, deleteFileFromCDN,
} from "../../packages/cdn-upload/src/uploadToCDN";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
if (realpathSync(process.cwd()) !== root ||
  execFileSync("git", ["-C",root,"rev-parse","--show-toplevel"],
    {encoding:"utf8"}).trim() !== root ||
  execFileSync("git", ["-C",root,"branch","--show-current"],
    {encoding:"utf8"}).trim() !== "vite" ||
  process.env.NODE_ENV !== "development" ||
  process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
  process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
  process.env.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
  process.env.GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET !== "gafus-refactor-documents-test") {
  throw new Error("WEB2_ISOLATED_S3_PREFLIGHT_DENIED");
}
const path = `users/web2_synthetic/pets/pet_web2_synthetic/${randomUUID()}.png`;
if (!isIsolatedAvatarPath(path)) throw new Error("WEB2_INVALID_OWN_PATH");
const candidate = isolatedAvatarLocationFromOwnPath(path);
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7NwAAAABJRU5ErkJggg==",
  "base64",
);
async function main(): Promise<void> {
let writeAttempted = false;
let proved = false;
try {
  const file = new File([bytes], "photo.png", {type:"image/png"});
  writeAttempted = true;
  // Exercise the exact CDN facade invoked by the original Core pet service.
  const stored = await uploadFileToCDN(file,path);
  if (stored !== candidate) throw new Error("WEB2_STORAGE_MARKER_MISMATCH");
  const signed = await getSignedDownloadUrl(stored,300);
  if (!signed) throw new Error("WEB2_UNSIGNED_RESULT");
  const target = new URL(signed);
  if (target.origin !== "http://127.0.0.1:9000" ||
    !target.pathname.startsWith("/gafus-refactor-documents-test/documents/uploads/users/"))
    throw new Error("WEB2_SIGNED_PATH_NOT_ISOLATED");
  const downloaded = await fetch(signed, {cache:"no-store"});
  if (downloaded.status !== 200) throw new Error("WEB2_SIGNED_GET_NOT_200");
  const actual = new Uint8Array(await downloaded.arrayBuffer());
  if (!Buffer.from(actual).equals(bytes)) throw new Error("WEB2_OBJECT_BYTES_MISMATCH");
  const anonymous = await fetch(target.origin+target.pathname, {cache:"no-store"});
  if (anonymous.status !== 403) throw new Error("WEB2_ANONYMOUS_OBJECT_NOT_PRIVATE");
  proved=true;
  console.log("WEB2_ISOLATED_PET_S3_PUT_SIGNED_GET_BYTES_ANON403_PASS");
} finally {
  if (writeAttempted) {
    await deleteFileFromCDN(candidate);
    console.log(proved ? "WEB2_ISOLATED_PET_S3_PHYSICAL_CLEANUP_PASS" :
      "WEB2_ISOLATED_PET_S3_FAILURE_CLEANUP_CONFIRMED");
  }
}
}
main().catch(() => {
  // Never output private MinIO/SDK errors or signed URLs.
  console.error("WEB2_ISOLATED_PET_S3_PHYSICAL_FAILED");
  process.exitCode = 1;
});
