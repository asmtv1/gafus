/** Genuine original Chat Hono + WORK PG18: read/denial only; Stream disabled. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_chat_read_work_20261025_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const actors: Actor[] = [];
let chatId = "";
const intake = {
  clientOwnerName: "AG1 Client",
  clientPhone: "+79990000000",
  petName: "AG1 Dog",
  petGender: "MALE",
  petAge: "3",
  petBreed: "Mixed",
  clientProblem: "Only synthetic work database chat scenario",
  clientProblemDuration: "About a week",
  clientSelfHelpAttempt: "Tried a short positive training exercise",
};
function obj(x: unknown): Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
}
function ensure(x: unknown, k: string): asserts x {
  if (!x) throw Error("ASSERT_" + k);
}
function pass(k: string) {
  console.warn("AG1_CHAT_REAL_HTTP " + k + "=PASS");
}
async function http(path: string, method = "GET", user?: Actor, body?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(user?.token ? { Authorization: "Bearer " + user.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: r.status, data: obj(await r.json()), headers: r.headers };
}
async function actor(role: "USER" | "TRAINER", suffix: string) {
  const password = randomBytes(26).toString("base64url");
  const row = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      role,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
    },
  });
  const user: Actor = { id: row.id, username: row.username, password };
  actors.push(user);
  const signed = await http("/auth/login", "POST", undefined, {
    username: user.username,
    password,
  });
  ensure(signed.status === 200 && signed.data.success === true, "JWT_LOGIN");
  const jwt = obj(signed.data.data).accessToken;
  ensure(typeof jwt === "string" && jwt.length > 35, "JWT_TOKEN");
  user.token = jwt;
  return user;
}
async function cleanup() {
  if (chatId) await prisma.cynologistChat.deleteMany({ where: { id: chatId } });
  for (const user of actors) {
    const actual = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true },
    });
    if (actual?.username === user.username && user.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: user.id } });
  }
}
async function main() {
  ensure(process.env.AG1_CHAT_WORK_HTTP === "1", "EXPLICIT_NONPROD_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["127.0.0.1", "localhost"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_PG",
  );
  const meta = await prisma.$queryRaw<{ db: string; version: string }[]>`
 SELECT current_database() AS db,current_setting('server_version_num') AS version`;
  ensure(
    meta[0]?.db === "gafus_refactor_real_work_20261024" && meta[0]?.version === "180004",
    "WORK_PG18",
  );
  ensure(
    (
      await fetch("http://127.0.0.1:3001/health", {
        signal: AbortSignal.timeout(5000),
      })
    ).status === 200,
    "HONO",
  );
  pass("REAL_HONO_WORK_PG18");
  const owner = await actor("USER", "owner"),
    foreign = await actor("USER", "foreign"),
    trainer = await actor("TRAINER", "trainer");
  pass("THREE_AUTHENTICATED_ACTORS");
  const absent = await http("/cynologist-chat", "GET", owner);
  ensure(absent.status === 200 && absent.data.success === true, "CHAT_STATE_GET");
  const absentData = obj(absent.data.data);
  ensure(
    absentData.chat === null && absentData.needsIntake === true && absentData.enabled === false,
    "EMPTY_CHAT_DISABLED_NO_PROVIDER",
  );
  const guest = await http("/cynologist-chat");
  ensure(guest.status === 401, "GUEST_401");
  pass("READ_EMPTY_AND_GUEST_401");
  const created = await prisma.cynologistChat.create({
    data: {
      clientUserId: owner.id,
      trainerUserId: trainer.id,
      streamChannelId: prefix + "_private",
      firstMessageId: prefix + "_intake",
      intake,
      provisionStatus: "PENDING",
    },
  });
  chatId = created.id;
  const mine = await http("/cynologist-chat", "GET", owner);
  const mineData = obj(mine.data.data);
  const myChat = obj(mineData.chat);
  ensure(
    mine.status === 200 &&
      mine.data.success &&
      myChat.id === chatId &&
      myChat.clientUserId === owner.id &&
      myChat.trainerUserId === trainer.id &&
      myChat.provisionStatus === "PENDING" &&
      mineData.canSend === false,
    "OWNER_READ_PENDING_NO_STREAM",
  );
  const other = await http("/cynologist-chat", "GET", foreign);
  ensure(other.status === 200 && obj(other.data.data).chat === null, "FOREIGN_IMPLICIT_EMPTY");
  const detail = await http("/cynologist-chat?chatId=" + encodeURIComponent(chatId), "GET", owner);
  ensure(
    detail.status === 200 && obj(obj(detail.data.data).chat).id === chatId,
    "OWNER_EXPLICIT_CHAT_ID",
  );
  pass("PHYSICAL_SQL_PENDING_CHAT_OWNER_READ_PRIVATE");
  const denied = await http(
    "/cynologist-chat?chatId=" + encodeURIComponent(chatId),
    "GET",
    foreign,
  );
  ensure(
    denied.status === 403 && denied.data.code === "CHAT_FORBIDDEN",
    "FOREIGN_CHAT_403_" + denied.status + "_" + String(denied.data.code ?? "NO_CODE"),
  );
  const listDenied = await http("/cynologist-chat/dialogs", "GET", foreign);
  ensure(
    listDenied.status === 403 && listDenied.data.code === "CHAT_FORBIDDEN",
    "FOREIGN_DIALOGS_403_" + listDenied.status + "_" + String(listDenied.data.code ?? "NO_CODE"),
  );
  pass("FOREIGN_EXPLICIT_CHAT_AND_DIALOG_ACL_403");
  const notReady = await http(
    "/cynologist-chat/session?chatId=" + encodeURIComponent(chatId),
    "POST",
    owner,
    {},
  );
  ensure(
    notReady.status === 409 && notReady.data.code === "CHAT_NOT_READY",
    "PENDING_SESSION_409_" + notReady.status + "_" + String(notReady.data.code ?? "NO_CODE"),
  );
  const invalid = await http("/cynologist-chat?chatId=bad%2Fid", "GET", owner);
  ensure(invalid.status === 400 && invalid.data.code === "INVALID_INPUT", "INVALID_ID_400");
  pass("PROVISION_PENDING_409_AND_INPUT_400");
  const canary = await http(
    "/cynologist-chat/messages?chatId=" + encodeURIComponent(chatId),
    "POST",
    owner,
    { clientMessageId: randomUUID(), text: "AG1 no provider must be called", attachmentIds: [] },
  );
  ensure(
    canary.status === 503 && canary.data.code === "CHAT_DISABLED",
    "DISABLED_SEND_503_" + canary.status + "_" + String(canary.data.code ?? "NO_CODE"),
  );
  const start = await http("/cynologist-chat/start", "POST", owner, intake);
  ensure(start.status === 503 && start.data.code === "CHAT_DISABLED", "DISABLED_START_503");
  ensure(
    (await prisma.chatSendOperation.count({ where: { chatId } })) === 0 &&
      (await prisma.cynologistChat.findUnique({ where: { id: chatId } }))?.provisionStatus ===
        "PENDING",
    "NO_STREAM_NO_SQL_SEND",
  );
  pass("STREAM_DISABLED_FAIL_CLOSED_NO_OUTBOUND_OR_SEND_WRITE");
}
void (async () => {
  try {
    await main();
  } catch (e) {
    process.exitCode = 1;
    console.error(
      "AG1_CHAT_REAL_HTTP_FAILED",
      e instanceof Error && e.message.startsWith("ASSERT_") ? e.message : "UNEXPECTED_REDACTED",
    );
  } finally {
    try {
      await cleanup();
      console.warn("AG1_CHAT_REAL_HTTP_OWN_FIXTURE_CLEANUP=PASS");
    } catch {
      process.exitCode = 1;
      console.error("AG1_CHAT_REAL_HTTP_CLEANUP_REVIEW_REQUIRED");
    }
    await prisma.$disconnect();
  }
})();
