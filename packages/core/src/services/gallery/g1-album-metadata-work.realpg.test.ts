/** Gallery album metadata Core + permanent local WORK PG18; zero provider I/O. */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { createGalleryService } from "./service";
import type { GalleryStoragePort } from "./ports";

const enabled = process.env.AG1_GALLERY_ALBUM_WORK_PG === "1" ? describe : describe.skip;
const prefix = "ag1_album_work_20261025_" + randomBytes(5).toString("hex");
const owner = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
const users = [owner, viewer, outsider];
const names = users.map((id, index) => prefix + "_" + index);
let privateId = "",
  publicId = "",
  initialAlbumCount = 0;
const remote = vi.hoisted(() => ({ presign: vi.fn(), head: vi.fn(), sign: vi.fn() }));
const storage: GalleryStoragePort = {
  enabled: true, // ONLY this directly injected Core test; server Gallery remains disabled.
  presignPost: remote.presign.mockImplementation(async () => {
    throw Error("NO_REAL_S3_PROVIDER");
  }),
  head: remote.head.mockImplementation(async () => {
    throw Error("NO_REAL_S3_PROVIDER");
  }),
  signCdn: remote.sign.mockImplementation(async () => {
    throw Error("NO_REAL_CDN_PROVIDER");
  }),
};
const gallery = createGalleryService({ db: prisma, storage });
async function cleanup() {
  await prisma.galleryStorageJob.deleteMany({ where: { ownerId: { in: users } } });
  for (let i = 0; i < users.length; i++) {
    const found = await prisma.user.findUnique({
      where: { id: users[i] },
      select: { username: true },
    });
    if (found?.username === names[i] && found.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: users[i] } });
  }
}
enabled("Album owner/public/private metadata uses actual WORK PG without provider", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.port !== "55921" ||
      u.pathname !== "/gafus_refactor_real_work_20261024"
    )
      throw Error("REFUSE_NON_WORK_DB");
    const meta = await prisma.$queryRaw<{ db: string; version: string }[]>`
    SELECT current_database() AS db,current_setting('server_version_num') AS version`;
    expect(meta).toEqual([{ db: "gafus_refactor_real_work_20261024", version: "180004" }]);
    initialAlbumCount = await prisma.galleryAlbum.count();
    await prisma.user.createMany({
      data: users.map((id, i) => ({
        id,
        username: names[i],
        password: "not-login-fixture",
        registrationPending: false,
        role: "USER" as const,
      })),
    });
  }, 30000);
  afterAll(async () => {
    await cleanup();
    expect(await prisma.galleryAlbum.count()).toBe(initialAlbumCount);
    expect(remote.presign).not.toHaveBeenCalled();
    expect(remote.head).not.toHaveBeenCalled();
    expect(remote.sign).not.toHaveBeenCalled();
    await prisma.$disconnect();
  }, 30000);
  it("GET profile album list is read-only, no implicit default album", async () => {
    const first = await gallery.listAlbums(owner, { username: names[0] });
    expect(first.items).toEqual([]);
    expect(first.enabled).toBe(true);
    expect(await prisma.galleryAlbum.count({ where: { ownerId: owner } })).toBe(0);
    await expect(
      gallery.listAlbums(viewer, { username: "does-not-exist-" + prefix }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("owner creates public and private albums, physical PostgreSQL readback, visibility list", async () => {
    const a = await gallery.createAlbum(owner, {
      name: "AG1 Открытый альбом",
      description: "Тестовый альбом",
      isVisible: true,
    });
    publicId = a.id;
    const p = await gallery.createAlbum(owner, {
      name: "AG1 Только я",
      description: "Не для посторонних",
      isVisible: false,
    });
    privateId = p.id;
    expect(a.ownerId).toBe(owner);
    expect(p.isVisible).toBe(false);
    const rows = await prisma.galleryAlbum.findMany({ where: { ownerId: owner, deletedAt: null } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toContain("AG1 Только я");
    const ownerList = await gallery.listAlbums(owner, { username: names[0] });
    expect(ownerList.isOwner).toBe(true);
    expect(ownerList.items.map((a) => a.id)).toEqual(expect.arrayContaining([publicId, privateId]));
    const viewerList = await gallery.listAlbums(viewer, { username: names[0] });
    expect(viewerList.isOwner).toBe(false);
    expect(viewerList.items.map((a) => a.id)).toEqual([publicId]);
    expect((await gallery.listAlbums(outsider, { username: names[0] })).items).toHaveLength(1);
  });
  it("private album cannot be read/updated by another user; public album permits read", async () => {
    await expect(gallery.getAlbum(viewer, privateId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gallery.updateAlbum(viewer, publicId, { name: "stolen" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await gallery.getAlbum(viewer, publicId)).canEdit).toBe(false);
    expect((await gallery.getAlbum(owner, privateId)).canEdit).toBe(true);
    const sql = await prisma.galleryAlbum.findUnique({ where: { id: publicId } });
    expect(sql?.name).toBe("AG1 Открытый альбом");
  });
  it("owner updates hidden/public toggles, invalid empty patch no SQL changes", async () => {
    const update = await gallery.updateAlbum(owner, privateId, {
      name: "AG1 Теперь всем",
      isVisible: true,
      description: "Можно просматривать",
    });
    expect(update.name).toBe("AG1 Теперь всем");
    expect(
      (await gallery.listAlbums(viewer, { username: names[0] })).items.map((i) => i.id),
    ).toEqual(expect.arrayContaining([privateId, publicId]));
    await expect(gallery.updateAlbum(owner, privateId, {})).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await prisma.galleryAlbum.findUnique({ where: { id: privateId } }))?.description).toBe(
      "Можно просматривать",
    );
    const hidden = await gallery.updateAlbum(owner, privateId, { isVisible: false });
    expect(hidden.isVisible).toBe(false);
    expect(
      (await gallery.listAlbums(viewer, { username: names[0] })).items.map((i) => i.id),
    ).toEqual([publicId]);
  });
  it("nonowner cannot delete, owner soft-deletes and listed/access removed", async () => {
    await expect(gallery.deleteAlbum(viewer, publicId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const removed = await gallery.deleteAlbum(owner, publicId);
    expect(removed).toEqual({ id: publicId });
    const sql = await prisma.galleryAlbum.findUnique({ where: { id: publicId } });
    expect(sql?.deletedAt).toBeInstanceOf(Date);
    expect(
      (await gallery.listAlbums(owner, { username: names[0] })).items.map((i) => i.id),
    ).not.toContain(publicId);
    await expect(gallery.getAlbum(viewer, publicId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
