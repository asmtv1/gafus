import { Hono, type Context } from "hono";
import {reserveChat2V2Upload,confirmChat2V2Upload,getChat2V2UploadStatus,attachChat2V2Media} from "../../modules/chat2/media-v2-upload.js";
import { bodyLimit } from "hono/body-limit";
import { z, ZodError } from "zod";
import { prisma } from "@gafus/prisma";
import { connectToken, subscriptionToken } from "../../modules/chat2/realtime.js";
import {
  Chat2Error,
  listChats,
  openDirect,
  openCynologist,
  openCommunity,
  openCourse,
  accessibleCourseRooms,
  createGroup,
  discover,
  joinGroup,
  chatDetails,
  messages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
  markRead,
  blockUser,
  leaveChat,
  inviteMember,
  uploadAttachment,
  getAttachment,
  discardAttachment,
  updateGroup,
  changeGroupAvatar,
  removeGroupAvatar,
  moderateGroup,
  transferGroupOwner,
  muteChat,
  reportChatMessage,
  listChatReports,
  resolveChatReport,
  listStaffChatReports,
  resolveStaffChatReport,
} from "../../modules/chat2/service.js";

/** Every handler is reached only via authenticated, no-store /api/v1/chats routes. */
export const chatsRoutes = new Hono();
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const group = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    visibility: z.enum(["PUBLIC", "PRIVATE", "UNLISTED"]).default("PRIVATE"),
    kind: z.enum(["GROUP", "CITY", "BREED", "COURSE_TOPIC"]).default("GROUP"),
  })
  .strict();
const send = z
  .object({
    clientMessageId: z.string().uuid(),
    text: z.string().trim().max(8000).default(""),
    replyToId: id.optional(),
    attachmentIds: z.array(id).max(8).default([]),
  })
  .strict()
  .refine((x) => x.text.length > 0 || x.attachmentIds.length > 0, { message: "Сообщение пустое" });
const seq = (raw: string | undefined) => {
  if (!raw || !/^[0-9]{1,18}$/.test(raw))
    throw new Chat2Error("INVALID_SEQUENCE", 400, "Неверная позиция");
  return BigInt(raw);
};
const actor = (c: Context) => c.get("user").id;
const ok = (data: unknown) => ({ success: true as const, data });
chatsRoutes.onError((error, c) => {
  if (error instanceof Chat2Error)
    return c.json({ success: false, code: error.code, error: error.message }, error.status);
  if (error instanceof ZodError)
    return c.json({ success: false, code: "INVALID_INPUT", error: "Проверьте поля запроса" }, 400);
  // Never surface database identifiers, message contents, subscriptions or provider failures.
  return c.json(
    { success: false, code: "CHAT_UNAVAILABLE", error: "Чат временно недоступен" },
    503,
  );
});
chatsRoutes.get("/", async (c) => c.json(ok(await listChats(actor(c)))));
chatsRoutes.get("/realtime/connect", async (c) => c.json(ok(await connectToken(actor(c)))));
chatsRoutes.get("/:id/realtime", async (c) =>
  c.json(ok(await subscriptionToken(actor(c), id.parse(c.req.param("id"))))),
);
chatsRoutes.get("/users", async (c) => {
  const q = z
    .string()
    .trim()
    .min(2)
    .max(50)
    .parse(c.req.query("q") ?? "");
  const users = await prisma.user.findMany({
    where: {
      username: { contains: q, mode: "insensitive", not: "lana" },
      id: { not: actor(c) },
      accountDeletionRequestedAt: null,
    },
    select: { id: true, username: true },
    take: 15,
  });
  return c.json(ok(users));
});
chatsRoutes.get("/discover", async (c) => {
  const search = z.string().trim().max(80).optional().parse(c.req.query("q"));
  return c.json(ok(await discover(actor(c), search)));
});
// Both clients can open a DM directly from a public profile without relying
// on the paginated chat user search. Existing userId callers remain supported.
chatsRoutes.post("/direct", async (c) => {
  const target = z
    .union([
      z.object({ userId: id }).strict(),
      z.object({ username: z.string().regex(/^[A-Za-z0-9_-]{2,128}$/) }).strict(),
    ])
    .parse(await c.req.json());
  let userId: string;
  if ("userId" in target) {
    userId = target.userId;
  } else {
    const other = await prisma.user.findFirst({
      where: {
        username: { equals: target.username, mode: "insensitive" },
        accountDeletionRequestedAt: null,
      },
      select: { id: true },
    });
    if (!other) throw new Chat2Error("USER_NOT_FOUND", 404, "Пользователь не найден");
    userId = other.id;
  }
  return c.json(ok(await openDirect(actor(c), userId)), 201);
});
chatsRoutes.post("/cynologist", async (c) => c.json(ok(await openCynologist(actor(c))), 201));
chatsRoutes.post("/community", async (c) => c.json(ok(await openCommunity(actor(c))), 201));
chatsRoutes.get("/courses", async (c) => c.json(ok(await accessibleCourseRooms(actor(c)))));
chatsRoutes.post("/courses/:courseId", async (c) =>
  c.json(ok(await openCourse(actor(c), id.parse(c.req.param("courseId")))), 201),
);
chatsRoutes.post("/groups", async (c) =>
  c.json(ok(await createGroup(actor(c), group.parse(await c.req.json()))), 201),
);
chatsRoutes.post("/block", async (c) => {
  const { userId, blocked } = z
    .object({ userId: id, blocked: z.boolean() })
    .strict()
    .parse(await c.req.json());
  return c.json(ok(await blockUser(actor(c), userId, blocked)));
});
chatsRoutes.get("/:id", async (c) =>
  c.json(ok(await chatDetails(actor(c), id.parse(c.req.param("id"))))),
);
chatsRoutes.get("/:id/messages", async (c) => {
  const before = c.req.query("before"),
    after = c.req.query("after");
  if (before && after)
    throw new Chat2Error("INVALID_CURSOR", 400, "Выберите одно направление истории");
  return c.json(
    ok(
      await messages(
        actor(c),
        id.parse(c.req.param("id")),
        before ? seq(before) : undefined,
        after ? seq(after) : undefined,
      ),
    ),
  );
});
chatsRoutes.post("/:id/messages", async (c) => {
  return c.json(
    ok(await sendMessage(actor(c), id.parse(c.req.param("id")), send.parse(await c.req.json()))),
    201,
  );
});
chatsRoutes.patch("/:id/messages/:messageId", async (c) => {
  const data = z
    .object({ text: z.string().trim().min(1).max(8000) })
    .strict()
    .parse(await c.req.json());
  return c.json(
    ok(
      await editMessage(
        actor(c),
        id.parse(c.req.param("id")),
        id.parse(c.req.param("messageId")),
        data.text,
      ),
    ),
  );
});
chatsRoutes.delete("/:id/messages/:messageId", async (c) =>
  c.json(
    ok(
      await deleteMessage(
        actor(c),
        id.parse(c.req.param("id")),
        id.parse(c.req.param("messageId")),
      ),
    ),
  ),
);
chatsRoutes.post("/:id/messages/:messageId/reaction", async (c) => {
  const { emoji } = z.object({
    emoji: z.enum(["👍", "❤️", "😂", "😮", "😢", "👏"]),
  }).strict().parse(await c.req.json());
  return c.json(ok(await toggleMessageReaction(
    actor(c), id.parse(c.req.param("id")), id.parse(c.req.param("messageId")), emoji,
  )));
});
chatsRoutes.post("/:id/read", async (c) => {
  const { sequence } = z
    .object({ sequence: z.string() })
    .strict()
    .parse(await c.req.json());
  return c.json(ok(await markRead(actor(c), id.parse(c.req.param("id")), seq(sequence))));
});
// New direct-to-S3 media pipeline: inaccessible until explicitly enabled.
const mediaV2Reserve=z.object({name:z.string().min(1).max(180),mime:z.string().min(5).max(100),
  bytes:z.number().int().min(10).max(200*1024*1024)}).strict();
