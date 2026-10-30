import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  loading: false,
  transport: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({ user: { id: m.owner }, isAuthenticated: m.authed, isLoading: m.loading }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/gallery", () => ({ galleryTransport: m.transport }));
import {
  privateGalleryReads,
  verifiedGalleryActor,
  sameGalleryActor,
  signedGalleryUrl,
  publicGalleryAlbum,
  publicGalleryPhoto,
  projectGalleryPage,
  galleryExpiryDelay,
} from "./privateRead";
const at = (ms: number) => new Date(ms).toISOString();
const album = () => ({
  id: "album",
  ownerId: "A",
  ownerUsername: "alice",
  name: "Album",
  description: null,
  isVisible: false,
  coverPhotoId: "photo",
  coverThumbUrl: "https://cdn.example/?sig=SECRET",
  urlsExpireAt: at(100_000),
  photoCount: 1,
  createdAt: at(0),
  updatedAt: at(0),
  canEdit: true,
});
const photo = () => ({
  id: "photo",
  albumId: "album",
  caption: null,
  status: "ready" as const,
  thumbUrl: "https://cdn.example/thumb?sig=SECRET",
  fullUrl: "https://cdn.example/full?sig=SECRET",
  urlsExpireAt: at(100_000),
  width: 10,
  height: 10,
  createdAt: at(0),
  expiresAt: null,
  canEdit: true,
  uploadId: "secret-upload",
  errorCode: null,
  errorMessage: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.loading = false;
  m.transport.mockResolvedValue({
    items: [album()],
    nextCursor: null,
    usedSlots: 1,
    limit: 200,
    isOwner: true,
    enabled: true,
  });
});
describe("gallery owner+epoch and private signed URLs", () => {
  it("rejects logout/new epoch", () => {
    expect(verifiedGalleryActor()).toEqual({ ownerId: "A", authEpoch: "E1" });
    m.epoch = "E2";
    expect(sameGalleryActor({ ownerId: "A", authEpoch: "E1" })).toBe(false);
    m.authed = false;
    expect(verifiedGalleryActor()).toBeNull();
  });
  it("GET forwards requestGuard and no unsafe owner write", async () => {
    const a = verifiedGalleryActor()!;
    await privateGalleryReads(a).listAlbums("alice");
    expect(m.transport.mock.calls[0][1].requestGuard()).toBe(true);
    await expect(privateGalleryReads(a).createAlbum({ name: "Bad" })).rejects.toThrow(
      "GALLERY_SESSION_CHANGED",
    );
  });
  it("late A B A E2 result is stale", async () => {
    let done!: (v: unknown) => void;
    m.transport.mockImplementationOnce(() => new Promise((r) => (done = r)));
    const job = privateGalleryReads(verifiedGalleryActor()!).getAlbum("album");
    await vi.waitFor(() => expect(m.transport).toHaveBeenCalledOnce());
    const guard = m.transport.mock.calls[0][1].requestGuard;
    m.owner = "B";
    m.epoch = "B";
    m.owner = "A";
    m.epoch = "E2";
    expect(guard()).toBe(false);
    done(album());
    await expect(job).rejects.toThrow("GALLERY_SESSION_CHANGED");
  });
  it("URL expires five seconds early and rejects unsafe origins", () => {
    expect(signedGalleryUrl(album().coverThumbUrl, at(100_000), 95_000)).toBeNull();
    expect(signedGalleryUrl(album().coverThumbUrl, at(100_000), 94_000)).toBe(
      album().coverThumbUrl,
    );
    expect(signedGalleryUrl("file:///etc/passwd", at(100_000), 0)).toBeNull();
  });
  it("projection removes expired URL plus backend secret", () => {
    const a = publicGalleryAlbum(
      { ...album(), secret: "private" } as ReturnType<typeof album>,
      95_001,
    );
    const p = publicGalleryPhoto(
      { ...photo(), secret: "private" } as ReturnType<typeof photo>,
      95_001,
    );
    expect(a.coverThumbUrl).toBeNull();
    expect(p.fullUrl).toBeNull();
    expect(JSON.stringify(p)).not.toContain("secret-upload");
    expect(JSON.stringify(a)).not.toContain("secret");
  });
  it("error is not empty and earliest safe expiry scheduled", () => {
    expect(() => projectGalleryPage({} as never, "albums")).toThrow(
      "GALLERY_INVALID_LIST_RESPONSE",
    );
    expect(galleryExpiryDelay([{ urlsExpireAt: at(100_000) }], 90_000)).toBe(5000);
  });
});
