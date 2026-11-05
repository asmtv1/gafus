/** G16: real Hono Gallery wrapper + real bounded dispatcher, offline injected
 * Core service and identity shim. NOT real DB ownership/Redis/Cloud/S3 proof.
 * Seven bounded GAL cases. Captures are actual Hono Response objects.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Derive this test's repository checkout, both on Mac and GitHub Linux.
// Never fall back to any other local repository or a fixed absolute path.
const R = path.resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const CAP = `${R}/apps/api/.g16-gallery-ag1-isolated-20261017/captures`;
// Only test-owned, synthetic Hono response captures are created here.
// Refuse symlinked paths and any request to write outside the Refactor root.
beforeAll(() => {
  if (fs.realpathSync(R) !== R ||
      !fs.existsSync(path.join(R, "apps/api/package.json")) ||
      !fs.existsSync(path.join(R, "packages/core/package.json")))
    throw Error("GALLERY_TEST_DENIED_ROOT");
  for (const path of [
    `${R}/apps`,
    `${R}/apps/api`,
    `${R}/apps/api/.g16-gallery-ag1-isolated-20261017`,
    CAP,
  ]) {
    if (fs.existsSync(path) && fs.lstatSync(path).isSymbolicLink()) {
      throw Error("GALLERY_TEST_DENIED_SYMLINK");
    }
  }
  fs.mkdirSync(CAP, { recursive: true, mode: 0o700 });
});

const A = "ownerA";
const B = "viewerB";
const albumId = "album-private-1";
const photoId = "photo-1";
const uploadId = "upload-1";
const reqId = "3d0e22a4-1342-4f9e-96ad-d8ac77f27c5b";
const retryId = "ed8de167-e3e8-4336-b2d0-5541aa0340ba";

const mocks = vi.hoisted(() => ({ service: vi.fn(), enqueue: vi.fn() }));
vi.mock("@gafus/core/services/gallery", async () => {
  const schema = await import("../../../../../packages/core/src/services/gallery/schemas");
  const { GalleryError } = await import("../../../../../packages/core/src/services/gallery/errors");
  return { ...schema, GalleryError, createCurrentGalleryService: () => ({}) };
});
vi.mock("@gafus/queues", () => ({
  connection: { status: "disconnected" },
  enqueueGalleryProcessing: vi.fn(),
}));
vi.mock("@gafus/gallery-storage", () => ({
  createGalleryStorageFromEnv: () => ({ enabled: false }),
  signGalleryCloudruFallback: vi.fn(),
}));
vi.mock("@gafus/gallery-storage/hmac", () => ({
  INTERNAL_GALLERY_PATHS: [],
  createGalleryRequestVerifier: () => async () => false,
}));
const injectedService = new Proxy(
  {},
  {
    get:
      (_target, method: string) =>
      (...args: unknown[]) =>
        mocks.service(method, ...args),
  },
);
vi.mock("@gafus/gallery-server", async () => {
  const dispatch = await import("../../../../../packages/gallery-server/src/index");
  return {
    GALLERY_MAX_BODY_BYTES: dispatch.GALLERY_MAX_BODY_BYTES,
    galleryHttpError: dispatch.galleryHttpError,
    dispatchGalleryRequest: (actor: string, request: Request, path: string) =>
      dispatch.dispatchGalleryRequest(
        actor,
        request,
        path,
        injectedService as never,
      ),
  };
});

import { GalleryError } from "../../../../../packages/core/src/services/gallery/errors";
import { galleryRoutes } from "./gallery.js";

const createAlbum = () => ({
  id: albumId,
  ownerId: A,
  ownerUsername: "ownerA",
  name: "Собаки",
  description: null,
  isVisible: false,
  coverPhotoId: null,
  coverDisplayPhotoId: null,
  coverThumbUrl: null,
  urlsExpireAt: null,
  photoCount: 0,
  createdAt: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
  canEdit: true,
});
const fakePhoto = () => ({
  id: photoId,
  albumId,
  status: "ready",
  caption: null,
  uploadId: null,
  errorCode: null,
  errorMessage: null,
  thumbUrl: "https://mock.example/thumb?expires=short",
  fullUrl: "https://mock.example/full?expires=short",
  urlsExpireAt: "2026-10-16T00:05:00.000Z",
  expiresAt: null,
  width: 640,
  height: 480,
  createdAt: "2026-10-16T00:00:00.000Z",
  canEdit: true,
});
const upload = (status: string) => ({
  uploadId,
  albumId,
  status,
  postUrl: status === "reserved" ? "https://mock.example/presigned-post" : null,
  postFields: status === "reserved" ? { key: "private-test-only" } : null,
  expiresAt: status === "reserved" ? "2026-10-16T00:10:00.000Z" : null,
  reservationExpiresAt: "2026-10-16T00:15:00.000Z",
  photo: { ...fakePhoto(), status: "pending", thumbUrl: null, fullUrl: null, urlsExpireAt: null },
});
function app() {
  const x = new Hono();
  // This is a controlled actor injection, NOT production JWT middleware.
  x.use("*", async (c, next) => {
    const auth = c.req.header("Authorization");
    if (auth === "Bearer A") c.set("user" as never, { id: A } as never);
    if (auth === "Bearer B") c.set("user" as never, { id: B } as never);
    await next();
  });
  x.route("/api/v1/gallery", galleryRoutes);
  return x;
}
async function call(
  id: string,
  method: string,
  path: string,
  actor: "A" | "B" | null,
  options?: { raw?: string; contentType?: string },
) {
  const headers: Record<string, string> = {};
  if (actor) headers.Authorization = `Bearer ${actor}`;
  if (options?.raw !== undefined)
    headers["content-type"] = options.contentType ?? "application/json";
  const response = await app().request(`http://gallery.invalid/api/v1/gallery${path}`, {
    method,
    headers,
    body: options?.raw,
  });
  const text = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const capture = {
    id,
    origin: "EXECUTED_REAL_HONO_GALLERY_ROUTE_REAL_DISPATCHER_WITH_INJECTED_CORE_NO_DATABASE",
    request: {
      method,
      path,
      principal: actor,
      rawBody: options?.raw ?? null,
      contentType: options?.contentType ?? (options?.raw !== undefined ? "application/json" : null),
    },
    status: response.status,
    headers: responseHeaders,
    bodyText: text,
    bodyJson: JSON.parse(text),
  };
  if (!/^GAL-\d{2}-[a-zA-Z0-9_-]+$/.test(id)) throw Error("GALLERY_TEST_DENIED_CAPTURE_NAME");
  const output = `${CAP}/${id}.json`;
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw Error("GALLERY_TEST_DENIED_CAPTURE_SYMLINK");
  }
  fs.writeFileSync(output, JSON.stringify(capture, null, 2) + "\n");
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(text).not.toContain("PRODUCTION_SECRET");
  return capture;
}
const post = (id: string, path: string, actor: "A" | "B" | null, data: unknown) =>
  call(id, "POST", path, actor, { raw: JSON.stringify(data) });
const patch = (id: string, path: string, actor: "A" | "B" | null, data: unknown) =>
  call(id, "PATCH", path, actor, { raw: JSON.stringify(data) });
const del = (id: string, path: string, actor: "A" | "B" | null, data: unknown = {}) =>
  call(id, "DELETE", path, actor, { raw: JSON.stringify(data) });

beforeEach(() => {
  mocks.service.mockReset();
  mocks.enqueue.mockReset();
  vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "false");
  vi.stubEnv("GALLERY_PROCESSOR_READY", "false");
  vi.stubEnv("GALLERY_MEDIA_FALLBACK_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AG1 G16 bounded Gallery: GAL-01..07 actual Hono+dispatcher response fixtures", () => {
  it("GAL-01 owner list empty+nonempty pagination, guest401, foreign private excluded by injected Core", async () => {
    mocks.service.mockImplementation(async (name: string, actor: string, _input: unknown) => {
      if (name === "listPhotos")
        return {
          items: actor === A ? [fakePhoto()] : [],
          nextCursor: null,
          usedSlots: actor === A ? 1 : 0,
          limit: 200,
          isOwner: actor === A,
          enabled: true,
        };
      expect(name).toBe("listAlbums");
      if (actor === A)
        return {
          items: [createAlbum()],
          nextCursor: "next-token",
          usedSlots: 1,
          limit: 200,
          isOwner: true,
          enabled: true,
        };
      return {
        items: [],
        nextCursor: null,
        usedSlots: 0,
        limit: 200,
        isOwner: false,
        enabled: true,
      };
    });
    const guest = await call("GAL-01-guest-401", "GET", "/profiles/ownerA/albums", null);
    expect(guest.status).toBe(401);
    expect(guest.bodyJson.code).toBe("UNAUTHORIZED");
    const own = await call("GAL-01-owner-200", "GET", "/profiles/ownerA/albums?pageSize=20", "A");
    expect(own.status).toBe(200);
    expect(own.bodyJson.data.items[0].id).toBe(albumId);
    const foreign = await call(
      "GAL-01-foreign-private-200",
      "GET",
      "/profiles/ownerA/albums?pageSize=20",
      "B",
    );
    expect(foreign.status).toBe(200);
    expect(foreign.bodyJson.data.items).toEqual([]);
    const q = mocks.service.mock.calls.at(-1)?.[2];
    expect(q).toMatchObject({ username: "ownerA", pageSize: 20 });
    const photos = await call(
      "GAL-01-owner-photos-200",
      "GET",
      `/albums/${albumId}/photos?pageSize=20`,
      "A",
    );
    expect(photos.status).toBe(200);
    expect(photos.bodyJson.data.items[0].id).toBe(photoId);
    const hiddenPhotos = await call(
      "GAL-01-viewer-photos-empty-200",
      "GET",
      `/albums/${albumId}/photos?pageSize=20`,
      "B",
    );
    expect(hiddenPhotos.status).toBe(200);
    expect(hiddenPhotos.bodyJson.data.items).toEqual([]);
  });
  it("GAL-02 create/patch/cover bounded allowed methods; empty patch and wrong verb 400/405", async () => {
    mocks.service.mockImplementation(async (name: string, actor: string) => {
      expect(actor).toBe(A);
      return createAlbum();
    });
    const created = await post("GAL-02-create-200", "/albums", "A", {
      name: "Собаки",
      isVisible: false,
    });
    expect(created.status).toBe(200);
    expect(
      (
        await patch("GAL-02-patch-200", `/albums/${albumId}`, "A", {
          description: "Новое описание",
        })
      ).status,
    ).toBe(200);
    const cover = await call("GAL-02-cover-200", "PUT", `/albums/${albumId}/cover`, "A", {
      raw: JSON.stringify({ photoId }),
    });
    expect(cover.status).toBe(200);
    const empty = await patch("GAL-02-empty-patch-400", `/albums/${albumId}`, "A", {});
    expect(empty.status).toBe(400);
    expect(empty.bodyJson.code).toBe("VALIDATION");
    const wrong = await call("GAL-02-wrong-method-405", "PUT", "/albums", "A", { raw: "{}" });
    expect(wrong.status).toBe(405);
    expect(wrong.bodyJson.code).toBe("METHOD_NOT_ALLOWED");
  });
  it("GAL-03 distinct reserve/complete/retry ACK, same UUID replay, changed UUID conflict injected Core", async () => {
    let reserved = false;
    let retried = false;
    mocks.service.mockImplementation(
      async (
        name: string,
        actor: string,
        _idOrInput: unknown,
        input?: { clientRequestId?: string },
      ) => {
        expect(actor).toBe(A);
        if (name === "reserveClientUpload") {
          reserved = true;
          return upload("reserved");
        }
        if (name === "cancelUpload") return upload("cancelled");
        if (name === "confirmClientUpload") {
          expect(reserved).toBe(true);
          return upload("ready");
        }
        if (name === "getUpload") return upload(retried ? "failed" : "uploaded");
        if (name === "retryUpload") {
          if (retried && input?.clientRequestId !== retryId)
            throw new GalleryError("REQUEST_CONFLICT", "Повторная загрузка уже создана", 409);
          retried = true;
          return { ...upload("reserved"), uploadId: "retry-upload-2" };
        }
        throw Error(`UNEXPECTED_CORE_METHOD ${name}`);
      },
    );
    const request = {
      albumId,
      filename: "dog.webp",
      declaredMime: "image/webp",
      declaredBytes: 1234,
      clientRequestId: reqId,
    };
    const r = await post("GAL-03-reserve-200", "/uploads/client-reserve", "A", request);
    expect(r.status).toBe(200);
    expect(r.bodyJson.data.status).toBe("reserved");
    const pathReserve = await post(
      "GAL-03-album-upload-reserve-200",
      "/uploads/client-reserve",
      "A",
      request,
    );
    expect(pathReserve.status).toBe(200);
    const confirm = await post("GAL-03-complete-200", `/uploads/${uploadId}/client-complete`, "A", {});
    expect(confirm.status).toBe(200);
    expect(confirm.bodyJson.data.status).toBe("ready");
    expect(confirm.bodyJson.data.status).not.toBe("uploaded");
    const status = await call("GAL-03-status-200", "GET", `/uploads/${uploadId}`, "A");
    expect(status.status).toBe(200);
    const again = await post("GAL-03-retry-200", `/uploads/${uploadId}/retry`, "A", {
      clientRequestId: retryId,
    });
    expect(again.status).toBe(200);
    const same = await post("GAL-03-retry-same-id-200", `/uploads/${uploadId}/retry`, "A", {
      clientRequestId: retryId,
    });
    expect(same.status).toBe(200);
    expect(same.bodyJson.data.uploadId).toBe(again.bodyJson.data.uploadId);
    const conflict = await post(
      "GAL-03-retry-different-id-409",
      `/uploads/${uploadId}/retry`,
      "A",
      { clientRequestId: "3f7331fb-df9f-49b2-9da4-b7a3f420a155" },
    );
    expect(conflict.status).toBe(409);
    expect(conflict.bodyJson.code).toBe("REQUEST_CONFLICT");
    const cancelled = await del("GAL-03-cancel-200", `/uploads/${uploadId}`, "A", {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.bodyJson.data.status).toBe("cancelled");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("GAL-04 bad mime/declared bytes/body 16KiB/content type, no Core calls", async () => {
    const base = { albumId, filename: "dog.webp", declaredBytes: 20, clientRequestId: reqId };
    const badMime = await post("GAL-04-invalid-mime-400", "/uploads/client-reserve", "A", {
      ...base,
      declaredMime: "image/gif",
    });
    expect(badMime.status).toBe(400);
    const tooMany = await post("GAL-04-declared-bytes-400", "/uploads/client-reserve", "A", {
      ...base,
      declaredBytes: 10 * 1024 * 1024 + 1,
      declaredMime: "image/webp",
    });
    expect(tooMany.status).toBe(400);
    const tooLarge = await call("GAL-04-body-413", "POST", "/albums", "A", {
      raw: JSON.stringify({ name: "X".repeat(17_000) }),
    });
    expect(tooLarge.status).toBe(413);
    const wrongType = await call("GAL-04-content-type-415", "POST", "/albums", "A", {
      raw: "{}",
      contentType: "text/plain",
    });
    expect(wrongType.status).toBe(415);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("GAL-05 signed url expiry and cover replacement DTO only mock; disabled fallback 404", async () => {
    mocks.service.mockImplementation(async (name: string) => {
      if (name === "getPhoto") return fakePhoto();
      if (name === "updatePhoto") return { ...fakePhoto(), caption: "Новая подпись" };
      if (name === "movePhoto")
        return { jobId: "move-job-1", photo: { ...fakePhoto(), status: "moving" } };
      if (name === "setCover")
        return {
          ...createAlbum(),
          coverPhotoId: photoId,
          coverDisplayPhotoId: photoId,
          coverThumbUrl: "https://mock.example/new-cover?expires=short",
          urlsExpireAt: "2026-10-16T00:05:00.000Z",
          photoCount: 1,
        };
      throw new Error("NOT_MOCKED");
    });
    const photo = await call("GAL-05-photo-200", "GET", `/photos/${photoId}`, "A");
    expect(photo.status).toBe(200);
    expect(photo.bodyJson.data.urlsExpireAt).toBeTruthy();
    const cover = await call("GAL-05-replace-cover-200", "PUT", `/albums/${albumId}/cover`, "A", {
      raw: JSON.stringify({ photoId }),
    });
    expect(cover.status).toBe(200);
    expect(cover.bodyJson.data.coverDisplayPhotoId).toBe(photoId);
    const updated = await patch("GAL-05-update-photo-200", `/photos/${photoId}`, "A", {
      caption: "Новая подпись",
    });
    expect(updated.status).toBe(200);
    expect(updated.bodyJson.data.caption).toBe("Новая подпись");
    const moved = await post("GAL-05-move-photo-200", `/photos/${photoId}/move`, "A", {
      albumId,
      clientRequestId: reqId,
    });
    expect(moved.status).toBe(200);
    expect(moved.bodyJson.data.jobId).toBe("move-job-1");
    const fallback = await post(
      "GAL-05-fallback-disabled-404",
      `/photos/${photoId}/fallback`,
      "A",
      { variant: "full" },
    );
    expect(fallback.status).toBe(404);
    expect(fallback.bodyText).not.toContain("private-test-only");
  });
  it("GAL-06 A-to-B ownership switch prevents B private edit/delete/signed url, injected Core denial", async () => {
    mocks.service.mockImplementation(async (name: string, actor: string) => {
      if (actor === B) {
        if (name === "updateAlbum")
          throw new GalleryError("FORBIDDEN", "Изменять альбом может только владелец", 403);
        throw new GalleryError("NOT_FOUND", "Медиа недоступно", 404);
      }
      if (name === "getAlbum") return createAlbum();
      if (name === "getPhoto") return fakePhoto();
      if (name === "deletePhoto") return { id: photoId };
      throw Error("UNEXPECTED_METHOD");
    });
    expect((await call("GAL-06-A-private-200", "GET", `/albums/${albumId}`, "A")).status).toBe(200);
    const bRead = await call("GAL-06-B-read-404", "GET", `/albums/${albumId}`, "B");
    expect(bRead.status).toBe(404);
    expect(bRead.bodyText).not.toContain("mock.example");
    const bWrite = await del("GAL-06-B-delete-404", `/photos/${photoId}`, "B");
    expect(bWrite.status).toBe(404);
    const bEdit = await patch("GAL-06-B-public-edit-403", `/albums/${albumId}`, "B", {
      name: "Попытка изменить",
    });
    expect(bEdit.status).toBe(403);
    expect(bEdit.bodyJson.code).toBe("FORBIDDEN");
    const aRead = await call("GAL-06-A-photo-200", "GET", `/photos/${photoId}`, "A");
    expect(aRead.status).toBe(200);
  });
  it("GAL-07 delete true ack, replay 404, unknown action 404, wrong method405, fake throttle429 and unexpected500", async () => {
    let deleted = false;
    mocks.service.mockImplementation(async (name: string) => {
      if (name === "deleteAlbum") {
        if (deleted) throw new GalleryError("NOT_FOUND", "Альбом не найден", 404);
        deleted = true;
        return { id: albumId };
      }
      if (name === "getAlbum")
        throw new GalleryError("RATE_LIMITED", "Слишком много запросов", 429);
      if (name === "getUpload")
        throw new GalleryError("GALLERY_DISABLED", "Галерея временно недоступна", 503);
      if (name === "deletePhoto") return { id: photoId };
      if (name === "getPhoto") throw Error("SIMULATED_DB_FAILURE_PRODUCTION_SECRET");
      throw Error(`UNEXPECTED ${name}`);
    });
    const success = await del("GAL-07-delete-200", `/albums/${albumId}`, "A");
    expect(success.status).toBe(200);
    expect(success.bodyJson.data).toEqual({ id: albumId });
    const twice = await del("GAL-07-repeat-delete-404", `/albums/${albumId}`, "A");
    expect(twice.status).toBe(404);
    const deletedPhoto = await del("GAL-07-delete-photo-200", `/photos/${photoId}`, "A", {});
    expect(deletedPhoto.status).toBe(200);
    expect(deletedPhoto.bodyJson.data).toEqual({ id: photoId });
    const unknown = await call("GAL-07-unknown-action-404", "GET", "/unknown", "A");
    expect(unknown.status).toBe(404);
    const method = await call("GAL-07-bad-verb-405", "PUT", "/photos/photo-1", "A", { raw: "{}" });
    expect(method.status).toBe(405);
    const throttled = await call("GAL-07-core-throttle-429", "GET", `/albums/${albumId}`, "A");
    expect(throttled.status).toBe(429);
    const disabled = await call("GAL-07-gallery-disabled-503", "GET", `/uploads/${uploadId}`, "A");
    expect(disabled.status).toBe(503);
    expect(disabled.bodyJson.code).toBe("GALLERY_DISABLED");
    const failure = await call("GAL-07-unexpected-500", "GET", `/photos/${photoId}`, "A");
    expect(failure.status).toBe(500);
    expect(failure.bodyText).not.toContain("SIMULATED_DB_FAILURE_PRODUCTION_SECRET");
  });
});
