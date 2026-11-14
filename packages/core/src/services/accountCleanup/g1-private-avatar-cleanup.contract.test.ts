import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { accountStorageTargets, createAccountStorageCleaner } from "../../../../cdn-upload/src/accountStorageCleanup";

const owner = "localowner_1";
const foreign = "foreignowner_2";
const uuid = "11111111-1111-4111-8111-111111111111";
const location = `isodev-avatar:documents/uploads/users/${owner}/avatar/${uuid}.png`;
const local = {GAFUS_ISOLATED_NONPROD_S3:"enabled"};

// Real physical 0700/0600 guard is mandatory even in a clean CI checkout.
// Create only an ephemeral synthetic credential when there is no existing
// fixture; never replace or delete an existing developer credential file.
function withCleanCheckoutS3Fixture(run: () => void): void {
 const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
 const scratch = join(root, ".local-pg-scratch");
 const directory = join(scratch, "nonprod-s3");
 const credentials = join(directory, "credentials.json");
 const ownScratch = !existsSync(scratch);
 const ownDirectory = !existsSync(directory);
 let ownFile = false;
 try {
  if (ownDirectory) mkdirSync(directory, { recursive: true, mode: 0o700 });
  // An existing but incomplete fixture belongs to another test/operator.
  if (!existsSync(credentials)) {
   if (!ownDirectory) throw new Error("ISOLATED_S3_FIXTURE_OWNERSHIP_UNKNOWN");
   writeFileSync(credentials, JSON.stringify({
    accessKeyId: randomBytes(16).toString("hex"),
    secretAccessKey: randomBytes(24).toString("hex"),
   }), { flag: "wx", mode: 0o600 });
   ownFile = true;
  }
  run();
 } finally {
  if (ownFile) unlinkSync(credentials);
  if (ownDirectory) rmdirSync(directory);
  if (ownScratch) rmdirSync(scratch);
 }
}

describe("nonprod-only account cleanup contract for private avatar", () => {
 it("keeps exact own avatar in private Documents, never public legacy storage", () => {
  expect(accountStorageTargets("documents",owner,[location],[],local)).toEqual({
   prefixes:[`documents/uploads/users/${owner}/pets/`,`documents/uploads/users/${owner}/avatar/`],
   keys:[`documents/uploads/users/${owner}/avatar/${uuid}.png`],
  });
  expect(() => accountStorageTargets("documents",owner,[location],[],{}))
   .toThrow("CLEANUP_INVALID_PRIVATE_LOCATION");
  expect(() => accountStorageTargets("documents",foreign,[location],[],local))
   .toThrow("CLEANUP_INVALID_PRIVATE_LOCATION");
  expect(() => accountStorageTargets("questions",owner,[location],[],local))
   .toThrow("CLEANUP_INVALID_PRIVATE_LOCATION");
 });
 it("rejects traversal, remote-style lookalikes, malformed UUID and extensions", () => {
  for(const bad of [
   location.replace(uuid,"../another"),location.replace(uuid,"not-a-uuid"),
   location.replace(".png",".svg"),location+"?token=guess",
   location.replace("isodev-avatar:","cloudru:documents:"),
  ]) expect(() => accountStorageTargets("documents",owner,[bad],[],local)).toThrow();
 });
 it("requires physical exact local gate to construct a private Documents cleaner", () => {
  const env = {
   NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_ISOLATED_NONPROD_S3:"enabled",
   GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
   GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-documents-test",
  };
  withCleanCheckoutS3Fixture(() => {
   expect(createAccountStorageCleaner("documents",env)).toHaveProperty("sweep");
   for(const bad of [
    {NODE_ENV:"production"},{GAFUS_LOCAL_ISOLATED_API:undefined},
    {GAFUS_ISOLATED_S3_ENDPOINT:"https://s3.cloud.ru"},
    {GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-documents-private"},
    {CLOUDRU_S3_ACCESS_KEY_ID:"remote-key"},
   ]) expect(() => createAccountStorageCleaner("documents",{...env,...bad})).toThrow();
  });
 });
});
