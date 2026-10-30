import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  username: "alice",
  wire: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: m.owner, username: m.username },
      isAuthenticated: m.authed,
      isLoading: false,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/gallery", () => ({ galleryTransport: m.wire }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { albumChangedFields, saveAlbumAndReadback, setAlbumCoverAndReadback } from "./albumMutation";
const album = () => ({
  id: "album1",
  name: "Собаки",
  isVisible: true,
  ownerId: "A",
  ownerUsername: "alice",
  canEdit: true,
  description: null,
  coverPhotoId: null,
  coverThumbUrl: null,
  urlsExpireAt: null,
  photoCount: 0,
  createdAt: "2026-10-18",
  updatedAt: "2026-10-18",
});
const actor = () => ({ ownerId: "A", authEpoch: "E1" });
const params = (original?: ReturnType<typeof album>) => ({
  actor: actor(),
  ownerUsername: "alice",
  original,
  draft: { name: " Новое ", isVisible: false },
  live: () => true,
});
const pending = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.username = "alice";
  let stored = album();
  m.wire.mockImplementation(async (_path: string, opts?: { body?: Record<string, unknown> }) => {
    if (opts?.body) stored = { ...stored, ...opts.body } as ReturnType<typeof album>;
    return { ...stored };
  });
});
describe("one Gallery POST/PATCH then exact GET, owner + epoch", () => {
  it("create POST includes name and visibility, follows one exact album GET before confirmed", async () => {
    const result = await saveAlbumAndReadback(params());
    expect(result.status).toBe("confirmed");
    expect(m.wire).toHaveBeenCalledTimes(2);
    expect(m.wire.mock.calls[0][0]).toBe("albums");
    expect(m.wire.mock.calls[0][1]).toEqual({
      method: "POST",
      body: { name: "Новое", isVisible: false },
      requestGuard: expect.any(Function),
    });
    expect(m.wire.mock.calls[1][0]).toBe("albums/album1");
    expect(m.wire.mock.calls[1][1].requestGuard()).toBe(true);
  });
  it("rename PATCH sends ONLY changed name and exact readback", async () => {
    const original = album();
    const result = await saveAlbumAndReadback({
      ...params(original),
      draft: { name: "Псы", isVisible: true },
    });
    expect(result.status).toBe("confirmed");
    expect(m.wire.mock.calls[0][0]).toBe("albums/album1");
    expect(m.wire.mock.calls[0][1]).toEqual({
      method: "PATCH",
      body: { name: "Псы" },
      requestGuard: expect.any(Function),
    });
  });
  it("unchanged PATCH is no-op without HTTP", async () => {
    expect(albumChangedFields(album(), { name: " Собаки ", isVisible: true })).toEqual({});
    expect(
      await saveAlbumAndReadback({
        ...params(album()),
        draft: { name: " Собаки ", isVisible: true },
      }),
    ).toEqual({ status: "unchanged" });
    expect(m.wire).not.toHaveBeenCalled();
  });
  it("empty or excessive name, foreign album ID, and missing owner all block request", async () => {
    expect(
      (await saveAlbumAndReadback({ ...params(), draft: { name: " ", isVisible: true } })).status,
    ).toBe("invalid");
    expect(
      (
        await saveAlbumAndReadback({
          ...params(),
          draft: { name: "x".repeat(121), isVisible: true },
        })
      ).status,
    ).toBe("invalid");
    expect((await saveAlbumAndReadback(params({ ...album(), ownerId: "B" }))).status).toBe(
      "invalid",
    );
    expect(m.wire).not.toHaveBeenCalled();
  });
  it("lost POST ACK network failure returns UNKNOWN; never issues implicit repeat", async () => {
    m.wire.mockRejectedValueOnce(new Error("private signed URL ?X-Amz-Signature=secret"));
    const result = await saveAlbumAndReadback(params());
    expect(result).toEqual({ status: "unknown" });
    expect(m.wire).toHaveBeenCalledTimes(1);
  });
  it("structured VALIDATION proves rejection without readback; unknown 5xx does not", async () => {
    m.wire.mockRejectedValueOnce(Object.assign(new Error("private key"), { code: "VALIDATION" }));
    expect((await saveAlbumAndReadback(params())).status).toBe("rejected");
    expect(m.wire).toHaveBeenCalledOnce();
    m.wire.mockClear();
    m.wire.mockRejectedValueOnce(Object.assign(new Error("private"), { code: "SERVER_ERROR" }));
    expect((await saveAlbumAndReadback(params())).status).toBe("unknown");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("positive ACK but stale GET means UNKNOWN, never success", async () => {
    m.wire.mockImplementationOnce(async () => ({ ...album(), name: "Новое", isVisible: false }));
    m.wire.mockImplementationOnce(async () => ({ ...album(), name: "Собаки", isVisible: true }));
    expect((await saveAlbumAndReadback(params())).status).toBe("unknown");
    expect(m.wire).toHaveBeenCalledTimes(2);
  });
  it("positive ACK for wrong owner is UNKNOWN; no GET with foreign ID", async () => {
    m.wire.mockResolvedValueOnce({ ...album(), ownerId: "B" });
    expect((await saveAlbumAndReadback(params())).status).toBe("unknown");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("A->B->A E2 during delayed POST aborts further readback, no result success", async () => {
    const d = pending<ReturnType<typeof album>>();
    m.wire.mockReturnValueOnce(d.promise);
    const task = saveAlbumAndReadback(params());
    await vi.waitFor(() => expect(m.wire).toHaveBeenCalledOnce());
    const guard = m.wire.mock.calls[0][1].requestGuard as () => boolean;
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    expect(guard()).toBe(false);
    d.resolve({ ...album(), name: "Новое", isVisible: false });
    expect((await task).status).toBe("stale");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("logout after POST ACK but before GET prevents confirming old write", async () => {
    const d = pending<ReturnType<typeof album>>();
    m.wire.mockImplementationOnce(async () => ({ ...album(), name: "Новое", isVisible: false }));
    m.wire.mockReturnValueOnce(d.promise);
    const task = saveAlbumAndReadback(params());
    await vi.waitFor(() => expect(m.wire).toHaveBeenCalledTimes(2));
    m.authed = false;
    expect(m.wire.mock.calls[1][1].requestGuard()).toBe(false);
    d.resolve({ ...album(), name: "Новое", isVisible: false });
    expect((await task).status).toBe("stale");
  });
});

describe("original Mobile Gallery change cover PUT→GET owner/epoch boundary",()=>{
  const args = () => ({
    actor:actor(), ownerUsername:"alice",album:album(),photoId:"photo-1",live:()=>true,
  });
  const covered = () => ({...album(),coverPhotoId:"photo-1"});
  it("one registered PUT with no 401 replay then one owner-scoped GET proves actual cover",async()=>{
    m.wire.mockResolvedValueOnce(covered()).mockResolvedValueOnce(covered());
    const result=await setAlbumCoverAndReadback(args());
    expect(result).toMatchObject({status:"confirmed",album:{id:"album1",coverPhotoId:"photo-1"}});
    expect(m.wire).toHaveBeenCalledTimes(2);
    expect(m.wire.mock.calls[0]).toEqual(["albums/album1/cover",{
      method:"PUT",body:{photoId:"photo-1"},requestGuard:expect.any(Function),
      skipAuthRefreshReplay:true,
    }]);
    expect(m.wire.mock.calls[0][1].requestGuard()).toBe(true);
    expect(m.wire.mock.calls[1][0]).toBe("albums/album1");
    expect(m.wire.mock.calls[1][1].requestGuard()).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("foreign album, impossible photo ID and denied editing send ZERO mutation",async()=>{
    expect((await setAlbumCoverAndReadback({...args(),album:{...album(),ownerId:"B"}})).status)
      .toBe("invalid");
    expect((await setAlbumCoverAndReadback({...args(),album:{...album(),canEdit:false}})).status)
      .toBe("invalid");
    expect((await setAlbumCoverAndReadback({...args(),photoId:"../other"})).status)
      .toBe("invalid");
    expect(m.wire).not.toHaveBeenCalled();
  });
  it("not authenticated before PUT means stale with zero requests",async()=>{
    m.authed=false;
    expect((await setAlbumCoverAndReadback(args())).status).toBe("stale");
    expect(m.wire).not.toHaveBeenCalled();
  });
  it("lost unknown PUT ACK never retries, never claims cover updated or logs raw provider secret",async()=>{
    m.wire.mockRejectedValueOnce(Error("PRIVATE_SIGNED_S3_SECRET"));
    expect((await setAlbumCoverAndReadback(args())).status).toBe("unknown");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("HTTP200 wrong owner or different cover is unknown and never opens foreign GET",async()=>{
    m.wire.mockResolvedValueOnce({...covered(),ownerId:"B"});
    expect((await setAlbumCoverAndReadback(args())).status).toBe("unknown");
    expect(m.wire).toHaveBeenCalledOnce();
    m.wire.mockReset().mockResolvedValueOnce({...covered(),coverPhotoId:"other"});
    expect((await setAlbumCoverAndReadback(args())).status).toBe("unknown");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("ack cover matches but original fresh GET is stale: never show success",async()=>{
    m.wire.mockResolvedValueOnce(covered()).mockResolvedValueOnce(album());
    expect((await setAlbumCoverAndReadback(args())).status).toBe("unknown");
    expect(m.wire).toHaveBeenCalledTimes(2);
  });
  it("actor epoch changes while awaiting PUT: no further owner GET or state success",async()=>{
    const hold=pending<ReturnType<typeof covered>>();m.wire.mockReturnValueOnce(hold.promise);
    const promise=setAlbumCoverAndReadback(args());
    await vi.waitFor(()=>expect(m.wire).toHaveBeenCalledOnce());
    m.owner="B";m.epoch="B1";m.owner="A";m.epoch="E2";
    expect(m.wire.mock.calls[0][1].requestGuard()).toBe(false);
    hold.resolve(covered());
    expect((await promise).status).toBe("stale");
    expect(m.wire).toHaveBeenCalledOnce();
  });
  it("actor logout during owner GET after original PUT ACK cannot confirm old cover",async()=>{
    const hold=pending<ReturnType<typeof covered>>();
    m.wire.mockResolvedValueOnce(covered()).mockReturnValueOnce(hold.promise);
    const promise=setAlbumCoverAndReadback(args());
    await vi.waitFor(()=>expect(m.wire).toHaveBeenCalledTimes(2));
    m.authed=false;
    expect(m.wire.mock.calls[1][1].requestGuard()).toBe(false);
    hold.resolve(covered());
    expect((await promise).status).toBe("stale");
  });
  it("definitive gallery validation rejection is not an unknown successful write",async()=>{
    m.wire.mockRejectedValueOnce(Object.assign(Error("PRIVATE_DETAIL"),{code:"VALIDATION"}));
    expect((await setAlbumCoverAndReadback(args())).status).toBe("rejected");
    expect(m.wire).toHaveBeenCalledOnce();
  });
});
