import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createTrainerArticlesManageRoutes, type TrainerArticlesManagePorts,
} from "./trainer-articles-manage";

const articleId = "cm1rtx5qq00024ph6y2swjp43";
const fixture = {
  title: "Прогресс", contentType: "HTML" as const, content: "<p>Сидеть</p>",
  visibility: "PAID" as const, videoUrl: null, logoImg: "",
  imageUrls: ["https://media.example/p.jpg"],
  slug: "dog-progress", description: "Подробный гайд",
};
function setup(role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" | "GUEST" = "TRAINER") {
  const ports = {
    read: vi.fn(async () => ({ success: true as const, data: fixture })),
    update: vi.fn(async (): Promise<{success?: boolean; error?: string}> => ({ success: true })),
    remove: vi.fn(async (): Promise<{success?: boolean; error?: string; trainerId?: string}> => ({ success: true, trainerId: "current" })),
  } satisfies TrainerArticlesManagePorts;
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (role !== "GUEST") c.set("user", { id: "current", role, username: "staff" });
    await next();
  });
  app.route("/articles/manage", createTrainerArticlesManageRoutes(ports));
  const get = (suffix = "") => app.request("/articles/manage/" + articleId + suffix);
  const put = (body: unknown, suffix = "") => app.request(
    "/articles/manage/" + articleId + suffix, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const remove = (suffix = "") => app.request(
    "/articles/manage/" + articleId + suffix, { method: "DELETE" },
  );
  return { ports, get, put, remove };
}
describe("trainer article owner-scoped editing API", () => {
  it("reads only owner article sanitized Core fields with private no-store response", async () => {
    const { get, ports } = setup();
    const result = await get();
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    const body = await result.json() as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ ...fixture, id: articleId });
    expect(ports.read).toHaveBeenCalledWith(articleId, "current");
  });
  it("updates content and slug exclusively under verified actor, not forged owner", async () => {
    const { put, ports } = setup("ADMIN");
    expect((await put(fixture)).status).toBe(200);
    expect(ports.update).toHaveBeenCalledWith(articleId, fixture, "current");
    expect((await put({ ...fixture, authorId: "other" })).status).toBe(400);
    expect((await put({ ...fixture, slug: "Invalid Slug" })).status).toBe(400);
    expect((await put({ ...fixture, content: "" })).status).toBe(400);
    expect((await put({ ...fixture, visibility: "PAID", description: "" })).status).toBe(400);
    expect(ports.update).toHaveBeenCalledTimes(1);
  });
  it("deletes owner article without client-specified author or body", async () => {
    const { remove, ports } = setup();
    const result = await remove();
    expect(result.status).toBe(200);
    expect(ports.remove).toHaveBeenCalledWith(articleId, "current");
    expect((await remove("?authorId=other")).status).toBe(400);
    expect(ports.remove).toHaveBeenCalledTimes(1);
  });
  it("denies non-trainer roles and malformed IDs before Core access", async () => {
    for (const role of ["MODERATOR", "USER", "GUEST"] as const) {
      const { get, put, remove, ports } = setup(role);
      expect((await get()).status).toBe(403);
      expect((await put(fixture)).status).toBe(403);
      expect((await remove()).status).toBe(403);
      expect(ports.read).not.toHaveBeenCalled();
      expect(ports.update).not.toHaveBeenCalled();
    }
    const { get, ports } = setup();
    expect((await get("?owner=current")).status).toBe(400);
    expect(ports.read).not.toHaveBeenCalled();
  });
  it("does not leak author privacy or false success on Core denial or provider errors", async () => {
    const { get, put, remove, ports } = setup();
    ports.read.mockRejectedValueOnce(Error("S3_SECRET"));
    let result = await get();
    expect(result.status).toBe(500);
    expect(JSON.stringify(await result.json())).not.toContain("S3_SECRET");
    ports.update.mockResolvedValueOnce({ success: false });
    result = await put(fixture);
    expect(result.status).toBe(409);
    expect(JSON.stringify(await result.json())).not.toContain("S3_SECRET");
    ports.remove.mockRejectedValueOnce(Error("DATABASE_CONNECTION_SECRET"));
    result = await remove();
    expect(result.status).toBe(500);
    expect(JSON.stringify(await result.json())).not.toContain("DATABASE_CONNECTION_SECRET");
  });
});
