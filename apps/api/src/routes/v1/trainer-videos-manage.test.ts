import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createTrainerVideosManageRoutes, type TrainerVideosManagePorts,
} from "./trainer-videos-manage";
const id = "cm1rtx5qq00024ph6y2swjp43";
function setup(role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" = "TRAINER") {
  const ports = {
    rename: vi.fn(async (): Promise<{success?: boolean; error?: string}> => ({ success: true })),
  } satisfies TrainerVideosManagePorts;
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer-owner", role, username: "trainer" });
    await next();
  });
  app.route("/videos/manage", createTrainerVideosManageRoutes(ports));
  const request = (body: unknown, extra = "") => app.request(
    "/videos/manage/" + id + "/name" + extra, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { request, ports };
}
describe("trainer video metadata rename owner boundary", () => {
  it("passes current authenticated trainer as owner to existing Core rename", async () => {
    const { request, ports } = setup();
    const res = await request({ displayName: " Урок сидеть " });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(ports.rename).toHaveBeenCalledWith(id, "trainer-owner", "Урок сидеть");
  });
  it("supports clearing name and retains existing Core owner check even for admin", async () => {
    const { request, ports } = setup("ADMIN");
    expect((await request({ displayName: null })).status).toBe(200);
    expect(ports.rename).toHaveBeenCalledWith(id, "trainer-owner", null);
  });
  it("rejects moderator/user and client owner override", async () => {
    for (const role of ["MODERATOR", "USER"] as const) {
      const { request, ports } = setup(role);
      expect((await request({ displayName: "new" })).status).toBe(403);
      expect(ports.rename).not.toHaveBeenCalled();
    }
    const { request, ports } = setup();
    expect((await request({ displayName: "new", trainerId: "foreign" })).status).toBe(400);
    expect((await request({ displayName: "new" }, "?trainerId=foreign")).status).toBe(400);
    expect((await request({ displayName: "x".repeat(256) })).status).toBe(400);
    expect(ports.rename).not.toHaveBeenCalled();
  });
  it("does not claim success for denied Core update or provider failure", async () => {
    const { request, ports } = setup();
    ports.rename.mockResolvedValueOnce({ success: false, error: "PRIVATE" });
    let response = await request({ displayName: "different" });
    expect(response.status).toBe(409);
    expect((await response.text())).not.toContain("PRIVATE");
    ports.rename.mockRejectedValueOnce(Error("SECRET"));
    response = await request({ displayName: "different" });
    expect(response.status).toBe(500);
    expect((await response.text())).not.toContain("SECRET");
  });
});
