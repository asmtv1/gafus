import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  wire: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({ isAuthenticated: m.authed, isLoading: false, user: { id: m.owner } }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/gallery", () => ({ galleryTransport: m.wire }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: m.trace }));
import { deleteAlbumAndConfirm } from "./albumDelete";
const params = () => ({
  actor: { ownerId: "A", authEpoch: "E1" },
  albumId: "album-1",
  live: () => true,
});
const missing = () => Object.assign(new Error("not found"), { code: "NOT_FOUND" });
const defer = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { resolve, promise };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.wire.mockResolvedValueOnce({ id: "album-1" }).mockRejectedValueOnce(missing());
});
describe("AG3 existing DELETE album exact server absence", () => {
  it("guarded DELETE followed by GET NOT_FOUND confirms; no duplicate request", async () => {
    expect(await deleteAlbumAndConfirm(params())).toBe("confirmed");
    expect(m.wire).toHaveBeenCalledTimes(2);
    expect(m.wire.mock.calls[0]).toEqual([
      "albums/album-1",
      { method: "DELETE", requestGuard: expect.any(Function) },
    ]);
    expect(m.wire.mock.calls[1][1].requestGuard()).toBe(true);
  });
  it("wrong ACK ID is UNKNOWN, no readback", async () => {
    m.wire.mockReset().mockResolvedValue({ id: "foreign" });
    expect(await deleteAlbumAndConfirm(params())).toBe("unknown");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("GET still sees album after ACK is UNKNOWN", async () => {
    m.wire
      .mockReset()
      .mockResolvedValueOnce({ id: "album-1" })
      .mockResolvedValueOnce({ id: "album-1" });
    expect(await deleteAlbumAndConfirm(params())).toBe("unknown");
    expect(m.wire).toHaveBeenCalledTimes(2);
  });
  it("GET network failure is UNKNOWN not NOT_FOUND", async () => {
    m.wire
      .mockReset()
      .mockResolvedValueOnce({ id: "album-1" })
      .mockRejectedValueOnce(new Error("secret signed URL"));
    expect(await deleteAlbumAndConfirm(params())).toBe("unknown");
  });
  it("lost ACK UNKNOWN no retry and raw private URL never sent to tracer", async () => {
    m.wire.mockReset().mockRejectedValueOnce(new Error("X-Amz-Signature=SECRET"));
    expect(await deleteAlbumAndConfirm(params())).toBe("unknown");
    expect(m.wire).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("SECRET");
  });
  it("known FORBIDDEN rejection no GET", async () => {
    m.wire
      .mockReset()
      .mockRejectedValueOnce(Object.assign(new Error("private"), { code: "FORBIDDEN" }));
    expect(await deleteAlbumAndConfirm(params())).toBe("rejected");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("A->B->A new epoch during DELETE blocks late GET", async () => {
    m.wire.mockReset();
    const d = defer<{ id: string }>();
    m.wire.mockReturnValueOnce(d.promise);
    const task = deleteAlbumAndConfirm(params());
    await vi.waitFor(() => expect(m.wire).toHaveBeenCalledOnce());
    const guard = m.wire.mock.calls[0][1].requestGuard as () => boolean;
    m.owner = "B";
    m.epoch = "EB";
    m.owner = "A";
    m.epoch = "E2";
    expect(guard()).toBe(false);
    d.resolve({ id: "album-1" });
    expect(await task).toBe("stale");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("unmount live false before or after DELETE prevents GET", async () => {
    let live = false;
    expect(await deleteAlbumAndConfirm({ ...params(), live: () => live })).toBe("stale");
    expect(m.wire).not.toHaveBeenCalled();
    live = true;
    m.wire.mockReset();
    const d = defer<{ id: string }>();
    m.wire.mockReturnValueOnce(d.promise);
    const task = deleteAlbumAndConfirm({ ...params(), live: () => live });
    await vi.waitFor(() => expect(m.wire).toHaveBeenCalledOnce());
    live = false;
    d.resolve({ id: "album-1" });
    expect(await task).toBe("stale");
    expect(m.wire).toHaveBeenCalledOnce();
  });
});
