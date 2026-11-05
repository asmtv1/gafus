import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  apiClientMultipart: vi.fn(),
}));

vi.mock("./client", () => ({
  apiClient: mocks.apiClient,
  apiClientMultipart: mocks.apiClientMultipart,
}));
// The photo pipeline uses static imports in native Expo 55 (no secondary HMR
// bundles). An error-code transport test must not initialize native codecs.
vi.mock("@/shared/lib/media/prepareUploadWebp", () => ({
  prepareUploadWebpVariants: vi.fn(),
}));
vi.mock("@/shared/lib/media/directPhotoUpload", () => ({
  postClientWebp: vi.fn(),
}));

import { questionsApi } from "./questions";

type ApiError = Error & { code?: string; details?: Record<string, unknown> };

describe("AG3-SOC-032 questions native transport error contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["FORBIDDEN", "Нет доступа", { role: "MODERATOR" }],
    ["NOT_FOUND", "Вопрос не найден", { resource: "question" }],
    ["VERSION_CONFLICT", "Ответ уже изменён", { currentVersion: 4 }],
    ["RATE_LIMITED", "Слишком много запросов", { retryAfterSec: 12 }],
  ])(
    "preserves machine %s and details for question list failures",
    async (code, message, details) => {
      mocks.apiClient.mockResolvedValueOnce({ success: false, code, details, error: message });
      const actual = await questionsApi.list().catch((error: unknown) => error);

      expect(actual).toBeInstanceOf(Error);
      const failure = actual as ApiError;
      expect(failure.message).toBe(message);
      expect(failure.code).toBe(code);
      expect(failure.details).toEqual(details);
      expect(mocks.apiClient).toHaveBeenCalledExactlyOnceWith("/api/v1/questions?", {
        suppressSubscriptionPaywall: true,
      });
    },
  );

  it("preserves the same conflict code on answer mutation, without retry", async () => {
    mocks.apiClient.mockResolvedValueOnce({
      success: false,
      code: "VERSION_CONFLICT",
      details: { version: 5 },
      error: "Ответ устарел",
    });
    const actual = await questionsApi
      .answer("question-1", {
        body: "Ответ",
        photoIds: [],
        clientRequestId: "ag3-answer-1",
      })
      .catch((error: unknown) => error);

    const failure = actual as ApiError;
    expect(failure.message).toBe("Ответ устарел");
    expect(failure.code).toBe("VERSION_CONFLICT");
    expect(failure.details).toEqual({ version: 5 });
    expect(mocks.apiClient).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/questions/question-1/answers",
      {
        method: "POST",
        body: { body: "Ответ", photoIds: [], clientRequestId: "ag3-answer-1" },
        suppressSubscriptionPaywall: true,
      },
    );
    expect(mocks.apiClient).toHaveBeenCalledOnce();
  });

  it("preserves recoverable network code and fallback message when error text is absent", async () => {
    mocks.apiClient.mockResolvedValueOnce({
      success: false,
      code: "NETWORK_ERROR",
    });
    await expect(questionsApi.list()).rejects.toMatchObject({
      message: "Не удалось выполнить запрос",
      code: "NETWORK_ERROR",
    });
  });

  it("returns successful typed question list data without changing its envelope", async () => {
    const data = { items: [], nextPage: null, total: 0 };
    mocks.apiClient.mockResolvedValueOnce({ success: true, data });

    await expect(questionsApi.list({ search: "вакцина" })).resolves.toBe(data);
    expect(mocks.apiClient).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/questions?search=%D0%B2%D0%B0%D0%BA%D1%86%D0%B8%D0%BD%D0%B0",
      { suppressSubscriptionPaywall: true },
    );
  });

  it("rejects successful envelopes with missing data (existing invariant)", async () => {
    mocks.apiClient.mockResolvedValueOnce({ success: true });
    await expect(questionsApi.list()).rejects.toThrow("Не удалось выполнить запрос");
  });
});
