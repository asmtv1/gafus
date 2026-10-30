/** Actual Hono pet and document handlers must never log raw Core/S3 errors. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  photo: vi.fn(),
  documents: vi.fn(),
  upload: vi.fn(),
  rename: vi.fn(),
  removeDocument: vi.fn(),
  download: vi.fn(),
  logger: vi.fn(),
}));
vi.mock("@gafus/core/services/pets", () => ({
  getUserPets: m.list,
  getPetById: m.get,
  createPet: m.create,
  updatePet: m.update,
  deletePet: m.remove,
  updatePetPhoto: m.photo,
  listPetDocuments: m.documents,
  uploadPetDocument: m.upload,
  renamePetDocument: m.rename,
  deletePetDocument: m.removeDocument,
  preparePetDocumentDownload: m.download,
  getPetWeightHistory: vi.fn(),
  addPetWeightEntry: vi.fn(),
  deletePetWeightEntry: vi.fn(),
  setPetTargetWeight: vi.fn(),
}));
// Actual GET list/detail composition imports the lightweight petRead boundary,
// not the mutation-oriented pets barrel. Keep both mocks aligned with Hono.
vi.mock("@gafus/core/services/petRead", () => ({
  getUserPets: m.list,
  getPetById: m.get,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.logger }),
}));

import { petsRoutes } from "./pets";

const CANARY = "SYNTHETIC_S3_SIGNED_DOWNLOAD_SECRET_DO_NOT_LOG";
const PET = "/api/v1/pets/pet-A";
const DOC = `${PET}/documents/doc-A`;

function app() {
  const h = new Hono();
  h.use("/api/v1/pets/*", async (c, next) => {
    c.set("user", { id: "actor-A", username: "fixture", role: "USER" });
    await next();
  });
  h.route("/api/v1/pets", petsRoutes);
  return h;
}

function json(method: string, path: string, body?: unknown) {
  return app().request(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
  });
}

function fileUpload(path: string, type: string) {
  const form = new FormData();
  // Photo path validates MIME signature and current ownership BEFORE calling Core.
  const contents = type === "image/jpeg"
    ? new Uint8Array([0xff, 0xd8, 0xff, 0x00])
    : new TextEncoder().encode("fixture");
  form.append("file", new Blob([contents], { type }), "synthetic-file");
  return app().request(path, { method: "POST", body: form });
}

function noRawErrorInLog() {
  expect(m.logger).toHaveBeenCalledTimes(1);
  const serialized = m.logger.mock.calls
    .flat()
    .map((x) =>
      x instanceof Error ? [x.message, x.stack, String(x.cause)].join(" ") : JSON.stringify(x),
    )
    .join(" ");
  expect(serialized).not.toContain(CANARY);
}

beforeEach(() => vi.resetAllMocks());

describe("AG1 pet routes and signed document metadata: private error logging (Core mocked)", () => {
  const cases = [
    { operation: "list", fn: m.list, invoke: () => json("GET", "/api/v1/pets") },
    {
      operation: "create",
      fn: m.create,
      invoke: () =>
        json("POST", "/api/v1/pets", {
          name: "Rex",
          type: "DOG",
          breed: "Mixed",
          birthDate: "2020-01-01",
        }),
    },
    { operation: "detail", fn: m.get, invoke: () => json("GET", PET) },
    { operation: "photo", fn: m.photo, invoke: () => fileUpload(`${PET}/photo`, "image/jpeg") },
    { operation: "document list", fn: m.documents, invoke: () => json("GET", `${PET}/documents`) },
    {
      operation: "document upload",
      fn: m.upload,
      invoke: () => fileUpload(`${PET}/documents`, "application/pdf"),
    },
    { operation: "document delete", fn: m.removeDocument, invoke: () => json("DELETE", DOC) },
    {
      operation: "document rename",
      fn: m.rename,
      invoke: () => json("PUT", DOC, { name: "renamed.pdf" }),
    },
    { operation: "signed download", fn: m.download, invoke: () => json("GET", `${DOC}/download`) },
    { operation: "pet update", fn: m.update, invoke: () => json("PUT", PET, { name: "Rex" }) },
    { operation: "pet delete", fn: m.remove, invoke: () => json("DELETE", PET) },
  ];
  for (const { operation, fn, invoke } of cases) {
    it(`${operation} preserves client-safe 500 but not raw Error in logger`, async () => {
      fn.mockRejectedValueOnce(new Error(CANARY));
      if (operation === "photo") {
        m.get.mockResolvedValueOnce({ id: "pet-A" });
      }
      const response = await invoke();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain(CANARY);
      noRawErrorInLog();
    });
  }

  it("ordinary pet list forwards verified actor and throwOnError=true unchanged", async () => {
    const pets = [{ id: "pet-A", birthDate: new Date("2020-02-03T00:00:00.000Z") }];
    m.list.mockResolvedValueOnce(pets);
    const response = await json("GET", "/api/v1/pets");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      success: true,
      data: [{ id: "pet-A", birthDate: "2020-02-03T00:00:00.000Z" }],
    });
    expect(m.list).toHaveBeenCalledExactlyOnceWith("actor-A", { throwOnError: true });
    expect(m.logger).not.toHaveBeenCalled();
  });

  it("ordinary pet detail retains original petId/actor order and private 200", async () => {
    const pet = { id: "pet-A", birthDate: new Date("2020-02-03T00:00:00.000Z") };
    m.get.mockResolvedValueOnce(pet);
    const response = await json("GET", PET);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      success: true,
      data: { id: "pet-A", birthDate: "2020-02-03T00:00:00.000Z" },
    });
    expect(m.get).toHaveBeenCalledExactlyOnceWith("pet-A", "actor-A");
    expect(m.logger).not.toHaveBeenCalled();
  });

  it("ordinary pet detail missing stays private 404 without a log", async () => {
    m.get.mockResolvedValueOnce(null);
    const response = await json("GET", PET);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ success: false, error: "Питомец не найден" });
    expect(m.get).toHaveBeenCalledExactlyOnceWith("pet-A", "actor-A");
    expect(m.logger).not.toHaveBeenCalled();
  });

  it("signed-download success retains ephemeral DTO and is not logged", async () => {
    m.download.mockResolvedValueOnce({
      documentId: "doc-A",
      downloadUrl: "https://synthetic.invalid",
    });
    const response = await json("GET", `${DOC}/download`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { documentId: "doc-A", downloadUrl: "https://synthetic.invalid" },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(m.logger).not.toHaveBeenCalled();
  });

  it("known document business 404 is unchanged and does not log", async () => {
    m.documents.mockRejectedValueOnce(new Error("Питомец не найден"));
    const response = await json("GET", `${PET}/documents`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false, code: "PET_NOT_FOUND" });
    expect(m.logger).not.toHaveBeenCalled();
  });
});
