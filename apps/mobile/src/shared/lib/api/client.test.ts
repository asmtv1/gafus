import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteItemAsyncMock,
  getItemAsyncMock,
  reportClientErrorMock,
  setItemAsyncMock,
  breadcrumbMock,
} = vi.hoisted(() => ({
  deleteItemAsyncMock: vi.fn(),
  getItemAsyncMock: vi.fn(),
  reportClientErrorMock: vi.fn(),
  setItemAsyncMock: vi.fn(),
  breadcrumbMock: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: deleteItemAsyncMock,
  getItemAsync: getItemAsyncMock,
  setItemAsync: setItemAsyncMock,
}));

vi.mock("expo-application", () => ({
  nativeApplicationVersion: "1.7.0",
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://api.test",
  NETWORK_TIMEOUTS: { request: 20_000 },
}));

vi.mock("@/shared/lib/tracer", () => ({
  addTracerBreadcrumb: breadcrumbMock,
  reportClientError: reportClientErrorMock,
}));

import { apiClient } from "./client";

function makeResponse(status: number, body: unknown = { success: false }): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("apiClient auth refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemAsyncMock.mockImplementation(async (key: string) => {
      if (key === "auth_token") return "access-token";
      if (key === "refresh_token") return "refresh-token";
      return null;
    });
  });

  it("returns timeout instead of expiring the session when refresh is aborted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockRejectedValueOnce(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient("/api/v1/user/profile");

    expect(result).toMatchObject({
      success: false,
      code: "REQUEST_TIMEOUT",
    });
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.test/api/v1/user/profile",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Client-Platform": "ios",
          "X-Client-Version": "1.7.0",
        }),
      }),
    );
  });
});

describe("apiClient rate limits", () => {
  it("recognizes a plain-text 429 without treating it as invalid JSON or expiring auth", async () => {
    vi.clearAllMocks();
    getItemAsyncMock.mockResolvedValue("access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: vi.fn().mockResolvedValue("Too many requests, please try again later."),
      }),
    );
    const result = await apiClient("/api/v1/gallery/albums");
    expect(result).toMatchObject({ success: false, code: "RATE_LIMITED" });
    expect(result.error).toContain("Подождите");
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });
});

describe("AG3 G1 native Bearer compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemAsyncMock.mockImplementation(async (key: string) =>
      key === "auth_token" ? "expired-access" : "native-refresh",
    );
  });

  it("five simultaneous 401 responses share one SecureStore refresh request", async () => {
    let accessToken = "expired-access";
    getItemAsyncMock.mockImplementation(async (key: string) =>
      key === "auth_token" ? accessToken : "native-refresh",
    );
    setItemAsyncMock.mockImplementation(async (key: string, value: string) => {
      if (key === "auth_token") accessToken = value;
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/v1/auth/refresh")) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return makeResponse(200, {
          success: true,
          data: { accessToken: "renewed-access", refreshToken: "renewed-refresh" },
        });
      }
      const headers = init?.headers as Record<string, string>;
      return headers.Authorization === "Bearer expired-access"
        ? makeResponse(401, { success: false, code: "UNAUTHORIZED" })
        : makeResponse(200, { success: true, data: { id: "USER_A" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => apiClient<{ id: string }>("/api/v1/auth/me")),
    );

    expect(responses).toEqual(
      Array.from({ length: 5 }, () => ({
        success: true,
        data: { id: "USER_A" },
      })),
    );
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
  });

  it("a transient 503 on refresh never removes native credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(makeResponse(401))
        .mockResolvedValueOnce(makeResponse(503, { success: false, code: "UNAVAILABLE" })),
    );

    await expect(apiClient("/api/v1/auth/me")).resolves.toMatchObject({
      success: false,
      code: "AUTH_REFRESH_UNAVAILABLE",
    });
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
  });

  it("a new token rejected by the endpoint must not trigger an infinite refresh loop", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(
        makeResponse(200, {
          success: true,
          data: { accessToken: "new-access", refreshToken: "new-refresh" },
        }),
      )
      .mockResolvedValueOnce(makeResponse(401, { success: false, code: "UNAUTHORIZED" }))
      .mockRejectedValueOnce(new Error("Unexpected fourth fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient("/api/v1/auth/me");

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      caseName: "missing refresh token",
      data: { accessToken: "new-access" },
    },
    {
      caseName: "missing access token",
      data: { refreshToken: "new-refresh" },
    },
    {
      caseName: "blank access token",
      data: { accessToken: "  ", refreshToken: "new-refresh" },
    },
    {
      caseName: "blank refresh token",
      data: { accessToken: "new-access", refreshToken: "  " },
    },
  ])("rejects a 200 refresh with $caseName without changing SecureStore", async ({ data }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(200, { success: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient("/api/v1/auth/me")).resolves.toMatchObject({
      success: false,
      code: "AUTH_REFRESH_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setItemAsyncMock).not.toHaveBeenCalled();
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
  });

  it("preserves credentials when refresh returns a non-object success payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(200, { success: true, data: "invalid" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient("/api/v1/auth/me")).resolves.toMatchObject({
      success: false,
      code: "AUTH_REFRESH_UNAVAILABLE",
    });
    expect(setItemAsyncMock).not.toHaveBeenCalled();
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
  });
});

