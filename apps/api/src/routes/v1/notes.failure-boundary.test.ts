/** AG1 Notes READ: real Core and injected application/Hono with fault only at repository boundary. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findNotes: vi.fn(),
  error: vi.fn(),
  unsafeNotification: vi.fn(() => {
    throw new Error("NOTIFICATION_MUST_NOT_RUN");
  }),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: { trainerNote: { findMany: m.findNotes } },
}));
vi.mock("@gafus/core/services/notifications", () => ({
  createImmediatePushNotification: m.unsafeNotification,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.error, info: vi.fn(), warn: vi.fn(), success: vi.fn() }),
}));
// The package points to separately built Core dist in this repo. Bind this
// test to the *actual existing Core SOURCE*, not a mocked-success service.
// All application, composition and Hono code remains real.
vi.mock("@gafus/core/services/notes", async () => {
  const source = await import("../../../../../packages/core/src/services/notes/notesService");
  return { getStudentNotes: source.getStudentNotes };
});

import { getStudentNotes } from "../../../../../packages/core/src/services/notes/notesService";
import { notesRoutes } from "./notes";

const owner = "fictional-sensitive-owner-A";
const fixture = {
  id: "fictional-visible-note",
  title: null,
  tags: ["fictional"],
  createdAt: new Date("2026-10-23T10:00:00.000Z"),
  trainer: {
    id: "fictional-trainer",
    username: "fictional-trainer",
    profile: {
      fullName: "Fictional trainer",
      avatarUrl: null,
    },
  },
  entries: [
    {
      id: "fictional-visible-entry",
      content: "fictional visible note content",
      order: 0,
      isVisibleToStudent: true,
      createdAt: new Date("2026-10-23T10:00:00.000Z"),
      updatedAt: new Date("2026-10-23T11:00:00.000Z"),
    },
  ],
};

function app() {
  const server = new Hono();
  // Local fixture only: production auth middleware is outside this source test.
  server.use("/api/v1/notes/*", async (c, next) => {
    c.set("user", { id: owner, role: "USER", username: "fictional" });
    await next();
  });
  server.route("/api/v1/notes", notesRoutes);
  return server;
}
const request = () => app().request("/api/v1/notes/student");
const expectPrivate = (response: Response) => {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
};
const expectRepositoryOwnerProjection = () => {
  expect(m.findNotes).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      where: {
        students: { some: { studentId: owner } },
        entries: { some: { isVisibleToStudent: true } },
      },
      select: expect.objectContaining({
        id: true,
        title: true,
        tags: true,
        createdAt: true,
        entries: expect.objectContaining({
          where: { isVisibleToStudent: true },
          orderBy: { order: "asc" },
        }),
      }),
      orderBy: { createdAt: "desc" },
    }),
  );
};

describe("AG1 student notes real Core repo-failure boundary -> Hono 500", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repository outage is NOT 200 empty; safe 500 with private/no-store/no-referrer and sanitized logs", async () => {
    const marker = "SECRET_PRIVATE_NOTE_CONTENT_AND_SQL_CONNECTION_TOKEN";
    const raw = new Error(`db failed ${marker} user ${owner}`);
    raw.stack = `SQL failure stack ${marker} user ${owner}`;
    m.findNotes.mockRejectedValueOnce(raw);
    const response = await request();
    expect(response.status).toBe(500);
    expectPrivate(response);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "Внутренняя ошибка" });
    expect(JSON.stringify(body)).not.toContain(marker);
    expect(JSON.stringify(body)).not.toContain(owner);
    expectRepositoryOwnerProjection();
    expect(m.error).toHaveBeenCalledTimes(2); // Safe Core + safe route log, no error objects.
    for (const call of m.error.mock.calls) {
      expect(call).toHaveLength(1);
      expect(typeof call[0]).toBe("string");
      expect(String(call[0])).not.toContain(marker);
      expect(String(call[0])).not.toContain(owner);
    }
    expect(m.unsafeNotification).not.toHaveBeenCalled();
  });

  it("genuinely empty successful repo result is 200, not 500", async () => {
    m.findNotes.mockResolvedValueOnce([]);
    const response = await request();
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({ success: true, data: [] });
    expectRepositoryOwnerProjection();
    expect(m.error).not.toHaveBeenCalled();
  });

  it("successful visible-note projection and nested JSON Date wire are unchanged", async () => {
    m.findNotes.mockResolvedValueOnce([fixture]);
    const response = await request();
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({
      success: true,
      data: [
        {
          ...fixture,
          createdAt: fixture.createdAt.toISOString(),
          entries: [
            {
              ...fixture.entries[0],
              createdAt: fixture.entries[0]!.createdAt.toISOString(),
              updatedAt: fixture.entries[0]!.updatedAt.toISOString(),
            },
          ],
        },
      ],
    });
    expectRepositoryOwnerProjection();
    expect(m.error).not.toHaveBeenCalled();
  });

  it("legacy direct Core callers still receive [] on repository error, but no exception/PII is logged", async () => {
    const marker = "PRIVATE_RECORD_AND_RAW_SQL_ERROR_TOKEN";
    m.findNotes.mockRejectedValueOnce(new Error(`error ${marker} actor ${owner}`));
    await expect(getStudentNotes(owner)).resolves.toEqual([]);
    expectRepositoryOwnerProjection();
    expect(m.error).toHaveBeenCalledTimes(1);
    expect(m.error.mock.calls[0]).toEqual(["Student notes read failed"]);
    expect(m.unsafeNotification).not.toHaveBeenCalled();
  });
});
