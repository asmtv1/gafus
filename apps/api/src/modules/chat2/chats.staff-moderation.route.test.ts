import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mock = vi.hoisted(() => ({
  staffList: vi.fn(), staffResolve: vi.fn(), roomList: vi.fn(), roomResolve: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findFirst: vi.fn() } } }));
vi.mock("./service.js", () => ({
  Chat2Error: class Chat2Error extends Error {
    constructor(public code: string, public status: number, message: string) { super(message); }
  },
  listStaffChatReports: mock.staffList,
  resolveStaffChatReport: mock.staffResolve,
  listChatReports: mock.roomList,
  resolveChatReport: mock.roomResolve,
}));
vi.mock("./realtime.js", () => ({
  connectToken: vi.fn(),
}));
import { chatsRoutes } from "../../routes/v1/chats";

const app = new Hono();
app.use("*", async (c, next) => {
  c.set("user", { id: "staff-id", username: "staff", role: "ADMIN" });
  await next();
});
app.route("/api/v1/chats", chatsRoutes);
const base = "http://localhost/api/v1/chats";
beforeEach(() => {
  vi.clearAllMocks();
  mock.staffList.mockResolvedValue([]);
  mock.staffResolve.mockResolvedValue({ done: true });
  mock.roomList.mockResolvedValue([]);
  mock.roomResolve.mockResolvedValue({ done: true });
});

describe("staff moderation route precedence and actor scoping", () => {
  it("dispatches the global queue to staff handler, never a room id called moderation", async () => {
    const response = await app.request(`${base}/moderation/reports`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [] });
    expect(mock.staffList).toHaveBeenCalledExactlyOnceWith("staff-id");
    expect(mock.roomList).not.toHaveBeenCalled();
  });
  it("preserves room-specific moderation endpoints for group owners", async () => {
    const roomQueue = await app.request(`${base}/group-one/reports`);
    expect(roomQueue.status).toBe(200);
    expect(mock.roomList).toHaveBeenCalledExactlyOnceWith("staff-id", "group-one");
    expect(mock.staffList).not.toHaveBeenCalled();
    const resolved = await app.request(`${base}/group-one/reports/report-one/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    });
    expect(resolved.status).toBe(200);
    expect(mock.roomResolve).toHaveBeenCalledExactlyOnceWith(
      "staff-id", "group-one", "report-one", "REJECTED",
    );
    expect(mock.staffResolve).not.toHaveBeenCalled();
  });
  it("resolves a global report, never through a synthetic room", async () => {
    const response = await app.request(`${base}/moderation/reports/report-one/resolve`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RESOLVED" }),
    });
    expect(response.status).toBe(200);
    expect(mock.staffResolve).toHaveBeenCalledExactlyOnceWith("staff-id", "report-one", "RESOLVED");
    expect(mock.roomResolve).not.toHaveBeenCalled();
  });
});
