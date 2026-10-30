/**
 * Opt-in real Hono/Prisma integration test, limited to the named disposable
 * localhost baseline database. Authentication middleware itself is covered
 * separately: this mounts a trusted synthetic actor to exercise actual Core
 * wallet transactions and the HTTP request/response contract together.
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { gafusRoutes } from "./gafus";
import { authMiddleware } from "../../middleware/auth";
import { generateAccessToken } from "@gafus/auth/jwt";

const run = process.env.GAFUS_PARITY_ISOLATED_DB === "1" ? describe : describe.skip;
const suffix = randomBytes(5).toString("hex");
let owner = "";
let articleId = "";
const TEST_JWT_SECRET = "isolated-parity-jwt-unit-only-20261027-very-long";
let previousJwtSecret: string | undefined;

function appFor(actor: string) {
  const app = new Hono();
  app.use("/api/v1/gafus/*", async (c, next) => {
    c.set("user", { id: actor, username: "parity", role: "USER" });
    await next();
  });
  app.route("/api/v1/gafus", gafusRoutes);
  return app;
}
const unlock = (actor: string, body: unknown) =>
  appFor(actor).request("http://local.test/api/v1/gafus/unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

run("Isolated real PostgreSQL and mounted Gafus HTTP unlock", () => {
  beforeAll(async () => {
    const db = new URL(process.env.DATABASE_URL ?? "");
    if (db.hostname !== "localhost" && db.hostname !== "127.0.0.1") {
      throw new Error("REFUSE_REMOTE_DB");
    }
    if (db.port !== "5432" || db.pathname !== "/gafus_refactor_parity_baseline_20261027_1905") {
      throw new Error("REFUSE_NON_ISOLATED_POSTGRES");
    }
    // Never sign with the environment's genuine credential in local acceptance.
    previousJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    const author = await prisma.user.create({
      data: { username: `api_parity_author_${suffix}`, password: "!not-login!", role: "TRAINER" },
    });
    owner = (await prisma.user.create({
      data: { username: `api_parity_student_${suffix}`, password: "!not-login!" },
    })).id;
    articleId = (await prisma.article.create({
      data: {
        title: "HTTP paywalled article",
        slug: `http-paywalled-${suffix}`,
        content: "Premium content",
        authorId: author.id,
        visibility: "PAID",
      },
    })).id;
    // Synthetic test-only credit, no production payments or external accounts.
    await prisma.gafusWallet.create({ data: { userId: owner, balance: 2 } });
  });


  afterAll(() => {
    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it("real Bearer JWT is required, bound to the DB user, and respects session revocation", async () => {
    const student = await prisma.user.create({
      data: {
        username: `jwt_parity_purchaser_${suffix}`,
        password: "!not-login!",
        registrationPending: false,
      },
    });
    await prisma.gafusWallet.create({ data: { userId: student.id, balance: 1 } });
    const jwt = await generateAccessToken(student);
    const app = new Hono();
    app.use("/api/v1/gafus/*", authMiddleware);
    app.route("/api/v1/gafus", gafusRoutes);
    const endpoint = "http://local.test/api/v1/gafus/status";
    const missing = await app.request(endpoint);
    expect(missing.status).toBe(401);
    const authorized = await app.request(endpoint, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get("cache-control")).toBe("no-store");
    expect(await authorized.json()).toMatchObject({ success: true });

    const authenticatedPurchase = await app.request(
      "http://local.test/api/v1/gafus/unlock",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          clientRequestId: `jwt_article_${suffix}_12345678`,
          target: { type: "ARTICLE", articleId },
        }),
      },
    );
    expect(authenticatedPurchase.status).toBe(200);
    expect(await authenticatedPurchase.json()).toMatchObject({
      success: true, data: { spent: 1, balance: 0, replay: false },
    });
    // With a genuine JWT, the charge and grant belong to the token subject.
    expect(await prisma.gafusWallet.findUnique({ where: { userId: student.id } }))
      .toMatchObject({ balance: 0 });
    expect(await prisma.gafusTransaction.count({
      where: { userId: student.id, kind: "SPEND" },
    })).toBe(1);
    expect(await prisma.gafusTargetAccess.count({
      where: { userId: student.id, targetType: "ARTICLE" },
    })).toBe(1);
    expect(await prisma.gafusWallet.findUnique({ where: { userId: owner } }))
      .toMatchObject({ balance: 2 });

    const hostileCookie = await app.request(
      "http://local.test/api/v1/gafus/unlock",
      {
        method: "POST",
        headers: {
          cookie: `gafus_access=${jwt}`,
          origin: "https://attacker.invalid",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          clientRequestId: `hostile_${suffix}_12345678`,
          target: { type: "ARTICLE", articleId },
        }),
      },
    );
    expect(hostileCookie.status).toBe(403);

    // A real revalidated JWT must cease to work when the DB revokes sessions.
    await prisma.user.update({
      where: { id: student.id }, data: { sessionsRevokedAt: new Date(Date.now() + 1000) },
    });
    try {
      const revoked = await app.request(endpoint, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      expect(revoked.status).toBe(401);
    } finally {
      await prisma.user.update({ where: { id: student.id }, data: { sessionsRevokedAt: null } });
    }
  });

  it("HTTP article unlock, status, and idempotent replay agree with the real ledger", async () => {
    const body = {
      clientRequestId: `http_article_${suffix}_12345678`,
      target: { type: "ARTICLE", articleId },
    };
    const first = await unlock(owner, body);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toMatchObject({
      success: true, data: { spent: 1, balance: 1, replay: false, accessSource: "GAFUS" },
    });
    const replay = await unlock(owner, body);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      success: true, data: { spent: 1, balance: 1, replay: true },
    });
    const anotherClient = await unlock(owner, {
      ...body, clientRequestId: `http_again_${suffix}_12345678`,
    });
    expect(anotherClient.status).toBe(200);
    expect(await anotherClient.json()).toMatchObject({
      success: true, data: { spent: 0, balance: 1, replay: true },
    });
    const grants = await prisma.gafusTargetAccess.findMany({
      where: { userId: owner, targetType: "ARTICLE" },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0]?.expiresAt.getTime() - grants[0]!.grantedAt.getTime()).toBe(604800000);
    expect(await prisma.gafusTransaction.count({ where: { userId: owner, kind: "SPEND" } })).toBe(1);
  });

  it("forged owner, price, and unknown target shape fail before database mutation", async () => {
    for (const body of [
      { clientRequestId: `forged_${suffix}_12345678`, userId: "attacker", target: { type: "ARTICLE", articleId } },
      { clientRequestId: `price_${suffix}_12345678`, target: { type: "ARTICLE", articleId, price: 0 } },
      { clientRequestId: `unknown_${suffix}_12345678`, target: { type: "UNKNOWN", articleId } },
    ]) {
      const response = await unlock(owner, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ success: false, code: "GAFUS_VALIDATION_ERROR" });
    }
    expect(await prisma.gafusTransaction.count({ where: { userId: owner, kind: "SPEND" } })).toBe(1);
  });

  it("same client key on another article returns conflict and does not spend a second Gafus", async () => {
    const second = await prisma.article.create({
      data: {
        title: "Another paywalled article",
        slug: `http-another-${suffix}`,
        content: "Other content",
        authorId: (await prisma.article.findUniqueOrThrow({
          where: { id: articleId }, select: { authorId: true },
        })).authorId,
        visibility: "PAID",
      },
    });
    const response = await unlock(owner, {
      clientRequestId: `http_article_${suffix}_12345678`,
      target: { type: "ARTICLE", articleId: second.id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false, code: "GAFUS_IDEMPOTENCY_CONFLICT",
    });
    expect(await prisma.gafusWallet.findUnique({ where: { userId: owner } }))
      .toMatchObject({ balance: 1 });
  });
});
