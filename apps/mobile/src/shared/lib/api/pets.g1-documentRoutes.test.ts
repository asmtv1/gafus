import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  multipart: vi.fn(),
  regular: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({ getItemAsync: mocks.token }));
vi.mock("@/shared/config", () => ({ API_BASE_URL: "https://fixture.invalid" }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.reportClientError }));
vi.mock("./client", () => ({
  apiClient: mocks.regular,
  apiClientMultipart: mocks.multipart,
}));

import { petsApi } from "./pets";

describe("AG3-PROFILE-031 pet document ID route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.regular.mockResolvedValue({ success: true, data: [] });
  });

  it("encodes a pet ID as exactly one path segment for private document listing", async () => {
    const result = { success: true, data: [{ id: "document-1" }] };
    mocks.regular.mockResolvedValueOnce(result);

    await expect(petsApi.getDocuments("pet /? #")).resolves.toBe(result);

    expect(mocks.regular).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/pets/pet%20%2F%3F%20%23/documents",
    );
    expect(mocks.multipart).not.toHaveBeenCalled();
  });

  it("encodes both pet and document IDs before document DELETE, with no request body", async () => {
    const result = { success: true };
    mocks.regular.mockResolvedValueOnce(result);

    await expect(petsApi.deleteDocument("pet/owner?x=1", "doc/#? 2")).resolves.toBe(result);

    expect(mocks.regular).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/pets/pet%2Fowner%3Fx%3D1/documents/doc%2F%23%3F%202",
      { method: "DELETE" },
    );
    expect(mocks.multipart).not.toHaveBeenCalled();
  });

  it("encodes both IDs on rename PUT and preserves the exact user-supplied document name", async () => {
    const result = { success: true, data: { id: "document-1", name: "Медкарта 2026" } };
    mocks.regular.mockResolvedValueOnce(result);

    await expect(petsApi.renameDocument("pet/#?", "doc/?# 2026", "Медкарта 2026")).resolves.toBe(
      result,
    );

    expect(mocks.regular).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/pets/pet%2F%23%3F/documents/doc%2F%3F%23%202026",
      { method: "PUT", body: { name: "Медкарта 2026" } },
    );
  });

  it("keeps the existing endpoint/method behavior for ordinary UUID-like IDs", async () => {
    await petsApi.getDocuments("pet-123");
    await petsApi.renameDocument("pet-123", "doc-456", "Запись");
    await petsApi.deleteDocument("pet-123", "doc-456");

    expect(mocks.regular.mock.calls).toEqual([
      ["/api/v1/pets/pet-123/documents"],
      ["/api/v1/pets/pet-123/documents/doc-456", { method: "PUT", body: { name: "Запись" } }],
      ["/api/v1/pets/pet-123/documents/doc-456", { method: "DELETE" }],
    ]);
    expect(mocks.multipart).not.toHaveBeenCalled();
  });

  it("passes through private list 403/404 API responses without inventing owner access", async () => {
    for (const code of ["FORBIDDEN", "NOT_FOUND"]) {
      const failure = { success: false, code, error: "Нет доступа к документам" };
      mocks.regular.mockResolvedValueOnce(failure);
      await expect(petsApi.getDocuments("pet-123")).resolves.toBe(failure);
    }
    expect(mocks.regular).toHaveBeenCalledTimes(2);
  });

  it("preserves document-not-found DELETE and does not retry a destructive operation", async () => {
    const failure = {
      success: false,
      code: "DOCUMENT_NOT_FOUND",
      error: "Документ не найден",
    };
    mocks.regular.mockResolvedValueOnce(failure);

    await expect(petsApi.deleteDocument("pet-123", "doc-456")).resolves.toBe(failure);

    expect(mocks.regular).toHaveBeenCalledOnce();
    expect(mocks.multipart).not.toHaveBeenCalled();
  });

  it("returns rename owner/validation rejection unchanged, without multipart retry", async () => {
    const failure = { success: false, code: "FORBIDDEN", error: "Недоступно" };
    mocks.regular.mockResolvedValueOnce(failure);

    await expect(petsApi.renameDocument("pet-123", "doc-456", "Новое")).resolves.toBe(failure);

    expect(mocks.regular).toHaveBeenCalledOnce();
    expect(mocks.multipart).not.toHaveBeenCalled();
  });

  it("reports and rethrows network transport failures instead of masking them", async () => {
    const transportError = new Error("Network is unavailable");
    mocks.regular.mockRejectedValueOnce(transportError);

    await expect(petsApi.getDocuments("pet-123")).rejects.toBe(transportError);

    expect(mocks.reportClientError).toHaveBeenCalledExactlyOnceWith(
      transportError,
      expect.objectContaining({
        issueKey: "PetsApi",
        keys: { operation: "get_documents" },
      }),
    );
    expect(mocks.regular).toHaveBeenCalledOnce();
  });
});
