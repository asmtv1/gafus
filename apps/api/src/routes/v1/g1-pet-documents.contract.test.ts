/** G1 documents: Hono auth and DTO contract; Core mocked, no provider I/O. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(), isRegistrationCompleted: vi.fn(),
  listPetDocuments: vi.fn(), preparePetDocumentDownload: vi.fn(),
  renamePetDocument: vi.fn(), deletePetDocument: vi.fn(), uploadPetDocument: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.verifyAccessToken }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: m.isRegistrationCompleted }));
vi.mock("@gafus/core/services/pets", async importOriginal => ({
  ...(await importOriginal<object>()),
  listPetDocuments: m.listPetDocuments,
  preparePetDocumentDownload: m.preparePetDocumentDownload,
  renamePetDocument: m.renamePetDocument,
  deletePetDocument: m.deletePetDocument,
  uploadPetDocument: m.uploadPetDocument,
}));

import { authMiddleware } from "../../middleware/auth";
import { petsRoutes } from "./pets";
const owner = { id: "user-A", username: "userA", role: "USER" } as const;
const stranger = { id: "user-B", username: "userB", role: "USER" } as const;
const root = "http://local.test/api/v1/pets/pet-A/documents";
function app() {
  const h = new Hono();
  h.use("/api/v1/pets/*", authMiddleware);
  h.route("/api/v1/pets", petsRoutes);
  return h;
}
function request(path = "", method = "GET", payload?: object) {
  return app().request(root + path, {
    method,
    headers: { authorization: "Bearer token-A", ...(payload ? { "content-type": "application/json" } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.verifyAccessToken.mockResolvedValue(owner);
  m.isRegistrationCompleted.mockResolvedValue(true);
  m.listPetDocuments.mockResolvedValue([{ id: "doc-A" }]);
  m.preparePetDocumentDownload.mockResolvedValue({ documentId: "doc-A", downloadUrl: "https://signed.invalid" });
  m.renamePetDocument.mockResolvedValue({ id: "doc-A", name: "updated.pdf" });
  m.deletePetDocument.mockResolvedValue(true);
});

describe("G1 pet document route security & DTO (mock Core)", () => {
  it("rejects anonymous download without Core", async () => {
    const r = await app().request(root + "/doc-A/download");
    expect(r.status).toBe(401);
    expect(m.preparePetDocumentDownload).not.toHaveBeenCalled();
  });
  it("rejects expired token before Core", async () => {
    m.verifyAccessToken.mockResolvedValueOnce(null);
    expect((await request("/doc-A/download")).status).toBe(401);
    expect(m.preparePetDocumentDownload).not.toHaveBeenCalled();
  });
  it("uses JWT actor for listing, ignoring forged userId", async () => {
    const r = await request("?userId=user-B");
    expect(r.status).toBe(200);
    expect(m.listPetDocuments).toHaveBeenCalledWith("pet-A", "user-A");
    expect(await r.json()).toEqual({ success: true, data: [{ id: "doc-A" }] });
  });
  it("maps missing/foreign pet to 404", async () => {
    m.listPetDocuments.mockRejectedValueOnce(new Error("Питомец не найден"));
    const r = await request();
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ success: false, code: "PET_NOT_FOUND" });
  });
  it("foreign principal cannot download another user's document", async () => {
    m.verifyAccessToken.mockResolvedValueOnce(stranger);
    m.preparePetDocumentDownload.mockResolvedValueOnce(null);
    const r = await request("/doc-A/download?userId=user-A");
    expect(r.status).toBe(404);
    expect(m.preparePetDocumentDownload).toHaveBeenCalledWith("doc-A", "user-B", "pet-A");
    expect(await r.json()).toMatchObject({ success: false, code: "DOCUMENT_NOT_FOUND" });
  });
  it("passes JWT owner to Core before returning signed link", async () => {
    const r = await request("/doc-A/download");
    expect(r.status).toBe(200);
    expect(m.preparePetDocumentDownload).toHaveBeenCalledWith("doc-A", "user-A", "pet-A");
    expect(await r.json()).toMatchObject({ success: true, data: { documentId: "doc-A" } });
  });
  it("rejects untrusted browser Origin before mutation", async () => {
    const r = await app().request(root + "/doc-A", {
      method: "PUT", headers: {
        origin: "https://attacker.invalid", cookie: "gafus_access=fake",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "forged" }),
    });
    expect(r.status).toBe(403);
    expect(m.renamePetDocument).not.toHaveBeenCalled();
  });
  it("rejects blank rename before calling Core", async () => {
    expect((await request("/doc-A", "PUT", { name: "   " })).status).toBe(400);
    expect(m.renamePetDocument).not.toHaveBeenCalled();
  });
  it("normalizes rename and preserves existing JSON DTO", async () => {
    const r = await request("/doc-A", "PUT", { name: "  updated " });
    expect(r.status).toBe(200);
    expect(m.renamePetDocument).toHaveBeenCalledWith("doc-A", "user-A", "updated", "pet-A");
    expect(await r.json()).toMatchObject({ success: true, data: { name: "updated.pdf" } });
  });
  it("foreign rename remains 404", async () => {
    m.verifyAccessToken.mockResolvedValueOnce(stranger);
    m.renamePetDocument.mockResolvedValueOnce(null);
    const r = await request("/doc-A", "PUT", { name: "forged" });
    expect(r.status).toBe(404);
    expect(m.renamePetDocument).toHaveBeenCalledWith("doc-A", "user-B", "forged", "pet-A");
  });
  it("foreign deletion remains 404 and uses JWT actor", async () => {
    m.verifyAccessToken.mockResolvedValueOnce(stranger);
    m.deletePetDocument.mockResolvedValueOnce(false);
    const r = await request("/doc-A", "DELETE");
    expect(r.status).toBe(404);
    expect(m.deletePetDocument).toHaveBeenCalledWith("doc-A", "user-B", "pet-A");
    expect(await r.json()).toMatchObject({ success: false, code: "DOCUMENT_NOT_FOUND" });
  });
  it("authorized delete preserves existing JSON", async () => {
    const r = await request("/doc-A", "DELETE");
    expect(r.status).toBe(200);
    expect(m.deletePetDocument).toHaveBeenCalledWith("doc-A", "user-A", "pet-A");
    expect(await r.json()).toEqual({ success: true });
  });
  it("rejects missing multipart file before upload", async () => {
    const r = await request("", "POST");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ success: false, code: "FILE_REQUIRED" });
    expect(m.uploadPetDocument).not.toHaveBeenCalled();
  });
  it.each([
    ["GET", ""], ["GET", "/doc-A/download"],
    ["PUT", "/doc-A"], ["DELETE", "/doc-A"], ["POST", ""],
  ] as const)("private documents %s %s use no-store regardless of status", async (method, path) => {
    const response = method === "PUT"
      ? await request(path, method, { name: "updated" })
      : await request(path, method);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("foreign document and missing pet 404 are never cached", async () => {
    m.verifyAccessToken.mockResolvedValue(stranger);
    m.preparePetDocumentDownload.mockResolvedValueOnce(null);
    const forbidden = await request("/doc-A/download");
    expect(forbidden.status).toBe(404);
    expect(forbidden.headers.get("cache-control")).toBe("private, no-store");
    m.listPetDocuments.mockRejectedValueOnce(new Error("Питомец не найден"));
    const missing = await request();
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
  });
  it("private document Core failure never caches 500 response", async () => {
    m.preparePetDocumentDownload.mockRejectedValueOnce(new Error("TEST_FAILURE"));
    const response = await request("/doc-A/download");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not expose Core secret in download 500 response", async () => {
    m.preparePetDocumentDownload.mockRejectedValueOnce(new Error("SECRET_TEST_STORAGE_TOKEN"));
    const r = await request("/doc-A/download");
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("SECRET_TEST_STORAGE_TOKEN");
  });
});
