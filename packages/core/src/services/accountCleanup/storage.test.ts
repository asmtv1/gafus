import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
const mock = vi.hoisted(() => ({ send: vi.fn(), configure: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: class {
      constructor(config: unknown) {
        mock.configure(config);
      }
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
    expect(accountStorageTargets("gallery", "u", [], ["migration-dual-provider-required"])).toEqual(
      { prefixes: ["albums/u/", "users/u/"], keys: [] },
    );
    expect(() => accountStorageTargets("feed", "u", [], ["posts/another-owner/"])).toThrow(
      "CLEANUP_UNSAFE_PREFIX",
    );
    expect(accountStorageTargets("gallery", "u", ["albums/u/a/photos/p/thumb.webp"]).keys).toEqual([
      "albums/u/a/photos/p/thumb.webp",
    ]);
    expect(accountStorageTargets("feed", "u", ["posts/u/p/media/segment-001.ts"]).keys).toEqual([
      "posts/u/p/media/segment-001.ts",
    ]);
    expect(() => accountStorageTargets("gallery", "u", ["albums/other/a/thumb.webp"])).toThrow(
      "CLEANUP_INVALID_MEDIA_KEY",
    );
    expect(() => accountStorageTargets("feed", "u", ["posts/u/../../other/private.ts"])).toThrow(
      "CLEANUP_INVALID_MEDIA_KEY",
    );
    expect(() => accountStorageTargets("feed", "../u", [])).toThrow();
  });
  it("selects a scoped Cloud.ru region without switching legacy public/course storage", () => {
    const env = {
      YC_ACCESS_KEY_ID: "legacy",
      YC_SECRET_ACCESS_KEY: "legacy-secret",
      GALLERY_BUCKET: "gafus-gallery-private",
      GALLERY_S3_ACCESS_KEY_ID: "tenant:key",
      GALLERY_S3_SECRET_ACCESS_KEY: "cloud-secret",
      GALLERY_S3_ENDPOINT: "https://s3.cloud.ru",
    };
    createAccountStorageCleaner("gallery", env);
    expect(mock.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: "https://s3.cloud.ru",
        region: "ru-central-1",
        forcePathStyle: true,
      }),
    );
    createAccountStorageCleaner("public", env);
    expect(mock.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: "https://storage.yandexcloud.net",
        region: "ru-central1",
      }),
    );
    expect(() =>
      createAccountStorageCleaner("gallery", {
        ...env,
        GALLERY_S3_ENDPOINT: "https://s3.cloud.ru.evil.example",
      }),
    ).toThrow("CLEANUP_UNSAFE_ENDPOINT");
  });
  it("rejects accidental Cloud.ru deletion scopes pointed at unapproved buckets", () => {
    expect(() =>
      createAccountStorageCleaner("gallery", {
        GALLERY_BUCKET: "other-gallery-private",
        GALLERY_S3_ACCESS_KEY_ID: "key",
        GALLERY_S3_SECRET_ACCESS_KEY: "secret",
        GALLERY_S3_ENDPOINT: "https://s3.cloud.ru",
      }),
    ).toThrow("CLEANUP_STORAGE_UNCONFIGURED");
    expect(() =>
      createAccountStorageCleaner("documents", {
        CLOUDRU_DOCUMENTS_BUCKET: "other-documents-private",
        CLOUDRU_S3_ACCESS_KEY_ID: "key",
        CLOUDRU_S3_SECRET_ACCESS_KEY: "secret",
      }),
    ).toThrow("CLEANUP_STORAGE_UNCONFIGURED");
  });
  it("sweeps explicitly non-versioned Cloud.ru objects without skipping re-listed pages", async () => {
    const cleaner = createAccountStorageCleaner("feed", {
      FEED_BUCKET: "gafus-feed-private",
      FEED_S3_ACCESS_KEY_ID: "tenant:key",
      FEED_S3_SECRET_ACCESS_KEY: "cloud-secret",
      FEED_S3_ENDPOINT: "https://s3.cloud.ru",
      FEED_BUCKET_VERSIONING: "disabled",
    });
    mock.send
      .mockResolvedValueOnce({ Contents: [{ Key: "posts/u/a.webp" }] })
      .mockResolvedValueOnce({ Deleted: [] })
      .mockResolvedValueOnce({ Contents: [{ Key: "posts/u/b.webp" }] })
      .mockResolvedValueOnce({ Deleted: [] })
      .mockResolvedValueOnce({ Contents: [] });
    expect(
      await cleaner.sweep({ prefixes: ["posts/u/"], keys: [] }, AbortSignal.timeout(1000)),
    ).toBe(2);
    expect(mock.send.mock.calls[0][0].constructor.name).toBe("ListObjectsV2Command");
    expect(mock.send.mock.calls[1][0].input.Delete.Objects).toEqual([{ Key: "posts/u/a.webp" }]);
    expect(mock.send.mock.calls[3][0].input.Delete.Objects).toEqual([{ Key: "posts/u/b.webp" }]);
  });
  it("never deletes a sibling prefix from a borrowed exact key in an unversioned bucket", async () => {
    const cleaner = createAccountStorageCleaner("feed", {
      FEED_BUCKET: "private-feed",
      FEED_S3_ACCESS_KEY_ID: "tenant:key",
      FEED_S3_SECRET_ACCESS_KEY: "cloud-secret",
      FEED_BUCKET_VERSIONING: "disabled",
    });
    mock.send
      .mockResolvedValueOnce({
        Contents: [{ Key: "posts/u/a.webp" }, { Key: "posts/u/a.webp-copy" }],
      })
      .mockResolvedValueOnce({ Deleted: [] })
      .mockResolvedValueOnce({ Contents: [{ Key: "posts/u/a.webp-copy" }] });
    expect(
      await cleaner.sweep({ prefixes: [], keys: ["posts/u/a.webp"] }, AbortSignal.timeout(1000)),
    ).toBe(1);
    expect(mock.send.mock.calls[1][0].input.Delete.Objects).toEqual([{ Key: "posts/u/a.webp" }]);
  });
  it("sweeps BOTH verified Cloud.ru and Yandex buckets during opt-in dual-provider cleanup", async () => {
    const env = {
      GALLERY_BUCKET: "gafus-gallery-private",
      GALLERY_S3_ENDPOINT: "https://s3.cloud.ru",
      GALLERY_S3_ACCESS_KEY_ID: "cloud:key",
      GALLERY_S3_SECRET_ACCESS_KEY: "cloud-secret",
      GALLERY_BUCKET_VERSIONING: "disabled",
      GALLERY_DUAL_PROVIDER_CLEANUP: "true",
      GALLERY_LEGACY_BUCKET: "gafus-gallery-legacy-private",
      GALLERY_LEGACY_BUCKET_VERIFIED: "true",
      GALLERY_LEGACY_S3_ENDPOINT: "https://storage.yandexcloud.net",
      GALLERY_LEGACY_S3_ACCESS_KEY_ID: "yandex-key",
      GALLERY_LEGACY_S3_SECRET_ACCESS_KEY: "yandex-secret",
      GALLERY_LEGACY_BUCKET_VERSIONING: "disabled",
    };
    const cleaner = createAccountStorageCleaner("gallery", env);
    expect(mock.configure).toHaveBeenCalledTimes(2);
    expect(mock.configure.mock.calls.map(([arg]) => arg.endpoint)).toEqual([
      "https://s3.cloud.ru",
      "https://storage.yandexcloud.net",
    ]);
    const seen: string[] = [];
    const remaining = new Set(["gafus-gallery-private", "gafus-gallery-legacy-private"]);
    mock.send.mockImplementation(async (command) => {
      const input = command.input as { Bucket: string; Prefix?: string; Delete?: object };
      if (command.constructor.name === "ListObjectsV2Command")
        return { Contents: remaining.has(input.Bucket) ? [{ Key: "albums/u/file.webp" }] : [] };
      if (command.constructor.name === "DeleteObjectsCommand") {
        seen.push(input.Bucket);
        remaining.delete(input.Bucket);
        return {};
      }
      throw new Error("UNEXPECTED_STORAGE_COMMAND");
    });
    expect(
      await cleaner.sweep({ prefixes: ["albums/u/"], keys: [] }, AbortSignal.timeout(1000)),
    ).toBe(2);
    expect(seen).toEqual(["gafus-gallery-private", "gafus-gallery-legacy-private"]);
  });
  it("never reports success when the second provider is unavailable", async () => {
    const env = {
      FEED_BUCKET: "gafus-feed-private",
      FEED_S3_ENDPOINT: "https://s3.cloud.ru",
      FEED_S3_ACCESS_KEY_ID: "cloud-key",
      FEED_S3_SECRET_ACCESS_KEY: "cloud-secret",
      FEED_BUCKET_VERSIONING: "disabled",
      FEED_DUAL_PROVIDER_CLEANUP: "true",
      FEED_LEGACY_BUCKET: "gafus-feed-legacy-private",
      FEED_LEGACY_BUCKET_VERIFIED: "true",
      FEED_LEGACY_S3_ENDPOINT: "https://storage.yandexcloud.net",
      FEED_LEGACY_S3_ACCESS_KEY_ID: "yandex-key",
      FEED_LEGACY_S3_SECRET_ACCESS_KEY: "yandex-secret",
      FEED_LEGACY_BUCKET_VERSIONING: "disabled",
    };
    const cleaner = createAccountStorageCleaner("feed", env);
    mock.send.mockImplementation(async (command) => {
      if (command.input.Bucket === "gafus-feed-legacy-private") throw new Error("YANDEX_OFFLINE");
      return { Contents: [] };
    });
    await expect(
      cleaner.sweep({ prefixes: ["posts/u/"], keys: [] }, AbortSignal.timeout(1000)),
    ).rejects.toThrow("YANDEX_OFFLINE");
  });
  it("refuses unverified legacy buckets before making destructive S3 calls", () => {
    const env = {
      GALLERY_BUCKET: "gafus-gallery-private",
      GALLERY_S3_ENDPOINT: "https://s3.cloud.ru",
      GALLERY_S3_ACCESS_KEY_ID: "cloud-key",
      GALLERY_S3_SECRET_ACCESS_KEY: "cloud-secret",
      GALLERY_DUAL_PROVIDER_CLEANUP: "true",
      GALLERY_LEGACY_BUCKET: "gafus-media",
      GALLERY_LEGACY_BUCKET_VERIFIED: "true",
      GALLERY_LEGACY_S3_ENDPOINT: "https://storage.yandexcloud.net",
      GALLERY_LEGACY_S3_ACCESS_KEY_ID: "legacy-key",
      GALLERY_LEGACY_S3_SECRET_ACCESS_KEY: "legacy-secret",
    };
    expect(() => createAccountStorageCleaner("gallery", env)).toThrow(
      "CLEANUP_LEGACY_PROVIDER_UNVERIFIED",
    );
    expect(mock.send).not.toHaveBeenCalled();
    expect(() =>
      createAccountStorageCleaner("gallery", {
        ...env,
        GALLERY_LEGACY_BUCKET: "gafus-gallery-old",
        GALLERY_LEGACY_BUCKET_VERIFIED: "false",
      }),
    ).toThrow("CLEANUP_LEGACY_PROVIDER_UNVERIFIED");
  });
  it("uses dedicated cleanup scopes and explicitly owned Cloud.ru buckets", () => {
    const question = "cloudru:questions:questions/uploads/questions/other/a.jpg";
    const document = "cloudru:documents:documents/uploads/users/u/pets/p/documents/d.pdf";
    expect(accountPublicKey(question)).toBeNull();
    expect(accountPublicKey(document)).toBeNull();
    expect(accountStorageTargets("questions", "u", [question])).toEqual({
      prefixes: ["questions/uploads/questions/u/"],
      keys: ["questions/uploads/questions/other/a.jpg"],
    });
    expect(accountStorageTargets("documents", "u", [document])).toEqual({
      prefixes: ["documents/uploads/users/u/pets/"],
      keys: ["documents/uploads/users/u/pets/p/documents/d.pdf"],
    });
    expect(() => accountStorageTargets("questions", "u", [document])).toThrow(
      "CLEANUP_INVALID_PRIVATE_LOCATION",
    );
    expect(() => accountStorageTargets("documents", "u", ["cloudru:documents:../bad"])).toThrow();
    createAccountStorageCleaner("documents", {
      CLOUDRU_DOCUMENTS_BUCKET: "gafus-documents-private",
      CLOUDRU_S3_ACCESS_KEY_ID: "tenant:key",
      CLOUDRU_S3_SECRET_ACCESS_KEY: "sample-secret",
      CLOUDRU_DOCUMENTS_BUCKET_VERSIONING: "disabled",
    });
    expect(mock.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: "https://s3.cloud.ru",
        region: "ru-central-1",
      }),
    );
  });
  it("purges only exact saved media paths on Cloud.ru instead of invented owner wildcards", async () => {
    vi.stubEnv("FEED_S3_ENDPOINT", "https://s3.cloud.ru");
    vi.stubEnv("FEED_CDN_PROVIDER", "cloudru");
    vi.stubEnv("CLOUDRU_CDN_PURGE_API_VERIFIED", "true");
    vi.stubEnv("CLOUDRU_CDN_CACHE_KEY_VERIFIED", "true");
    vi.stubEnv("CLOUDRU_CDN_ACCOUNT_NAME", "gafus-account");
    vi.stubEnv("CLOUDRU_CDN_API_TOKEN", "fake-token-more-than-twenty-four-characters");
    vi.stubEnv("FEED_CLOUDRU_CDN_DOMAINS", "cdn.example.com");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ task_id: "safe-task" }));
    vi.stubGlobal("fetch", fetchMock);
    const target = accountStorageTargets("feed", "u", [
      "posts/u/post/attachments/asset/thumb.webp",
    ]);
    const operations = await startAccountCdnPurge("feed", target);
    expect(operations).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).paths).toEqual([
      "/posts/u/post/attachments/asset/thumb.webp",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).action_type).toBe("single");
  });
  it("fails closed BEFORE Cloud.ru CDN purge if legacy cache verification is missing", async () => {
    vi.stubEnv("GALLERY_S3_ENDPOINT", "https://s3.cloud.ru");
    vi.stubEnv("GALLERY_CDN_PROVIDER", "cloudru");
    vi.stubEnv("GALLERY_DUAL_PROVIDER_CLEANUP", "true");
    vi.stubEnv("GALLERY_LEGACY_BUCKET_VERIFIED", "true");
    vi.stubEnv("GALLERY_LEGACY_CDN_RESOURCE_IDS", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      startAccountCdnPurge("gallery", {
        prefixes: ["albums/u/"],
        keys: ["albums/u/a.webp"],
      }),
    ).rejects.toThrow("CLEANUP_LEGACY_CDN_UNVERIFIED");
    expect(request).not.toHaveBeenCalled();
  });
  it("checkpoints both Cloud.ru and Yandex CDN operations and confirms both", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv(
      "CDN_CLEANUP_SERVICE_ACCOUNT_KEY",
      JSON.stringify({
        id: "key",
        service_account_id: "account",
        private_key: privateKey.export({ format: "pem", type: "pkcs8" }),
      }),
    );
    for (const [key, value] of Object.entries({
      FEED_S3_ENDPOINT: "https://s3.cloud.ru",
      FEED_CDN_PROVIDER: "cloudru", // explicit legacy-path test; Yandex is the new default
      FEED_DUAL_PROVIDER_CLEANUP: "true",
      FEED_LEGACY_BUCKET_VERIFIED: "true",
      FEED_LEGACY_CDN_RESOURCE_IDS: "old-feed",
      CLOUDRU_CDN_PURGE_API_VERIFIED: "true",
      CLOUDRU_CDN_CACHE_KEY_VERIFIED: "true",
      CLOUDRU_CDN_ACCOUNT_NAME: "gafus-account",
      CLOUDRU_CDN_API_TOKEN: "fake-api-token-at-least-24-characters",
      FEED_CLOUDRU_CDN_DOMAINS: "cdn.example.com",
    }))
      vi.stubEnv(key, value);
    const request = vi.fn(async (url: string, options: { method?: string } = {}) => {
      if (url.includes("cdnvideo.ru/") && options.method === "POST")
        return Response.json({ task_id: "cloud-1" });
      if (url.includes("cdnvideo.ru/") && options.method === "GET")
        return Response.json({ status: "ok" });
      if (url.includes("iam.api.cloud.yandex.net"))
        return Response.json({ iamToken: "verified-test-token" });
      if (url.includes("cdn.api.cloud.yandex.net")) return Response.json({ id: "yandex-1" });
      if (url.includes("operation.api.cloud.yandex.net")) return Response.json({ done: true });
      throw new Error("UNRECOGNIZED_EXTERNAL_API");
    });
    vi.stubGlobal("fetch", request);
    const targets = { prefixes: ["posts/u/"], keys: ["posts/u/post/thumb.webp"] };
    const checkpoint = vi.fn();
    const operations = await startAccountCdnPurge("feed", targets, [], checkpoint);
    expect(operations).toHaveLength(2);
    expect(operations.some((op) => op.startsWith("cloudru:"))).toBe(true);
    expect(operations.some((op) => /^[a-f0-9]{64}:yandex-1$/.test(op))).toBe(true);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(await accountCdnPurgeDone(operations)).toBe(true);
    const postCalls = request.mock.calls.filter(
      ([url, options]) =>
        options?.method === "POST" &&
        (url.includes("cdnvideo.ru") || url.includes("cdn.api.cloud.yandex.net")),
    );
    expect(postCalls).toHaveLength(2);
    expect(JSON.parse((postCalls[0]![1] as { body: string }).body).paths).toEqual([
      "/posts/u/post/thumb.webp",
    ]);
    expect(JSON.parse((postCalls[1]![1] as { body: string }).body).paths).toContain("/posts/u/*");
    const beforeRetry = request.mock.calls.length;
    expect(await startAccountCdnPurge("feed", targets, operations)).toEqual(operations);
    expect(request).toHaveBeenCalledTimes(beforeRetry);
  });
  it("purges ONLY Yandex CDN when Cloud.ru S3 uses existing Yandex edge", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("CDN_CLEANUP_SERVICE_ACCOUNT_KEY", JSON.stringify({
      id: "key", service_account_id: "account",
      private_key: privateKey.export({ format: "pem", type: "pkcs8" }),
    }));
    for (const [name, value] of Object.entries({
      GALLERY_S3_ENDPOINT: "https://s3.cloud.ru",
      // Provider omitted intentionally: Cloud.ru S3 must default to Yandex CDN.
      GALLERY_CDN_RESOURCE_IDS: "old-gallery",
      GALLERY_DUAL_PROVIDER_CLEANUP: "true",
      GALLERY_LEGACY_BUCKET_VERIFIED: "true",
      GALLERY_LEGACY_CDN_RESOURCE_IDS: "old-gallery",
    })) vi.stubEnv(name, value);
    const request = vi.fn(async (url: string) => {
      if (url.includes("iam.api.cloud.yandex.net")) return Response.json({ iamToken: "test-token" });
      if (url.includes("cdn.api.cloud.yandex.net")) return Response.json({ id: "yandex-1" });
      if (url.includes("operation.api.cloud.yandex.net")) return Response.json({ done: true });
      throw new Error("WRONG_CDN_PROVIDER");
    });
    vi.stubGlobal("fetch", request);
    const targets = { prefixes: ["albums/owner/"], keys: ["albums/owner/album/photos/p/thumb.webp"] };
    const checkpoint = vi.fn();
    const jobs = await startAccountCdnPurge("gallery", targets, [], checkpoint);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).not.toContain("cloudru");
    expect(await accountCdnPurgeDone(jobs, checkpoint)).toBe(true);
    expect(request.mock.calls.every(([url]) => !url.includes("cdnvideo.ru"))).toBe(true);
    expect(checkpoint).toHaveBeenCalledTimes(2);
  });
  it("requires Yandex CDN ids before accepting a Cloud.ru S3/Yandex CDN mode", async () => {
    vi.stubEnv("FEED_S3_ENDPOINT", "https://s3.cloud.ru");
    vi.stubEnv("FEED_CDN_PROVIDER", "yandex");
    vi.stubEnv("FEED_CDN_RESOURCE_IDS", "");
    await expect(startAccountCdnPurge("feed", { prefixes: ["posts/u/"], keys: [] }))
      .rejects.toThrow("CLEANUP_CDN_UNCONFIGURED");
  });
  it("does not request CDN purge for direct private S3 download scopes", async () => {
    expect(
      await startAccountCdnPurge("questions", {
        prefixes: ["questions/uploads/questions/u/"],
        keys: [],
      }),
    ).toEqual([]);
    expect(
      await startAccountCdnPurge("documents", {
        prefixes: ["documents/uploads/users/u/pets/"],
        keys: [],
      }),
    ).toEqual([]);
    expect(await accountCdnPurgeDone([])).toBe(true);
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
