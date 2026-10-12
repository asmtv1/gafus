import assert from "node:assert/strict";
import { runCloudruMultipartSmoke } from "./multipart-smoke.mjs";
const safe = {
  CLOUDRU_S3_ENDPOINT: "https://s3.cloud.ru",
  GALLERY_BUCKET: "gafus-gallery-private",
  CLOUDRU_S3_ACCESS_KEY_ID: "test-key",
  CLOUDRU_S3_SECRET_ACCESS_KEY: "test-secret",
};
await assert.rejects(runCloudruMultipartSmoke({}), /CLOUDRU_MULTIPART_SMOKE_NOT_AUTHORIZED/);
await assert.rejects(
  runCloudruMultipartSmoke({ ...safe }),
  /CLOUDRU_MULTIPART_SMOKE_NOT_AUTHORIZED/,
);
await assert.rejects(
  runCloudruMultipartSmoke({
    ...safe,
    CLOUDRU_MULTIPART_SMOKE_CONFIRM: "disposable-uuid-only",
    GALLERY_BUCKET: "gafus-media",
  }),
  /CLOUDRU_MULTIPART_SMOKE_NOT_AUTHORIZED/,
);
await assert.rejects(
  runCloudruMultipartSmoke({
    ...safe,
    CLOUDRU_MULTIPART_SMOKE_CONFIRM: "disposable-uuid-only",
    CLOUDRU_S3_ENDPOINT: "http://s3.cloud.ru",
  }),
  /CLOUDRU_MULTIPART_SMOKE_NOT_AUTHORIZED/,
);
console.log(
  "Cloud.ru multipart live smoke is gated on exact private bucket and explicit disposable UUID approval PASS",
);
