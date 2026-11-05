/**
 * Opt-in real PostgreSQL 18 + own Redis + own in-memory Centrifugo v6:
 * real actor-scoped proxy-only subscription, persistent outbox, WebSocket,
 * broker unsubscribe after group ban, and honest reconnect behavior.
 * No existing fixed-port infrastructure, no real users, no production broker.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer, type Server } from "node:http";
import { once } from "node:events";

const safe = (() => {
  try {
    const db = new URL(process.env.DATABASE_URL ?? "");
    const ws = new URL(process.env.CHAT2_PUBLIC_WS_URL ?? "");
    const redis = new URL(process.env.REDIS_URL ?? "");
    const api = new URL(process.env.CHAT2_CENTRIFUGO_HTTP_API ?? "");
    const roomDb = process.env.GAFUS_ARCHQA_CHAT2_QUEUE_DB;
    return process.env.GAFUS_ARCHQA_REALTIME_WS === "1" &&
      process.env.GAFUS_ARCHQA_CHAT2_QUEUE_REALPG === "1" &&
      process.env.NODE_ENV === "test" &&
      process.env.CHAT2_API_ENABLED === "enabled" &&
      process.env.GAFUS_ARCHQA_PROXY_ONLY === "1" &&
      process.env.JWT_SECRET?.startsWith("gafus-archqa-access-") &&
      /^archqa_queue_[a-f0-9]{12}$/.test(roomDb ?? "") &&
      db.protocol === "postgresql:" && db.hostname === "127.0.0.1" &&
      db.pathname === `/${roomDb}` && db.searchParams.get("schema") === "public" &&
      redis.protocol === "redis:" && redis.hostname === "127.0.0.1" &&
      redis.port !== "6389" && redis.port !== "6379" &&
      ws.protocol === "ws:" && ws.hostname === "127.0.0.1" && ws.port !== "8039" &&
      ws.pathname === "/connection/websocket" &&
      api.protocol === "http:" && api.hostname === "127.0.0.1" &&
      api.port === ws.port && api.pathname === "/api/publish" &&
      process.env.CHAT2_CENTRIFUGO_TOKEN_SECRET?.startsWith("gafus-archqa-only-") &&
      process.env.CHAT2_CENTRIFUGO_API_KEY?.startsWith("gafus-archqa-api-");
  } catch { return false; }
})();
if (!safe) throw Error("OWN_PG_REDIS_CENTRIFUGO_LOOPBACK_REQUIRED");

// Use the *same* browser WebSocket implementation as Web-Vite, but only with
// a synthetic in-memory local broker and synthetic self-created accounts.
const requireWeb = createRequire(new URL("../../web-vite/package.json", import.meta.url));
const { Centrifuge } = requireWeb("centrifuge") as typeof import("centrifuge");
const WebSocket = requireWeb("ws") as typeof import("ws");
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { connection, pushQueue } from "@gafus/queues";
import { connectToken } from "../src/modules/chat2/realtime";
import { SignJWT } from "jose";
import {
  createGroup, inviteMember, sendMessage, messages, moderateGroup,
} from "../src/modules/chat2/service";
import { processChat2OutboxOnce } from "../../../packages/worker/src/chat2-outbox-worker";

type BrowserClient = InstanceType<typeof Centrifuge>;
const users: string[] = [];
let actor = "", reader = "", outsider = "", room = "";
const clients: BrowserClient[] = [];
let proxyServer: Server | undefined;
const proxyAudit = { allowed: 0, denied: 0 };

function within<T>(promise: Promise<T>, label: string, timeout = 7000): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => {
    setTimeout(() => reject(Error(`OWN_WS_TIMEOUT_${label}`)), timeout);
  })]);
}
/** Intentionally forged OLD room token signed with the CONNECTION secret.
 * It is NEVER issued by the application or used for any legitimate subscribe;
 * this tests that Centrifugo rejects bypass after BAN. */
