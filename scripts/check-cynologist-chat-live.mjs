import { randomUUID, createHash, createHmac } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { prisma } from "../packages/prisma/dist/index.js";
import {
  getChatState,
  startChat,
  getChatSession,
  sendChatMessage,
} from "../packages/core/dist/core/src/services/cynologistChat/service.js";
import { uploadChatAttachment } from "../packages/core/dist/core/src/services/cynologistChat/upload.js";
import {
  streamServer,
  CHAT_CHANNEL_TYPE,
} from "../packages/core/dist/core/src/services/cynologistChat/stream.js";
import {
  acceptChatWebhook,
  processChatEvent,
  refreshChatUnread,
} from "../packages/core/dist/core/src/services/cynologistChat/notifications.js";
import { cynologistChatQueue } from "../packages/queues/dist/index.js";
import { createRequire } from "node:module";
const { StreamChat } = createRequire(new URL("../packages/core/package.json", import.meta.url))(
  "stream-chat",
);
async function main() {
  const db = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(db.hostname) || !db.pathname.includes("_test_"))
    throw new Error("A local disposable test database is required");
  const suffix = randomUUID().slice(0, 8),
    clientId = `chat-check-client-${suffix}`,
    trainerId = `chat-check-trainer-${suffix}`,
    otherId = `chat-check-other-${suffix}`;
  process.env.CYNOLOGIST_CHAT_ENABLED = "true";
  process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID = trainerId;
  const results = [];
  const check = (value, label) => {
    if (!value) throw new Error(label);
    results.push(label);
  };
  async function reject(action, code, label) {
    try {
      await action();
      throw new Error(`Unexpected success: ${label}`);
    } catch (e) {
      if (e.code !== code) throw e;
      results.push(label);
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "gafus-chat-check-"));
  let chatId, channelId;
  const clients = [];
  const eventIds = [];
  try {
    await prisma.user.createMany({
      data: [
        { id: clientId, username: clientId, password: "unused" },
        { id: trainerId, username: trainerId, password: "unused", role: "TRAINER" },
        { id: otherId, username: otherId, password: "unused" },
      ],
    });
    await prisma.appSubscription.create({
      data: {
        userId: clientId,
        provider: "MANUAL",
        planCode: "MONTHLY",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 864e5),
      },
    });
    const intake = {
      clientOwnerName: "\u0422\u0435\u0441\u0442",
      clientPhone: "+79991234567",
      petName: "\u0411\u043E\u0431",
      petGender: "MALE",
      petAge: "2 \u0433\u043E\u0434\u0430",
      petBreed: "\u041C\u0435\u0442\u0438\u0441",
      clientProblem:
        "\u0421\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0438",
      clientSelfHelpAttempt:
        "\u0421\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0430\u043D\u043A\u0435\u0442\u0430",
    };
    const attempts = await Promise.allSettled([
      startChat(clientId, intake),
      startChat(clientId, intake),
    ]);
    const saved = await prisma.cynologistChat.findUnique({ where: { clientUserId: clientId } });
    chatId = saved?.id;
    channelId = saved?.streamChannelId;
    const failed = attempts.find((v) => v.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const starts = attempts.map((v) => v.value);
    check(starts[0].chat?.id === starts[1].chat?.id, "concurrent start keeps a single dialogue");
    chatId = starts[0].chat.id;
    channelId = starts[0].chat.streamChannelId;
    check(
      starts[0].canUseCynologistChat && !starts[0].canBookConsultations,
      "monthly chat rights without consultation rights",
    );
    const session = await getChatSession(clientId);
    const client = new StreamChat(session.apiKey, {
      allowServerSideConnect: true,
      logger: () => void 0,
    });
    clients.push(client);
    await client.connectUser({ id: session.userId }, session.token);
    const channel = client.channel(session.channelType, session.channelId);
    await channel.watch();
    check(
      channel.state.messages.length === 1 &&
        channel.state.messages[0].text?.includes("\u0422\u0435\u043B\u0435\u0444\u043E\u043D:"),
      "intake is exactly one first message",
    );
    try {
      await channel.sendMessage({ text: "Forbidden direct SDK send" });
      throw new Error("Client send bypass succeeded");
    } catch (e) {
      check(e.code === 17, "direct SDK send denied");
    }
    try {
      await channel.sendImage(Buffer.from("invalid"), "test.png", "image/png");
      throw new Error("Client upload bypass succeeded");
    } catch (e) {
      check(e.code === 17, "direct SDK upload denied");
    }
    const body = {
      clientMessageId: randomUUID(),
      text: "\u0421\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
      attachmentIds: [],
    };
    const first = await sendChatMessage(clientId, body);
    const again = await sendChatMessage(clientId, body);
    check(first.id === again.id, "send retry reuses the same Stream message");
    const event = {
      type: "message.new",
      cid: channel.cid,
      created_at: new Date(first.created_at).toISOString(),
      message: {
        id: first.id,
        created_at: new Date(first.created_at).toISOString(),
        user: { id: session.userId },
        text: "private synthetic text",
      },
    };
    const raw = JSON.stringify(event);
    const signature = createHmac("sha256", process.env.STREAM_API_SECRET).update(raw).digest("hex");
    await acceptChatWebhook(raw, signature);
    const eventId = createHash("sha256")
      .update(JSON.stringify({ type: event.type, cid: event.cid, messageId: first.id }))
      .digest("hex");
    eventIds.push(eventId);
    await processChatEvent(eventId);
    await processChatEvent(eventId);
    const unread = await prisma.cynologistChat.findUniqueOrThrow({ where: { id: chatId } });
    check(
      Boolean(unread.unreadSince && unread.nextReminderAt),
      "signed webhook starts unread reminder series",
    );
    check(
      (await prisma.chatNotification.count({ where: { chatId } })) === 1,
      "webhook replay creates one notification record",
    );
    const trainerSession = await getChatSession(trainerId, chatId);
    const trainer = new StreamChat(session.apiKey, {
      allowServerSideConnect: true,
      logger: () => void 0,
    });
    clients.push(trainer);
    await trainer.connectUser({ id: trainerSession.userId }, trainerSession.token);
    const trainerChannel = trainer.channel(session.channelType, session.channelId);
    await trainerChannel.watch();
    await trainerChannel.markRead();
    await refreshChatUnread(chatId);
    const read = await prisma.cynologistChat.findUniqueOrThrow({ where: { id: chatId } });
    check(
      !read.unreadSince && !read.nextReminderAt,
      "real Stream read state stops reminder series",
    );
    const foreignSession = {
      ...session,
      userId: `gafus-${otherId}`,
      token: streamServer().createToken(`gafus-${otherId}`, Math.floor(Date.now() / 1e3) + 3600),
    };
    await streamServer().upsertUser({ id: foreignSession.userId, role: "gafus_chat_reader" });
    const foreign = new StreamChat(session.apiKey, {
      allowServerSideConnect: true,
      logger: () => void 0,
    });
    clients.push(foreign);
    await foreign.connectUser({ id: foreignSession.userId }, foreignSession.token);
    try {
      await foreign.channel(session.channelType, session.channelId).watch();
      throw new Error("Foreign Stream read succeeded");
    } catch (e) {
      check(e.code === 17, "foreign channel read denied by Stream");
    }
    await reject(
      () => getChatSession(otherId, chatId),
      "CHAT_FORBIDDEN",
      "foreign session denied by GAFUS",
    );
    async function upload(path, mime, name) {
      const form = new FormData();
      form.append("file", new Blob([await readFile(path)], { type: mime }), name);
      return uploadChatAttachment(
        clientId,
        new Request("http://localhost/upload", { method: "POST", body: form }),
      );
    }
    const photo = await upload(
      join(process.cwd(), "output/stream-chat-prototype/web-chat.jpg"),
      "image/jpeg",
      "photo.jpg",
    );
    check(photo.kind === "image", "photo uploads through GAFUS to Stream CDN");
    await promisify(execFile)(
      "ffmpeg",
      [
        "-f",
        "lavfi",
        "-i",
        "color=c=olive:s=320x240:d=1",
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-y",
        join(dir, "video.mp4"),
      ],
      { maxBuffer: 65536 },
    );
    const video = await upload(join(dir, "video.mp4"), "video/mp4", "video.mp4");
    check(video.kind === "video", "H264 video inspected by ffprobe and uploaded");
    const media = await sendChatMessage(clientId, {
      clientMessageId: randomUUID(),
      text: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0439",
      attachmentIds: [photo.id, video.id],
    });
    check(media.attachments?.length === 2, "photo and video are attached to the message");
    await reject(
      () =>
        sendChatMessage(
          otherId,
          {
            clientMessageId: randomUUID(),
            text: "\u041F\u043E\u0434\u043C\u0435\u043D\u0430",
            attachmentIds: [photo.id],
          },
          chatId,
        ),
      "CHAT_FORBIDDEN",
      "foreign attachment cannot be sent",
    );
    await prisma.appSubscription.updateMany({
      where: { userId: clientId },
      data: { currentPeriodEnd: new Date(Date.now() - 1e3) },
    });
    check(!(await getChatState(clientId)).canSend, "expiry closes client sending");
    await reject(
      () => sendChatMessage(clientId, { ...body, clientMessageId: randomUUID() }),
      "CHAT_SUBSCRIPTION_REQUIRED",
      "server rejects send after expiry",
    );
    check(
      (await getChatSession(clientId)).channelId === channelId,
      "history session survives expiry",
    );
    await sendChatMessage(
      trainerId,
      {
        clientMessageId: randomUUID(),
        text: "\u0421\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043E\u0442\u0432\u0435\u0442 \u043A\u0438\u043D\u043E\u043B\u043E\u0433\u0430",
        attachmentIds: [],
      },
      chatId,
    );
    results.push("trainer can reply after client expiry");
    await prisma.appSubscription.updateMany({
      where: { userId: clientId },
      data: { currentPeriodEnd: new Date(Date.now() + 864e5) },
    });
    check(
      (await getChatState(clientId)).chat?.id === chatId && (await getChatState(clientId)).canSend,
      "renewal keeps the same dialogue and reopens sending",
    );
    console.log(JSON.stringify({ passed: results }, null, 2));
  } finally {
    for (const c of clients) await c.disconnectUser().catch(() => void 0);
    for (const id of eventIds) {
      await (await cynologistChatQueue.getJob(`event-${id}`))?.remove().catch(() => void 0);
    }
    await prisma.chatWebhookEvent.deleteMany({ where: { id: { in: eventIds } } });
    if (channelId) {
      const channel = streamServer().channel(CHAT_CHANNEL_TYPE, channelId);
      for (const file of await prisma.chatAttachment.findMany({ where: { chatId } }))
        await (
          file.kind === "image" ? channel.deleteImage(file.url) : channel.deleteFile(file.url)
        ).catch(() => void 0);
      await channel.delete().catch(() => void 0);
    }
    await prisma.appSubscription.deleteMany({ where: { userId: clientId } });
    await prisma.cynologistChat.deleteMany({ where: { clientUserId: clientId } });
    await prisma.user.deleteMany({ where: { id: { in: [clientId, trainerId, otherId] } } });
    await rm(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      JSON.stringify({
        failed: true,
        message: error.name === "TypeError" ? error.message : undefined,
        name: error.name,
        code: error.code,
        status: error.status,
        issues: error.issues?.map((i) => ({ path: i.path, message: i.message })),
      }),
    );
    process.exit(1);
  });
