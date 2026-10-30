import { describe, expect, it } from "vitest";
import { accountStorageTargets, createAccountStorageCleaner } from "../../../../cdn-upload/src/accountStorageCleanup";

const owner = "localowner_1";
const foreign = "foreignowner_2";
const uuid = "11111111-1111-4111-8111-111111111111";
const location = `isodev-avatar:documents/uploads/users/${owner}/avatar/${uuid}.png`;
const local = {GAFUS_ISOLATED_NONPROD_S3:"enabled"};

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
  expect(createAccountStorageCleaner("documents",env)).toHaveProperty("sweep");
  for(const bad of [
   {NODE_ENV:"production"},{GAFUS_LOCAL_ISOLATED_API:undefined},
   {GAFUS_ISOLATED_S3_ENDPOINT:"https://s3.cloud.ru"},
   {GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-documents-private"},
   {CLOUDRU_S3_ACCESS_KEY_ID:"remote-key"},
  ]) expect(() => createAccountStorageCleaner("documents",{...env,...bad})).toThrow();
 });
});
