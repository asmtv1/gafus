import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
const mock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: class {
      send = mock.send;
    },
    DeleteObjectsCommand: class DeleteObjectsCommand extends Command {},
    ListObjectVersionsCommand: class ListObjectVersionsCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
  };
});
import {
  accountPublicKey,
  accountStorageTargets,
  createAccountStorageCleaner,
  startAccountCdnPurge,
  accountCdnPurgeDone,
} from "../../../../cdn-upload/src/accountStorageCleanup";
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("account storage cleanup adapter", () => {
  it("normalizes supported public origins and skips external avatars", () => {
    expect(
      accountPublicKey("https://storage.yandexcloud.net/gafus-media/uploads/users/u/avatar/a.jpg"),
    ).toBe("uploads/users/u/avatar/a.jpg");
    expect(accountPublicKey("https://gafus.ru/uploads/questions/u/a.jpg")).toBe(
      "uploads/questions/u/a.jpg",
    );
    expect(accountPublicKey("https://external.example/avatar.jpg")).toBeNull();
    expect(() => accountPublicKey("users/u/../other/a.jpg")).toThrow("CLEANUP_UNSAFE_KEY");
  });
  it("uses exact owner boundaries and does not mix buckets", () => {
    expect(accountStorageTargets("public", "u", [])).toEqual({
      prefixes: ["uploads/users/u/", "uploads/questions/u/"],
      keys: [],
    });
    expect(accountStorageTargets("gallery", "u", [])).toEqual({
      prefixes: ["albums/u/", "users/u/"],
      keys: [],
    });
    expect(accountStorageTargets("feed", "u", [])).toEqual({ prefixes: ["posts/u/"], keys: [] });
    expect(() => accountStorageTargets("feed", "../u", [])).toThrow();
  });
  it("deletes versions and markers, then verifies an empty prefix", async () => {
    const cleaner = createAccountStorageCleaner("public", {
      YC_ACCESS_KEY_ID: "test",
      YC_SECRET_ACCESS_KEY: "test",
    });
    mock.send
      .mockResolvedValueOnce({
        Versions: [{ Key: "uploads/users/u/a.jpg", VersionId: "v1" }],
        DeleteMarkers: [{ Key: "uploads/users/u/a.jpg", VersionId: "v2" }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Versions: [] })
      .mockResolvedValueOnce({ Contents: [] });
    expect(
      await cleaner.sweep({ prefixes: ["uploads/users/u/"], keys: [] }, AbortSignal.timeout(1000)),
    ).toBe(2);
    expect(mock.send.mock.calls[1][0].input.Delete.Objects).toEqual([
      { Key: "uploads/users/u/a.jpg", VersionId: "v1" },
      { Key: "uploads/users/u/a.jpg", VersionId: "v2" },
    ]);
  });
  it("does not interpret partial batch errors as success", async () => {
    const cleaner = createAccountStorageCleaner("public", {
      YC_ACCESS_KEY_ID: "test",
      YC_SECRET_ACCESS_KEY: "test",
    });
    mock.send
      .mockResolvedValueOnce({ Versions: [{ Key: "uploads/users/u/a.jpg" }] })
      .mockResolvedValueOnce({ Errors: [{ Code: "AccessDenied" }] });
    await expect(
      cleaner.sweep({ prefixes: ["uploads/users/u/"], keys: [] }, AbortSignal.timeout(1000)),
    ).rejects.toThrow("CLEANUP_PARTIAL_DELETE");
  });
  it("deletes a borrowed question photo by exact key without deleting matching suffixes", async () => {
    const cleaner = createAccountStorageCleaner("public", {
      YC_ACCESS_KEY_ID: "test",
      YC_SECRET_ACCESS_KEY: "test",
    });
    mock.send
      .mockResolvedValueOnce({
        Versions: [
          { Key: "uploads/questions/other/a.jpg", VersionId: "v1" },
          { Key: "uploads/questions/other/a.jpg-other", VersionId: "v2" },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Versions: [{ Key: "uploads/questions/other/a.jpg-other" }] });
    await cleaner.sweep(
      { prefixes: [], keys: ["uploads/questions/other/a.jpg"] },
      AbortSignal.timeout(1000),
    );
    expect(mock.send.mock.calls[1][0].input.Delete.Objects).toEqual([
      { Key: "uploads/questions/other/a.jpg", VersionId: "v1" },
    ]);
  });
  it("keeps private CDN cleanup pending when resource IDs are missing", async () => {
    vi.stubEnv("GALLERY_CDN_RESOURCE_IDS", "");
    await expect(
      startAccountCdnPurge("gallery", { prefixes: ["albums/u/"], keys: [] }),
    ).rejects.toThrow("CLEANUP_CDN_UNCONFIGURED");
  });
  it("authenticates with IAM, purges each alias, checkpoints progress and polls the operation endpoint", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv(
      "CDN_CLEANUP_SERVICE_ACCOUNT_KEY",
      JSON.stringify({
        id: "key",
        service_account_id: "account",
        private_key: privateKey.export({ format: "pem", type: "pkcs8" }),
      }),
    );
    vi.stubEnv("GALLERY_CDN_RESOURCE_IDS", "alias1,alias2,alias1");
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ iamToken: "test-token" }))
      .mockResolvedValueOnce(Response.json({ id: "op1" }))
      .mockResolvedValueOnce(Response.json({ id: "op2" }))
      .mockResolvedValueOnce(Response.json({ done: true }))
      .mockResolvedValueOnce(Response.json({ done: false }));
    vi.stubGlobal("fetch", request);
    const checkpoint = vi.fn();
    const targets = { prefixes: ["albums/u/"], keys: [] };
    const operations = await startAccountCdnPurge("gallery", targets, [], checkpoint);
    expect(operations).toHaveLength(2);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe("https://iam.api.cloud.yandex.net/iam/v1/tokens");
    expect(request.mock.calls[1][0]).toBe(
      "https://cdn.api.cloud.yandex.net/cdn/v1/cache/alias1:purge",
    );
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ paths: ["/albums/u/*"] });
    expect(request.mock.calls[1][1].headers.Authorization).toBe("Bearer test-token");
    expect(await accountCdnPurgeDone(operations)).toBe(false);
    expect(request.mock.calls[3][0]).toBe("https://operation.api.cloud.yandex.net/operations/op1");
    const before = request.mock.calls.length;
    expect(await startAccountCdnPurge("gallery", targets, operations)).toEqual(operations);
    expect(request).toHaveBeenCalledTimes(before);
  });
});