async function staleLegacyRoomToken(userId: string, roomId: string) {
  return new SignJWT({ channel: `chat2:${roomId}` })
    .setIssuer("gafus-chat2")
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(process.env.CHAT2_CENTRIFUGO_TOKEN_SECRET!));
}
async function subscribe(userId: string, roomId: string) {
  const connection = await connectToken(userId);
  const channel = `chat2:${roomId}`;
  const roomToken = await staleLegacyRoomToken(userId, roomId);
  expect(connection.subscriptionMode).toBe("proxy");
  const { token, wsUrl } = connection;
  const client = new Centrifuge(wsUrl, { token, websocket: WebSocket });
  clients.push(client);
  // Mandatory proxy-only: no room JWT ever sent. Synthetic old-token fixture
  // is retained only for the negative replay test after a BAN.
  const sub = client.newSubscription(channel);
  const events: string[] = [];
  client.on("connecting", event => { events.push(`connecting:${event.code}:${event.reason}`); });
  client.on("connected", () => { events.push("connected"); });
  client.on("disconnected", event => { events.push(`disconnected:${event.code}:${event.reason}`); });
  client.on("error", event => { events.push(`client_error:${event.type}`); });
  sub.on("unsubscribed", event => { events.push(`unsubscribed:${event.code}:${event.reason}`); });
  const ready = new Promise<void>((resolve, reject) => {
    sub.on("subscribed", () => resolve());
    sub.on("error", ({ error }) => reject(Error(`BROKER_SUB_ERROR_${error?.message}`)));
  });
  sub.subscribe();
  client.connect();
  try { await within(ready, "SUBSCRIBED", 4500); }
  catch (error) { throw Error(`BROKER_AUTH_TRACE=${events.join("|")}`, { cause: error }); }
  return { client, sub, roomToken, channel };
}

beforeAll(async () => {
  const db = await prisma.$queryRawUnsafe<{ db: string }[]>(
    'SELECT current_database() AS db');
  expect(db[0]?.db).toBe(process.env.GAFUS_ARCHQA_CHAT2_QUEUE_DB);
  expect(await prisma.chat2Conversation.count()).toBe(0);
  expect(await connection.ping()).toBe("PONG");
  expect(process.env.CHAT2_SUBSCRIBE_PROXY_ENABLED).toBe("true");
  expect(process.env.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET)
    .toBe(process.env.GAFUS_ARCHQA_SUBSCRIBE_PROXY_SECRET);
  const health = await fetch(`${process.env.GAFUS_ARCHQA_BROKER_URL}/health`,
    { signal: AbortSignal.timeout(2000) });
  expect(health.status).toBe(200);
  const proxyPort = Number(process.env.GAFUS_ARCHQA_SUBSCRIBE_PROXY_PORT);
  expect(Number.isSafeInteger(proxyPort) && proxyPort > 1024).toBe(true);
  // Import the ACTUAL GAFUS Hono app; it must mount the broker-authenticated
  // endpoint when the explicit isolated opt-in is present. A fixture-only Hono
  // proxy would be insufficient proof of the deployed application routing.
  const { app } = await import("../src/app");
  const endpoint = `http://127.0.0.1:${proxyPort}/internal/chat2/chat2-subscribe`;
  const forged = await app.request(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: "forged", channel: "chat2:fake" }),
  });
  expect(forged.status, "PROJECT_MOUNTED_HONO_PROXY_AUTH_MUST_FAIL_CLOSED").toBe(403);
  expect(forged.headers.get("cache-control")).toContain("no-store");
  proxyServer = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk as Buffer);
        total += bytes.length;
        if (total > 12_000) { response.writeHead(413); response.end(); return; }
        chunks.push(bytes);
      }
      const result = await app.request(new Request(`http://127.0.0.1:${proxyPort}${request.url}`, {
        method: request.method,
        headers: request.headers as HeadersInit,
        body: request.method === "POST" ? Buffer.concat(chunks) : undefined,
      }));
      const outcome = await result.clone().json() as { result?: unknown; error?: unknown };
      if (result.ok && outcome.result) proxyAudit.allowed++;
      else proxyAudit.denied++;
      result.headers.forEach((value, key) => response.setHeader(key, value));
      response.writeHead(result.status);
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(503); response.end(); }
  });
  proxyServer.listen(proxyPort, "127.0.0.1");
  await once(proxyServer, "listening");
  const salt = randomUUID().replaceAll("-", "").slice(0, 12);
  for (const name of ["actor", "reader", "outsider"]) {
    const user = await prisma.user.create({ data: {
      username: `archqa_ws_${name}_${salt}`,
      password: "own-only-not-a-user-password",
      email: `own_ws_${name}_${salt}@example.invalid`,
    }, select: { id: true } });
    users.push(user.id);
  }
  [actor, reader, outsider] = users;
  room = (await createGroup(actor, { name: "Owned private websocket fixture",
    kind: "GROUP", visibility: "PRIVATE" })).conversationId;
  await inviteMember(actor, room, reader);
});
afterAll(async () => {
  for (const client of clients) client.disconnect();
  // All rows are inside this run's disposable PG, removed by the owning runner.
  // Close only this run's ioredis and BullMQ connections, not any shared queue.
  await pushQueue.close();
  await connection.quit();
  await prisma.$disconnect();
  if (proxyServer) await new Promise<void>((resolve, reject) =>
    proxyServer!.close(error => error ? reject(error) : resolve()));
});

