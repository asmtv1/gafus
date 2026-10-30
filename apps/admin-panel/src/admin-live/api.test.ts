import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminHttpError, getAdminActor, loginAdmin, logoutAdmin, requestAdmin } from "./api";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const success = (data?: unknown, status = 200) => ({
  ok: true,
  status,
  json: async () => ({ success: true, data }),
});
const fail = (status: number, code = "FORBIDDEN") => ({
  ok: false,
  status,
  json: async () => ({ success: false, code, error: "private" }),
});

describe("cookie-only admin API boundary", () => {
  it("always sends same-origin HttpOnly cookie transport, without bearer/localStorage", async () => {
    fetchMock.mockResolvedValueOnce(success({ count: 3 }));
    expect(await requestAdmin<{ count: number }>("/api/v1/admin/mail/alerts")).toEqual({
      count: 3,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/mail/alerts",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-Gafus-Auth-Transport": "cookie",
        },
      }),
    );
  });

  it("preserves exact POST/JSON for a real administrator change", async () => {
    fetchMock.mockResolvedValueOnce(success(undefined));
    await requestAdmin("/api/v1/admin/feature-flags", {
      method: "PUT",
      body: { revision: 3, review: {} },
    });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("include");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ revision: 3, review: {} });
  });

  it.each([
    "https://host.test/api/v1/admin/users",
    "//other.test/api/v1/admin/users",
    "/api/v1/admin/users/%2fother",
    "/api/v1/admin/users/%5c..",
    "/api/v1/admin/users/%00",
    "/admin/users",
    "/api/v1/auth/me#x",
  ])("rejects untrusted URL %s before fetch", async (path) => {
    await expect(requestAdmin(path)).rejects.toThrow("Только относительные пути");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps revoked or missing session to a 401 error, not a fake success", async () => {
    fetchMock.mockResolvedValueOnce(fail(401, "UNAUTHORIZED"));
    await expect(requestAdmin("/api/v1/admin/users")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("maps stale config error into a readable 409", async () => {
    fetchMock.mockResolvedValueOnce(fail(409, "STALE_CONFIG"));
    await expect(requestAdmin("/api/v1/admin/feature-flags")).rejects.toMatchObject({
      status: 409,
      code: "STALE_CONFIG",
    });
  });

  it("login performs real cookie POST and uses server role response", async () => {
    fetchMock.mockResolvedValueOnce(
      success({
        user: { id: "staff-1", username: "staff", role: "ADMIN" },
      }),
    );
    expect(await loginAdmin("staff", "password")).toEqual({
      id: "staff-1",
      username: "staff",
      role: "ADMIN",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username: "staff",
      password: "password",
    });
  });

  it("restores session with one refresh and /me retry", async () => {
    const user = { id: "staff-1", username: "staff", role: "ADMIN" };
    fetchMock
      .mockResolvedValueOnce(fail(401))
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(success(user));
    expect(await getAdminActor()).toEqual(user);
    expect(fetchMock.mock.calls.map((x) => x[0])).toEqual([
      "/api/v1/auth/me",
      "/api/v1/auth/refresh",
      "/api/v1/auth/me",
    ]);
  });

  it("does not treat a database or network error as logout", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(getAdminActor()).rejects.toThrow("Network unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("logout requires the server to confirm cookie revocation", async () => {
    fetchMock.mockResolvedValueOnce(fail(503, "DATABASE_DOWN"));
    await expect(logoutAdmin()).rejects.toBeInstanceOf(AdminHttpError);
  });
});