describe("G05 POST actor fence across 401 refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemAsyncMock.mockImplementation(async (key: string) =>
      key === "auth_token" ? "initial-token" : "refresh-token",
    );
  });
  it("reuses exact JSON body once after refresh, never automatic retry on unknown outcome", async () => {
    const body = {
      name: "Бим",
      birthDate: "2020-02-29",
      weightKg: 4.25,
      clientRequestId: "8ae52e9a-580f-4ab8-9545-397973bc32f5",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(
        makeResponse(200, {
          success: true,
          data: { accessToken: "new-token", refreshToken: "new-refresh" },
        }),
      )
      .mockResolvedValueOnce(makeResponse(201, { success: true, data: { id: "pet" } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await apiClient("/api/v1/pets", {
      method: "POST",
      body,
      requestGuard: () => true,
    });
    expect(result.success).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify(body));
    expect(fetcher.mock.calls[2][1].body).toBe(JSON.stringify(body));
    expect(fetcher.mock.calls[2][1].headers).not.toHaveProperty("Idempotency-Key");
  });
  it("blocks second POST after successful refresh if owner/epoch changed", async () => {
    let actorValid = true;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockImplementationOnce(async () => {
        actorValid = false;
        return makeResponse(200, {
          success: true,
          data: { accessToken: "new-token", refreshToken: "new-refresh" },
        });
      });
    vi.stubGlobal("fetch", fetcher);
    const result = await apiClient("/api/v1/pets", {
      method: "POST",
      body: { clientRequestId: "8ae52e9a-580f-4ab8-9545-397973bc32f5" },
      requestGuard: () => actorValid,
    });
    expect(result.code).toBe("G05_SESSION_CHANGED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("AG3 V40 PET_VALIDATION_ERROR HTTP 400 fieldErrors adapter", () => {
  it("preserves only stable field codes from top-level Hono 400 into details", async () => {
    vi.clearAllMocks();
    getItemAsyncMock.mockResolvedValue("access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeResponse(400, {
          success: false,
          code: "PET_VALIDATION_ERROR",
          error: "Некорректные поля",
          fieldErrors: {
            heightCm: "OUT_OF_RANGE",
            neckGirthCm: "NOT_NULLABLE",
            weightKg: "UNSUPPORTED_FIELD",
            privateToken: "X-Amz-Signature=SECRET",
            bellyGirthCm: "private raw string",
          },
        }),
      ),
    );
    const value = await apiClient("/api/v1/pets/pet-A", {
      method: "PUT",
      body: { heightCm: null },
    });
    expect(value).toMatchObject({
      success: false,
      code: "PET_VALIDATION_ERROR",
      details: {
        fieldErrors: {
          heightCm: "OUT_OF_RANGE",
          neckGirthCm: "NOT_NULLABLE",
          weightKg: "UNSUPPORTED_FIELD",
        },
      },
    });
    expect(JSON.stringify(value.details)).not.toContain("SECRET");
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
  });
});

describe("AG3 V45 vet structured HTTP 400", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemAsyncMock.mockResolvedValue("access-token");
  });
  it("only whitelisted field/codes travel through generic API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeResponse(400, {
          success: false,
          code: "VET_VISIT_VALIDATION_ERROR",
          fieldErrors: {
            specialty: "REQUIRED",
            notes: "OUT_OF_RANGE",
            ownerSecret: "X-Amz-Signature=SECRET",
            clinic: "Private text",
          },
        }),
      ),
    );
    const response = await apiClient("/api/v1/pets/pet-A/vet-visits", {
      method: "POST",
      body: { visitedOn: "2026-10-18", specialty: "Врач" },
    });
    expect(response.details).toEqual({
      fieldErrors: { specialty: "REQUIRED", notes: "OUT_OF_RANGE" },
    });
    expect(JSON.stringify(response.details)).not.toContain("SECRET");
  });
  it("invalid JSON is transported as precommit body code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeResponse(400, {
          success: false,
          code: "VET_VISIT_INVALID_JSON",
          fieldErrors: { body: "INVALID_JSON" },
        }),
      ),
    );
    const response = await apiClient("/api/v1/pets/pet-A/vet-visits", { method: "POST", body: {} });
    expect(response.details).toEqual({ fieldErrors: { body: "INVALID_JSON" } });
  });
});

describe("AG3 V45 private vet endpoint telemetry redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemAsyncMock.mockResolvedValue("access-token");
  });
  it("metadata-only read breadcrumb never contains private pet or visit ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse(404, { success: false, code: "VET_VISIT_NOT_FOUND" })),
    );
    await apiClient("/api/v1/pets/petPRIVATE/vet-visits/visitPRIVATE");
    expect(JSON.stringify(breadcrumbMock.mock.calls)).not.toContain("petPRIVATE");
    expect(JSON.stringify(breadcrumbMock.mock.calls)).not.toContain("visitPRIVATE");
    expect(JSON.stringify(breadcrumbMock.mock.calls)).toContain(":petId");
  });
  it("invalid server JSON cannot leak medical response preview into tracer or returned error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "",
        text: vi.fn().mockResolvedValue("medical=PRIVATE_DIAGNOSIS_TOKEN X-Amz-Signature=PRIVATE"),
      }),
    );
    const response = await apiClient("/api/v1/pets/petPRIVATE/vet-visits/visitPRIVATE", {
      method: "PUT",
      body: {},
    });
    expect(response.code).toBe("INVALID_RESPONSE");
    expect(JSON.stringify(reportClientErrorMock.mock.calls)).not.toContain(
      "PRIVATE_DIAGNOSIS_TOKEN",
    );
    expect(JSON.stringify(reportClientErrorMock.mock.calls)).not.toContain("petPRIVATE");
    expect(JSON.stringify(breadcrumbMock.mock.calls)).not.toContain("petPRIVATE");
    expect(JSON.stringify(response)).not.toContain("PRIVATE_DIAGNOSIS_TOKEN");
  });
});
