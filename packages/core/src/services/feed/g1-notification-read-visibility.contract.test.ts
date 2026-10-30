/** AG1-COMM050: actual Feed Core notice read/list visibility with mocked DB. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { createFeedSocial } from "./social";

const OWNER_A = "ACTOR_A";
const OWNER_B = "ACTOR_B";
const READABLE = "NOTICE_COMMENT_A";
const PUSH_ONLY = "NOTICE_AUTHOR_POST_A";
const FOREIGN = "NOTICE_COMMENT_B";
const NOW = new Date("2026-10-21T10:00:00.000Z");
const m = vi.hoisted(() => ({
  findUnique: vi.fn(), findUsers: vi.fn(),
  findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn(),
}));
type Notice = {
  id: string; recipientId: string; kind: "comment" | "author_post";
  readAt: Date | null; createdAt: Date; postId: string; commentId: string | null;
  actorIds: string[]; reaction: null;
  post: { status: string; deletedAt: null; moderationState: string };
};
let rows: Notice[];
const selectRows = (where: {
  id?: string; recipientId?: string; kind?: { not: string };
  readAt?: null;
}) => rows.filter((row) =>
  (where.id === undefined || row.id === where.id) &&
  (where.recipientId === undefined || row.recipientId === where.recipientId) &&
  (where.kind?.not === undefined || row.kind !== where.kind.not) &&
  (where.readAt === undefined || row.readAt === null)
);
const service = () => createFeedSocial({
  db: {
    user: { findUnique: m.findUnique, findMany: m.findUsers },
    feedNotification: {
      findMany: m.findMany, findFirst: m.findFirst,
      count: m.count, updateMany: m.updateMany,
    },
  } as unknown as FeedDb,
  enabled: () => true,
  now: () => NOW,
});
beforeEach(() => {
  vi.resetAllMocks();
  rows = [
    { id: READABLE, recipientId: OWNER_A, kind: "comment", readAt: null,
      createdAt: NOW, postId: "POST_1", commentId: "COMMENT_1",
      actorIds: [], reaction: null,
      post: { status: "published", deletedAt: null, moderationState: "visible" },
    },
    { id: PUSH_ONLY, recipientId: OWNER_A, kind: "author_post", readAt: null,
      createdAt: NOW, postId: "POST_2", commentId: null,
      actorIds: [], reaction: null,
      post: { status: "published", deletedAt: null, moderationState: "visible" },
    },
    { id: FOREIGN, recipientId: OWNER_B, kind: "comment", readAt: null,
      createdAt: NOW, postId: "POST_3", commentId: "COMMENT_3",
      actorIds: [], reaction: null,
      post: { status: "published", deletedAt: null, moderationState: "visible" },
    },
  ];
  m.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
  }));
  m.findUsers.mockResolvedValue([]);
  m.findMany.mockImplementation(async ({ where }: { where: Parameters<typeof selectRows>[0] }) =>
    selectRows(where)
  );
  m.findFirst.mockImplementation(async ({ where }: { where: Parameters<typeof selectRows>[0] }) =>
    selectRows(where)[0] ?? null
  );
  m.count.mockImplementation(async ({ where }: { where: Parameters<typeof selectRows>[0] }) =>
    selectRows(where).length
  );
  m.updateMany.mockImplementation(async ({ where, data }: {
    where: Parameters<typeof selectRows>[0]; data: { readAt: Date };
  }) => {
    const target = selectRows(where);
    for (const row of target) row.readAt = data.readAt;
    return { count: target.length };
  });
});

describe("AG1-COMM050 feed notification read/owner visibility", () => {
  it("excludes author_post push-only items from personal list and unread count", async () => {
    const social = service();
    const page = await social.listNotifications(OWNER_A);
    expect(page.items.map((row) => row.id)).toEqual([READABLE]);
    expect(await social.unreadCount(OWNER_A)).toEqual({ count: 1 });
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ recipientId: OWNER_A, kind: { not: "author_post" } }),
    }));
    expect(m.count).toHaveBeenCalledWith({
      where: { recipientId: OWNER_A, kind: { not: "author_post" }, readAt: null },
    });
  });
  it("projects actors via public columns, never email/phone or private notes", async () => {
    rows[0]!.actorIds = ["OTHER_ACTOR"];
    m.findUsers.mockResolvedValueOnce([{
      id: "OTHER_ACTOR", username: "public-user",
      profile: { fullName: "Public", avatarUrl: null },
      email: "PRIVATE_ACTOR_EMAIL", phone: "PRIVATE_ACTOR_PHONE",
      privateMedicalNotes: "PRIVATE_ACTOR_MEDICAL",
    }]);
    const page = await service().listNotifications(OWNER_A);
    expect(page.items[0]!.actors).toEqual([{
      id: "OTHER_ACTOR", username: "public-user", name: "Public", avatarUrl: null,
    }]);
    expect(page.items[0]!.actorCount).toBe(1);
    expect(JSON.stringify(page)).not.toContain("PRIVATE_ACTOR_");
    expect(m.findUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["OTHER_ACTOR"] } },
      select: {
        id: true, username: true,
        profile: { select: { fullName: true, avatarUrl: true } },
      },
    }));
  });

  it("push-only own ID cannot be marked read via hidden PATCH", async () => {
    const social = service();
    await expect(social.markNotificationRead(OWNER_A, PUSH_ONLY))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: PUSH_ONLY, recipientId: OWNER_A, kind: { not: "author_post" },
      }),
    }));
    expect(rows[1]?.readAt).toBeNull();
  });
  it("foreign notification cannot be marked read and remains unread", async () => {
    const social = service();
    await expect(social.markNotificationRead(OWNER_A, FOREIGN))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(rows[2]?.readAt).toBeNull();
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ recipientId: OWNER_A }),
    }));
  });
  it("ordinary own notification read remains idempotent", async () => {
    const social = service();
    const first = await social.markNotificationRead(OWNER_A, READABLE);
    const second = await social.markNotificationRead(OWNER_A, READABLE);
    expect(first).toEqual({ id: READABLE, readAt: NOW.toISOString() });
    expect(second).toEqual(first);
    expect(await social.unreadCount(OWNER_A)).toEqual({ count: 0 });
    expect(rows[0]?.readAt).toEqual(NOW);
  });
  it("read-all changes only own visible unread and is safe to repeat", async () => {
    const social = service();
    expect(await social.markAllNotificationsRead(OWNER_A)).toEqual({ count: 1 });
    expect(await social.markAllNotificationsRead(OWNER_A)).toEqual({ count: 0 });
    expect(rows[0]?.readAt).toEqual(NOW);
    expect(rows[1]?.readAt).toBeNull();
    expect(rows[2]?.readAt).toBeNull();
  });
});
