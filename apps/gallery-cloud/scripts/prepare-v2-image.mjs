import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const project = "/Users/asmtv1/Desktop/gafus-refactor";
const root = fileURLToPath(new URL("../", import.meta.url));
if (process.cwd() !== project || root !== project + "/apps/gallery-cloud/")
  throw Error("GALLERY_V2_PROJECT_ROOT_REQUIRED");
const source = root + "dist/job/index.js";
// Revisions preserve previously verified local image inputs for rollbacks.
// These change only OCI build artifacts, not Gallery media processing paths.
const revision = process.env.GALLERY_V2_ARTIFACT_REVISION ?? "r1";
if (!["r1", "r2"].includes(revision))
  throw Error("UNAPPROVED_GALLERY_IMAGE_ARTIFACT_REVISION");
const directory = root + "artifacts/gallery-v2-image" + (revision === "r1" ? "" : "-r2");
const target = directory + "/job.cjs";
const manifestPath = directory + "/manifest.json";
const bytes = await readFile(source);
if (bytes.length < 100_000 || bytes.length > 10_000_000)
  throw Error("GALLERY_V2_BUNDLE_SIZE_UNEXPECTED");
const hash = createHash("sha256").update(bytes).digest("hex");
await mkdir(directory, { recursive: true });
try {
  await copyFile(source, target, constants.COPYFILE_EXCL);
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
  const previous = await readFile(target);
  if (createHash("sha256").update(previous).digest("hex") !== hash)
    throw Error("GALLERY_V2_IMAGE_ARTIFACT_DIFFERENT_REVIEW_BEFORE_REPLACEMENT");
}
const manifest = JSON.stringify({
  artifact: "gallery-media-v2",
  source: "apps/gallery-cloud/dist/job/index.js",
  sha256: hash,
  bytes: bytes.length,
  targetPlatform: "linux/amd64",
  nativeSharpExecutionVerified: false,
  cloudJobDeployed: false,
}, null, 2) + "\n";
try {
  await writeFile(manifestPath, manifest, { flag: "wx" });
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
  if (await readFile(manifestPath, "utf8") !== manifest)
    throw Error("GALLERY_V2_IMAGE_MANIFEST_CONFLICT");
}
await access(target);
console.log("Gallery V2 isolated OCI input prepared:", bytes.length, "bytes, sha256=", hash);
