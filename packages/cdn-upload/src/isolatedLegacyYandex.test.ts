import { File } from "node:buffer";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyObjectInCDN, deleteFileFromCDN, deleteFolderFromCDN,
  downloadFileFromCDN, getSignedDownloadUrl, streamFileFromCDN,
  uploadBufferToCDN, uploadFileToCDN, uploadReadableStreamToCDN,
} from "./uploadToCDN";

afterEach(() => vi.unstubAllEnvs());
describe("isolated S3 may not touch legacy Yandex storage", () => {
  it("fails closed for every legacy entry without networking or secret logging", async () => {
    vi.stubEnv("GAFUS_ISOLATED_NONPROD_S3", "enabled");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
    vi.stubEnv("GAFUS_ISOLATED_S3_ENDPOINT", "http://127.0.0.1:9000");
    vi.stubEnv("GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET", "gafus-refactor-documents-test");
    const legacyCalls = [
      () => getSignedDownloadUrl("legacy.jpg", 90),
      () => uploadFileToCDN(new File(["a"], "x.jpg", { type: "image/jpeg" }) as globalThis.File, "legacy.jpg"),
      () => uploadReadableStreamToCDN(Readable.from(["a"]), "legacy.jpg", "image/jpeg", 1, "x.jpg"),
      () => downloadFileFromCDN("legacy.jpg"),
      () => streamFileFromCDN("legacy.jpg"),
      () => copyObjectInCDN("legacy.jpg", "another.jpg"),
      () => deleteFileFromCDN("legacy.jpg"),
      () => deleteFolderFromCDN("legacy-folder"),
      () => uploadBufferToCDN(Buffer.from("x"), "legacy.jpg", "image/jpeg"),
    ];
    for (const call of legacyCalls) {
      await expect(call()).rejects.toThrow("ISOLATED_S3_LEGACY_PROVIDER_DENIED");
    }
  });
});
