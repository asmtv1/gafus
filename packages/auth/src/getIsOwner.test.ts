import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerSession = vi.fn();
const mockAuthOptions = {};

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock("./auth", () => ({
  authOptions: mockAuthOptions,
}));

describe("getIsOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает false при пустом profileUsername", async () => {
    const { getIsOwner } = await import("./getIsOwner");
    const result = await getIsOwner("");
    expect(result).toBe(false);
  });

  it("возвращает true когда username из query совпадает (case-insensitive)", async () => {
    const { getIsOwner } = await import("./getIsOwner");
    const req = { query: { username: "TestUser" } } as unknown as Parameters<typeof getIsOwner>[1];

    const result = await getIsOwner("testuser", req);

    expect(result).toBe(true);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("возвращает false когда username из query не совпадает", async () => {
    const { getIsOwner } = await import("./getIsOwner");
    const req = { query: { username: "OtherUser" } } as unknown as Parameters<typeof getIsOwner>[1];

    const result = await getIsOwner("profileuser", req);

    expect(result).toBe(false);
  });

  it("получает username из сессии когда query нет", async () => {
    const { getIsOwner } = await import("./getIsOwner");
    mockGetServerSession.mockResolvedValue({ user: { username: "sessionuser" } });

    const result = await getIsOwner("sessionuser", undefined);

    expect(result).toBe(true);
    expect(mockGetServerSession).toHaveBeenCalledWith(mockAuthOptions);
  });

  it("обрабатывает username как массив в query", async () => {
    const { getIsOwner } = await import("./getIsOwner");
    const req = { query: { username: ["FirstValue"] } } as unknown as Parameters<typeof getIsOwner>[1];

    const result = await getIsOwner("firstvalue", req);

    expect(result).toBe(true);
  });
});