chatsRoutes.post("/:id/media/v2/reserve",async c=>{
  const room=id.parse(c.req.param("id"));
  const input=mediaV2Reserve.parse(await c.req.json());
  return c.json(ok(await reserveChat2V2Upload(actor(c),room,input)),201);
});
chatsRoutes.post("/:id/media/v2/:mediaId/confirm",async c=>
  c.json(ok(await confirmChat2V2Upload(actor(c),id.parse(c.req.param("id")),
    z.string().uuid().parse(c.req.param("mediaId"))))));
chatsRoutes.get("/:id/media/v2/:mediaId",async c=>
  c.json(ok(await getChat2V2UploadStatus(actor(c),id.parse(c.req.param("id")),
    z.string().uuid().parse(c.req.param("mediaId"))))));

chatsRoutes.post("/:id/media/v2/:mediaId/attach",async c=>
  c.json(ok(await attachChat2V2Media(actor(c),id.parse(c.req.param("id")),
    z.string().uuid().parse(c.req.param("mediaId")))),201));

chatsRoutes.post(
  "/:id/attachments",
  bodyLimit({
    maxSize: 100 * 1024 * 1024 + 65536,
    onError: (c) =>
      c.json(
        {
          success: false,
          code: "FILE_TOO_LARGE",
          error: "Максимальный размер видео 100 МБ, фото и PDF — 10 МБ",
        },
        413,
      ),
  }),
  async (c) => {
    const chat = id.parse(c.req.param("id"));
    const body = await c.req.formData();
    const value = body.get("file");
    if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function")
      throw new Chat2Error("INVALID_ATTACHMENT", 400, "Выберите изображение, MP4 или PDF");
    if (value.size < 10 || value.size > (value.type === "video/mp4" ? 100 : 10) * 1024 * 1024)
      throw new Chat2Error("FILE_TOO_LARGE", 400, "Файл слишком большой");
    return c.json(
      ok(
        await uploadAttachment(actor(c), chat, {
          name: value.name || "Вложение",
          type: value.type,
          bytes: new Uint8Array(await value.arrayBuffer()),
        }),
      ),
      201,
    );
  },
);
chatsRoutes.get("/:id/attachments/:attachmentId", async (c) =>
  c.json(
    ok(
      await getAttachment(
        actor(c),
        id.parse(c.req.param("id")),
        id.parse(c.req.param("attachmentId")),
      ),
    ),
  ),
);
chatsRoutes.delete("/:id/attachments/:attachmentId", async (c) =>
  c.json(
    ok(
      await discardAttachment(
        actor(c),
        id.parse(c.req.param("id")),
        id.parse(c.req.param("attachmentId")),
      ),
    ),
  ),
);
chatsRoutes.post("/:id/join", async (c) =>
  c.json(ok(await joinGroup(actor(c), id.parse(c.req.param("id"))))),
);
chatsRoutes.post("/:id/leave", async (c) =>
  c.json(ok(await leaveChat(actor(c), id.parse(c.req.param("id"))))),
);
chatsRoutes.post("/:id/invite", async (c) => {
  const { userId } = z
    .object({ userId: id })
    .strict()
    .parse(await c.req.json());
  return c.json(ok(await inviteMember(actor(c), id.parse(c.req.param("id")), userId)));
});

