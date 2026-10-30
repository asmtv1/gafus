import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secureToken: vi.fn(),
  multipart: vi.fn(),
  regular: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: mocks.secureToken,
}));
vi.mock("./client", () => ({
  apiClient: mocks.regular,
  apiClientMultipart: mocks.multipart,
}));

import { userApi } from "./user";

class NativeFormDataFixture {
  readonly fields: { name: string; value: unknown }[] = [];

  append(name: string, value: unknown): void {
    this.fields.push({ name, value });
  }
}

describe("AG3-PROFILE-031 avatar native multipart transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.secureToken.mockResolvedValue("native-access");
    mocks.multipart.mockResolvedValue({
      success: true,
      data: { avatarUrl: "https://fixture.invalid/avatar.png" },
    });
    vi.stubGlobal("FormData", NativeFormDataFixture);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { avatarUrl: "raw-url" } }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the no-credentials guard and does not invoke the upload transport", async () => {
    mocks.secureToken.mockResolvedValue(null);

    await expect(
      userApi.uploadAvatar("file:///avatar.jpg", "image/jpeg", "avatar.jpg"),
    ).resolves.toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
    expect(mocks.multipart).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("delegates to the shared multipart client and creates a fresh native FormData for retry", async () => {
    const result = await userApi.uploadAvatar("file:///avatar.jpg", "image/jpeg", "avatar.jpg");

    expect(result).toEqual({
      success: true,
      data: { avatarUrl: "https://fixture.invalid/avatar.png" },
    });
    expect(mocks.multipart).toHaveBeenCalledOnce();
    expect(mocks.multipart).toHaveBeenCalledWith("/api/v1/user/avatar", expect.any(Function));
    const build = mocks.multipart.mock.calls[0]?.[1] as () => NativeFormDataFixture;
    const first = build();
    const second = build();
    expect(first).not.toBe(second);
    expect(first.fields).toEqual([
      {
        name: "file",
        value: { uri: "file:///avatar.jpg", type: "image/jpeg", name: "avatar.jpg" },
      },
    ]);
    expect(second.fields).toEqual(first.fields);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["REQUEST_TIMEOUT", "NETWORK_ERROR", "INVALID_RESPONSE"])(
    "preserves normalized %s error from the shared native upload transport",
    async (code) => {
      mocks.multipart.mockResolvedValue({ success: false, code, error: "Ошибка загрузки" });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected direct fetch")));

      await expect(
        userApi.uploadAvatar("file:///avatar.jpg", "image/jpeg", "avatar.jpg"),
      ).resolves.toEqual({
        success: false,
        code,
        error: "Ошибка загрузки",
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.multipart).toHaveBeenCalledOnce();
    },
  );
});
