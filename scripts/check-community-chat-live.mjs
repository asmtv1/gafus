import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { prisma } from "../packages/prisma/dist/index.js";
import {
  moderateCommunityChat,
  communityModerationOverview,
  getCommunityChatState,
  getCommunityChatSession,
  sendCommunityChatMessage,
} from "../packages/core/dist/core/src/services/cynologistChat/community.js";
import { streamServer } from "../packages/core/dist/core/src/services/cynologistChat/stream.js";
const { StreamChat } = createRequire(new URL("../packages/core/package.json", import.meta.url))(
  "stream-chat",
);
const db = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(db.hostname) || !db.pathname.includes("_test_"))
  throw new Error("Local test database required");
process.env.COMMUNITY_CHAT_ENABLED = "true";
const ids = [0, 1].map(() => `community-check-${randomUUID()}`),
  clients = [],
  messages = new Set();
let adminId,
  createdAdmin = false;
let count = 0;
const check = (condition, label) => {
  if (!condition) throw new Error(label);
  console.log(`PASS ${++count}: ${label}`);
};
try {
  await prisma.user.createMany({
    data: ids.map((id) => ({ id, username: id, password: "unused" })),
  });
  let admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    admin = await prisma.user.create({
      data: { username: "admin", password: "unused", role: "ADMIN" },
    });
    createdAdmin = true;
  }
  if (admin.role !== "ADMIN") throw new Error("Local admin fixture must have ADMIN role");
  adminId = admin.id;
  const sessions = await Promise.all(ids.map(getCommunityChatSession));
  check(
    sessions[0].channelId === sessions[1].channelId,
    "registered accounts share one room without subscriptions",
  );
  for (const session of sessions) {
    const client = new StreamChat(session.apiKey);
    clients.push(client);
    await client.connectUser({ id: session.userId }, session.token);
    await client.channel(session.channelType, session.channelId).watch();
  }
  check(clients.length === 2, "both read-only clients can watch without membership");
  const body = {
    clientMessageId: randomUUID(),
    text: "Synthetic community acceptance check",
    attachmentIds: [],
  };
  const message = await sendCommunityChatMessage(ids[0], body);
  messages.add(message.id);
  const retry = await sendCommunityChatMessage(ids[0], body);
  check(message.id === retry.id, "server retries preserve one provider message");
  const response = await clients[1]
    .channel(sessions[1].channelType, sessions[1].channelId)
    .query({ messages: { limit: 100 } });
  check(
    response.messages.some((m) => m.id === message.id),
    "another registered account reads the message",
  );
  let denied = false;
  try {
    await clients[0]
      .channel(sessions[0].channelType, sessions[0].channelId)
      .sendMessage({ text: "must be denied" });
  } catch {
    denied = true;
  }
  check(denied, "direct client sending is forbidden");
  for (const [user, data, code, label] of [
    [ids[0], { ...body, text: "changed" }, "CHAT_MESSAGE_CONFLICT", "changed retry rejected"],
    [
      ids[0],
      { ...body, clientMessageId: randomUUID(), attachmentIds: ["private-file"] },
      "CHAT_ATTACHMENT_FORBIDDEN",
      "private attachment cannot enter public room",
    ],
    ["missing", body, "CHAT_UNAUTHORIZED", "unregistered account rejected"],
  ]) {
    let rejected = false;
    try {
      await sendCommunityChatMessage(user, data);
    } catch (e) {
      rejected = e.code === code;
    }
    check(rejected, label);
  }

  let deniedModerator = false;
  try {
    await moderateCommunityChat(ids[1], { action: "delete", messageId: message.id });
  } catch (e) {
    deniedModerator = e.code === "CHAT_FORBIDDEN";
  }
  check(deniedModerator, "ordinary account cannot moderate through API");
  await moderateCommunityChat(adminId, { action: "ban", userId: `gafus-${ids[0]}` });
  check((await getCommunityChatState(ids[0])).isBanned, "channel ban is reflected in server state");
  let bannedSender = false;
  try {
    await sendCommunityChatMessage(ids[0], { ...body, clientMessageId: randomUUID() });
  } catch (e) {
    bannedSender = e.code === "CHAT_BANNED";
  }
  check(bannedSender, "banned account cannot use server sending");
  const { uploadChatAttachment } = await import(
    "../packages/core/dist/core/src/services/cynologistChat/upload.js"
  );
  let bannedUpload = false;
  try {
    await uploadChatAttachment(
      ids[0],
      new Request("http://localhost/upload", { method: "POST", body: "unused" }),
      undefined,
      true,
    );
  } catch (e) {
    bannedUpload = e.code === "CHAT_BANNED";
  }
  check(bannedUpload, "banned account cannot upload files");
  check(
    (await communityModerationOverview(adminId)).bans.some((b) => b.userId === `gafus-${ids[0]}`),
    "admin sees the ban list",
  );
  await moderateCommunityChat(adminId, { action: "unban", userId: `gafus-${ids[0]}` });
  check(!(await getCommunityChatState(ids[0])).isBanned, "admin can remove channel ban");
  await moderateCommunityChat(adminId, { action: "delete", messageId: message.id });
  check(
    Boolean((await streamServer().getMessage(message.id)).message.deleted_at),
    "admin soft-deletes a community message",
  );
} finally {
  await Promise.allSettled(
    ids.map((id) => streamServer().channel("gafus_community", "general").unbanUser(`gafus-${id}`)),
  );
  if (createdAdmin) await prisma.user.delete({ where: { id: adminId } });
  await Promise.allSettled(clients.map((c) => c.disconnectUser()));
  await Promise.allSettled([...messages].map((id) => streamServer().deleteMessage(id, true)));
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