chatsRoutes.post(
  "/:id/avatar",
  bodyLimit({ maxSize: 5 * 1024 * 1024 + 65536,
    onError: (c) => c.json({ success: false, code: "FILE_TOO_LARGE", error: "Максимум 5 МБ" }, 413),
  }),
  async (c) => {
    const body = await c.req.formData();
    const file = body.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function")
      throw new Chat2Error("INVALID_AVATAR", 400, "Выберите изображение");
    if (file.size < 10 || file.size > 5 * 1024 * 1024)
      throw new Chat2Error("INVALID_AVATAR", 400, "Максимальный размер 5 МБ");
    return c.json(ok(await changeGroupAvatar(actor(c), id.parse(c.req.param("id")), {
      name: file.name || "avatar", type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })));
  },
);
chatsRoutes.delete("/:id/avatar", async (c) =>
  c.json(ok(await removeGroupAvatar(actor(c), id.parse(c.req.param("id"))))),
);
chatsRoutes.patch("/:id/group", async (c) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).optional(),
      visibility: z.enum(["PUBLIC", "PRIVATE", "UNLISTED"]).optional(),
    })
    .strict()
    .refine((x) => Object.keys(x).length > 0)
    .parse(await c.req.json());
  return c.json(ok(await updateGroup(actor(c), id.parse(c.req.param("id")), data)));
});
chatsRoutes.post("/:id/moderate", async (c) => {
  const data = z
    .object({ userId: id, action: z.enum(["BAN", "UNBAN", "KICK", "PROMOTE", "DEMOTE"]) })
    .strict()
    .parse(await c.req.json());
  return c.json(
    ok(await moderateGroup(actor(c), id.parse(c.req.param("id")), data.userId, data.action)),
  );
});
chatsRoutes.post("/:id/transfer-owner", async (c) => {
  const data = z
    .object({ userId: id })
    .strict()
    .parse(await c.req.json());
  return c.json(ok(await transferGroupOwner(actor(c), id.parse(c.req.param("id")), data.userId)));
});
chatsRoutes.post("/:id/mute", async (c) => {
  const data = z
    .object({ muted: z.boolean() })
    .strict()
    .parse(await c.req.json());
  return c.json(ok(await muteChat(actor(c), id.parse(c.req.param("id")), data.muted)));
});

chatsRoutes.post("/:id/messages/:messageId/report", async (c) => {
  const data = z
    .object({
      reason: z.enum(["SPAM", "ABUSE", "OTHER"]),
      comment: z.string().trim().max(500).optional(),
    })
    .strict()
    .parse(await c.req.json());
  return c.json(
    ok(
      await reportChatMessage(
        actor(c),
        id.parse(c.req.param("id")),
        id.parse(c.req.param("messageId")),
        data,
      ),
    ),
    201,
  );
});
// Site-wide staff routes MUST precede the matching dynamic /:id/reports handlers.
chatsRoutes.get("/moderation/reports", async (c) =>
  c.json(ok(await listStaffChatReports(actor(c)))),
);
chatsRoutes.post("/moderation/reports/:reportId/resolve", async (c) => {
  const body = z
    .object({ status: z.enum(["RESOLVED", "REJECTED"]) })
    .strict()
    .parse(await c.req.json());
  return c.json(
    ok(await resolveStaffChatReport(actor(c), id.parse(c.req.param("reportId")), body.status)),
  );
});

chatsRoutes.get("/:id/reports", async (c) =>
  c.json(ok(await listChatReports(actor(c), id.parse(c.req.param("id"))))),
);
chatsRoutes.post("/:id/reports/:reportId/resolve", async (c) => {
  const data = z
    .object({ status: z.enum(["RESOLVED", "REJECTED"]) })
    .strict()
    .parse(await c.req.json());
  return c.json(
    ok(
      await resolveChatReport(
        actor(c),
        id.parse(c.req.param("id")),
        id.parse(c.req.param("reportId")),
        data.status,
      ),
    ),
  );
});
