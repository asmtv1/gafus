import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  owner: vi.fn(),
  sweep: vi.fn(),
  purge: vi.fn(),
  done: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $queryRaw: mock.query,
    $executeRaw: mock.execute,
    user: { findUnique: mock.owner },
  },
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
vi.mock("./stream", () => ({ deleteAccountStreamFiles: mock.stream }));
vi.mock("@gafus/cdn-upload", () => ({
  DUAL_PROVIDER_CLEANUP_MARKER: "migration-dual-provider-required",
  accountStorageTargets: () => ({ prefixes: ["albums/owner/"], keys: [] }),
  createAccountStorageCleaner: () => ({ sweep: mock.sweep }),
  startAccountCdnPurge: mock.purge,
  accountCdnPurgeDone: mock.done,
}));
import { processAccountStorageCleanup } from "./worker";
const job = {
  id: "job",
  ownerId: "owner",
  scope: "gallery",
  keys: [],
  attempts: 1,
  purgeAfter: null,
  purgeOperations: [],
};
function statements() {
  return mock.execute.mock.calls.map(([sql]) => sql.join(""));
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.query.mockResolvedValue([job]);
  mock.owner.mockResolvedValue(null);
  mock.execute.mockResolvedValue(1);
  mock.sweep.mockResolvedValue(0);
  mock.purge.mockResolvedValue(["operation"]);
  mock.done.mockResolvedValue(true);
});
describe("durable account cleanup", () => {
  it("persists the CDN operation and waits instead of reporting completion on acceptance", async () => {
    await processAccountStorageCleanup(1);
    expect(mock.purge).toHaveBeenCalledOnce();
    expect(statements()[0]).toContain('"purgeOperations" =');
    expect(statements()[0]).not.toContain("'done'");
  });
  it("completes only after an empty second sweep and confirmed CDN operation", async () => {
    mock.query.mockResolvedValue([
      { ...job, purgeAfter: new Date(0), purgeOperations: ["operation"] },
    ]);
    await processAccountStorageCleanup(1);
    expect(mock.sweep).toHaveBeenCalledOnce();
    expect(mock.done).toHaveBeenCalledWith(["operation"], expect.any(Function));
    expect(statements()[0]).toContain("'done'");
  });
  it.each(["questions", "documents"])(
    "completes verified private %s cleanup without scheduling any CDN purge",
    async (scope) => {
      mock.query.mockResolvedValue([{ ...job, scope }]);
      await processAccountStorageCleanup(1);
      expect(mock.sweep).toHaveBeenCalledOnce();
      expect(mock.purge).not.toHaveBeenCalled();
      expect(mock.done).not.toHaveBeenCalled();
      expect(statements()[0]).toContain("'done'");
    },
  );
  it("restarts CDN invalidation if a late object is found", async () => {
    mock.query.mockResolvedValue([
      { ...job, purgeAfter: new Date(0), purgeOperations: ["operation"] },
    ]);
    mock.sweep.mockResolvedValue(1);
    await processAccountStorageCleanup(1);
    expect(mock.purge).toHaveBeenCalledOnce();
    expect(mock.done).not.toHaveBeenCalled();
  });
  it("retains a retry on storage errors without calling purge", async () => {
    mock.sweep.mockRejectedValue(new Error("provider error"));
    await processAccountStorageCleanup(1);
    expect(mock.purge).not.toHaveBeenCalled();
    expect(statements()[0]).toContain("'pending'");
    expect(mock.execute.mock.calls[0]).toContain("CLEANUP_RETRY");
  });
  it("resets a failed CDN operation so the next attempt submits a new purge", async () => {
    mock.query.mockResolvedValue([
      { ...job, purgeAfter: new Date(0), purgeOperations: ["operation"] },
    ]);
    mock.done.mockRejectedValue(new Error("CLEANUP_CDN_OPERATION_FAILED"));
    await processAccountStorageCleanup(1);
    expect(mock.execute.mock.calls[0]).toContain(true);
    expect(statements()[0]).not.toContain("'done'");
  });
  it("refuses to forget a persisted Yandex cleanup obligation after worker config drift", async () => {
    vi.stubEnv("GALLERY_DUAL_PROVIDER_CLEANUP", "false");
    mock.query.mockResolvedValue([{ ...job, prefixes: ["migration-dual-provider-required"] }]);
    await processAccountStorageCleanup(1);
    expect(mock.sweep).not.toHaveBeenCalled();
    expect(mock.purge).not.toHaveBeenCalled();
    expect(mock.execute.mock.calls[0]).toContain("CLEANUP_LEGACY_PROVIDER_REQUIRED");
    vi.unstubAllEnvs();
  });
  it("refuses cleanup when the owner exists", async () => {
    mock.owner.mockResolvedValue({ id: "owner" });
    await processAccountStorageCleanup(1);
    expect(mock.sweep).not.toHaveBeenCalled();
    expect(mock.execute.mock.calls[0]).toContain("CLEANUP_OWNER_EXISTS");
  });
  it("checkpoints bounded Stream file pages", async () => {
    mock.query.mockResolvedValue([
      { ...job, scope: "stream", keys: Array.from({ length: 11 }, (_, i) => String(i)) },
    ]);
    await processAccountStorageCleanup(1);
    expect(mock.stream.mock.calls[0][0]).toHaveLength(10);
    expect(mock.execute.mock.calls[0]).toContainEqual(["10"]);
    expect(mock.execute.mock.calls[0]).toContain("pending");
  });
});
