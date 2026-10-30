import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  multipart: vi.fn(),
  regular: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({ getItemAsync: mocks.token }));
vi.mock("@/shared/config", () => ({ API_BASE_URL: "https://fixture.invalid" }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("./client", () => ({
  apiClient: mocks.regular,
  apiClientMultipart: mocks.multipart,
}));

import { petsApi } from "./pets";

class NativeFormDataFixture {
  readonly fields: { name: string; value: unknown }[] = [];
  append(name: string, value: unknown): void {
    this.fields.push({ name, value });
  }
}

describe("AG3-PROFILE-031 pet photo and document shared multipart transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockResolvedValue("test-access-token");
    mocks.multipart.mockResolvedValue({ success: true, data: { id: "file-1" } });
    vi.stubGlobal("FormData", NativeFormDataFixture);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { id: "raw-fetch" } }),
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["photo", () => petsApi.uploadPhoto("pet-1", "file:///photo.jpg", "image/jpeg", "photo.jpg")],
    [
      "document",
      () =>
        petsApi.uploadDocument("pet-1", "file:///receipt.pdf", "application/pdf", "receipt.pdf"),
    ],
  ])("does not attempt %s upload without native auth credentials", async (_kind, upload) => {
    mocks.token.mockResolvedValue(null);
    const result = await upload();
    expect(result).toMatchObject({ success: false, code: "UNAUTHORIZED" });
    expect(mocks.multipart).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads a pet photo through the shared bounded multipart transport with fresh retries", async () => {
    mocks.multipart.mockResolvedValue({
      success: true,
      data: { photoUrl: "https://fixture.invalid/photo.jpg" },
    });
    const result = await petsApi.uploadPhoto(
      "pet/with space",
      "file:///photo.jpg",
      "image/jpeg",
      "photo.jpg",
    );
    expect(result).toEqual({
      success: true,
      data: { photoUrl: "https://fixture.invalid/photo.jpg" },
    });
    expect(mocks.multipart).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/pets/pet%2Fwith%20space/photo",
      expect.any(Function),
    );
    const builder = mocks.multipart.mock.calls[0]?.[1] as () => NativeFormDataFixture;
    const first = builder();
    const second = builder();
    expect(first).not.toBe(second);
    expect(first.fields).toEqual([
      {
        name: "file",
        value: { uri: "file:///photo.jpg", type: "image/jpeg", name: "photo.jpg" },
      },
    ]);
    expect(second.fields).toEqual(first.fields);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads an allowed pet document through shared multipart with new FormData on retry", async () => {
    const result = await petsApi.uploadDocument(
      "pet/with space",
      "file:///receipt.pdf",
      "application/pdf",
      "receipt.pdf",
    );
    expect(result).toEqual({ success: true, data: { id: "file-1" } });
    expect(mocks.multipart).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/pets/pet%2Fwith%20space/documents",
      expect.any(Function),
    );
    const builder = mocks.multipart.mock.calls[0]?.[1] as () => NativeFormDataFixture;
    const first = builder();
    const second = builder();
    expect(first).not.toBe(second);
    expect(first.fields).toEqual([
      {
        name: "file",
        value: { uri: "file:///receipt.pdf", type: "application/pdf", name: "receipt.pdf" },
      },
    ]);
    expect(second.fields).toEqual(first.fields);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps document MIME allowlist before constructing native multipart", async () => {
    const response = await petsApi.uploadDocument(
      "pet-1",
      "file:///payload.exe",
      "application/x-msdownload",
      "payload.exe",
    );
    expect(response).toMatchObject({ success: false, code: "INVALID_DOCUMENT_TYPE" });
    expect(mocks.multipart).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["image/jpeg", "image/png"] as const)(
    "accepts an allowed native image document MIME %s",
    async (mimeType) => {
      const result = await petsApi.uploadDocument("pet-1", "file:///scan", mimeType, "scan");
      expect(result.success).toBe(true);
      expect(mocks.multipart).toHaveBeenCalledExactlyOnceWith(
        "/api/v1/pets/pet-1/documents",
        expect.any(Function),
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["REQUEST_TIMEOUT", "NETWORK_ERROR", "INVALID_RESPONSE", "UNAUTHORIZED"])(
    "propagates normalized %s upload errors for photo and document without raw fetch",
    async (code) => {
      const error = { success: false, code, error: "Невозможно загрузить файл" };
      mocks.multipart.mockResolvedValue(error);
      const photo = await petsApi.uploadPhoto("pet-1", "file:///a.jpg", "image/jpeg", "a.jpg");
      const document = await petsApi.uploadDocument(
        "pet-1",
        "file:///a.pdf",
        "application/pdf",
        "a.pdf",
      );
      expect(photo).toEqual(error);
      expect(document).toEqual(error);
      expect(mocks.multipart).toHaveBeenCalledTimes(2);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
