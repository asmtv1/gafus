import { describe, expect, it } from "vitest";
import { galleryStorageConfigFromEnv, validateGalleryObjectConfig } from "./config";
const env={ NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",
 GAFUS_WEB4_ISOLATED_MEDIA:"1",GAFUS_ISOLATED_NONPROD_S3:"enabled",
 GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9500",
 GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-web4-gallery-test",
 GALLERY_ENABLED:"true"};
describe("WEB4 gallery guard exact 9500 only",()=>{
 it("accepts the distinct isolated gallery tuple",()=>{
  const c=galleryStorageConfigFromEnv(env);
  expect(c).toMatchObject({isolatedNonprod:true,enabled:true,
    bucket:"gafus-refactor-web4-gallery-test",endpoint:"http://127.0.0.1:9500"});
  expect(()=>validateGalleryObjectConfig(c)).not.toThrow();
 });
 it.each([
  {GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000"},
  {GAFUS_ISOLATED_S3_ENDPOINT:"https://s3.cloud.ru"},
  {GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-gallery-test"},
  {GAFUS_WEB4_ISOLATED_MEDIA:undefined},
 ])("rejects cross-profile endpoint or bucket %#",alter=>{
  expect(()=>galleryStorageConfigFromEnv({...env,...alter})).toThrow();
 });
});