describe("real owned Centrifugo 6.9.7: pg ACL/outbox/revocation/reconnect", () => {
  it("mounted authenticated /realtime/connect returns only proxy mode and old room-token API is gone", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: reader },
      select: { id: true, username: true, role: true } });
    const jwt = await generateAccessToken(user);
    const { app } = await import("../src/app");
    const auth = { Authorization: `Bearer ${jwt}` };
    const connect = await app.request("http://127.0.0.1/api/v1/chats/realtime/connect",
      { headers: auth });
    expect(connect.status).toBe(200);
    const connection = await connect.json() as { success: boolean; data: {
      token: string; wsUrl: string; subscriptionMode?: string;
    } };
    expect(connection.success).toBe(true);
    expect(connection.data.subscriptionMode).toBe("proxy");
    expect(connection.data.token).toBeTruthy();
    expect(connection.data.wsUrl).toBe(process.env.CHAT2_PUBLIC_WS_URL);
    const old = await app.request(`http://127.0.0.1/api/v1/chats/${room}/realtime`,
      { headers: auth });
    expect(old.status).toBe(404);
    // No server-issued room JWT: old installed Mobile will be forced to update
    // and cannot revive a banned subscription with an old signed token.
  });

  it("disallows nonmember via mounted broker proxy and grants real authorized WS", async () => {
    const { app } = await import("../src/app");
    const denied = await app.request("http://127.0.0.1/internal/chat2/chat2-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json",
        "X-GAFUS-Subscribe-Proxy-Key": process.env.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET! },
      body: JSON.stringify({ user: outsider, channel: `chat2:${room}` }),
    });
    expect(denied.status).toBe(200);
    expect(await denied.json()).toEqual({ error: { code: 403, message: "permission denied" } });
    const { sub } = await subscribe(reader, room);
    expect(sub.state).toBe("subscribed");
    expect(proxyAudit.allowed).toBeGreaterThan(0);
  });
  it("delivers an actual committed message through PostgreSQL outbox and Centrifugo", async () => {
    const { sub } = await subscribe(reader, room);
    const publication = new Promise<string>((resolve) => {
      sub.on("publication", event => {
        const data = event.data as { messageId?: string };
        if (data?.messageId) resolve(data.messageId);
      });
    });
    const sent = await sendMessage(actor, room, {
      clientMessageId: randomUUID(), text: "Synthetic real WS message",
    });
    const outcome = await processChat2OutboxOnce(40);
    expect(outcome.delivered).toBeGreaterThanOrEqual(1);
    expect(await within(publication, "OUTBOX_PUBLICATION")).toBe(sent.id);
    expect((await messages(reader, room)).some(m => m.id === sent.id)).toBe(true);
    const stored = await prisma.chat2OutboxEvent.findFirstOrThrow({
      where: { messageId: sent.id },
    });
    expect(stored.deliveredAt).toBeTruthy();
  });
  it("reconnects a legitimate client with current membership and receives new publications", async () => {
    const first = await subscribe(reader, room);
    first.client.disconnect();
    const second = await subscribe(reader, room);
    const publication = new Promise<string>((resolve) => {
      second.sub.on("publication", event => {
        const data = event.data as { id?: string };
        if (data?.id) resolve(data.id);
      });
    });
    const response = await fetch(`${process.env.GAFUS_ARCHQA_BROKER_URL}/api/publish`, {
      method: "POST", headers: { "Content-Type": "application/json",
        "X-API-Key": process.env.CHAT2_CENTRIFUGO_API_KEY! },
      body: JSON.stringify({ channel: second.channel,
        data: { id: "own-ws-reconnected" } }),
      signal: AbortSignal.timeout(4000),
    });
    expect(response.status).toBe(200);
    expect(await within(publication, "RECONNECT_PUBLICATION")).toBe("own-ws-reconnected");
  });
  it("fails closed when the actor ACL proxy is unavailable, then recovers without stale grants", async () => {
    const proxyPort = Number(process.env.GAFUS_ARCHQA_SUBSCRIBE_PROXY_PORT);
    await new Promise<void>((resolve, reject) =>
      proxyServer!.close(error => error ? reject(error) : resolve()));
    try {
      const { token, wsUrl } = await connectToken(reader);
      const client = new Centrifuge(wsUrl, { token, websocket: WebSocket });
      clients.push(client);
      const sub = client.newSubscription(`chat2:${room}`);
      const first = new Promise<string>((resolve) => {
        sub.on("subscribed", () => resolve("SUBSCRIBED_UNSAFE"));
        sub.on("unsubscribed", () => resolve("DENIED"));
        sub.on("error", () => resolve("DENIED"));
      });
      sub.subscribe(); client.connect();
      expect(await within(first, "PROXY_OUTAGE_DENY", 8000)).toBe("DENIED");
      client.disconnect();
    } finally {
      // Reopen exactly our own loopback handler for the same ephemeral broker.
      proxyServer!.listen(proxyPort, "127.0.0.1");
      await once(proxyServer!, "listening");
    }
    const restored = await subscribe(reader, room);
    expect(restored.sub.state).toBe("subscribed");
    restored.client.disconnect();
  }, 16_000);
  it("group BAN revokes real broker subscription, denies both stale JWT and new proxy-only WS", async () => {
    const { client, sub, channel, roomToken } = await subscribe(reader, room);
    const revoked = new Promise<void>((resolve) => sub.on("unsubscribed", () => resolve()));
    await moderateGroup(actor, room, reader, "BAN");
    await within(revoked, "REVOKED_FROM_BROKER");
    expect(sub.state).toBe("unsubscribed");
    await expect(messages(reader, room))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    // A previously issued 60s subscription JWT must not allow another socket
    // to re-enter the room AFTER the database BAN/revocation. This detects a
    // stateless-JWT replay window rather than merely testing new HTTP grants.
    const { token, wsUrl } = await connectToken(reader);
    const deniedBefore = proxyAudit.denied;
    const replay = new Centrifuge(wsUrl, { token, websocket: WebSocket });
    clients.push(replay);
    const stale = replay.newSubscription(channel, { token: roomToken });
    const reused = new Promise<boolean>((resolve) => {
      stale.on("subscribed", () => resolve(true));
      stale.on("unsubscribed", () => resolve(false));
      stale.on("error", () => resolve(false));
    });
    stale.subscribe(); replay.connect();
    const accepted = await within(reused, "STOLEN_STALE_ROOM_TOKEN", 4500);
    expect(accepted, "BANNED_USER_MUST_NOT_RECONNECT_WITH_OLD_SIGNED_ROOM_JWT").toBe(false);
    // Legacy-token replay is rejected by the broker's DISTINCT subscription
    // signing key BEFORE it can bypass the backend subscribe proxy.
    expect(proxyAudit.denied).toBe(deniedBefore);
    // Invalid legacy signed token must be rejected at the broker, even if
    // subscribe proxy would otherwise be bypassed for token-bearing requests.
    const fresh = new Centrifuge(wsUrl, { token, websocket: WebSocket });
    clients.push(fresh);
    const untrusted = fresh.newSubscription(channel);
    const denied = new Promise<boolean>((resolve) => {
      untrusted.on("subscribed", () => resolve(true));
      untrusted.on("unsubscribed", () => resolve(false));
      untrusted.on("error", () => resolve(false));
    });
    untrusted.subscribe(); fresh.connect();
    expect(await within(denied, "PROXY_DENIES_AFTER_BAN", 4000)).toBe(false);
    // A proxy-only retry after BAN actually reaches the PROJECT's mounted
    // Hono route and is denied by the persisted room ACL, not by token expiry.
    expect(proxyAudit.denied).toBeGreaterThan(deniedBefore);
    replay.disconnect(); fresh.disconnect(); client.disconnect();
  });
});
