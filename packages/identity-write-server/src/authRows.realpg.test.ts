import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readAuthUserSummary,
  readLoginCredentials,
  createAuthRefreshToken,
  readAuthRefreshToken,
  rotateAuthRefreshToken,
  revokeAllAuthSessions,
  setAuthPasswordOnce,
  readAuthPasswordForChange,
  changeAuthPasswordCAS,
} from "./authRows";

const suite = describe.runIf(process.env.GAFUS_AUTH_ROWS_REAL_PG === "enabled");
const owner = "auth-rows-qa-owner";
const expiry = new Date("2030-01-01T00:00:00Z");
let isolated = false;

suite("auth row transactions on disposable local PostgreSQL 18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_auth_rows_qa");
    const info = await prisma.$queryRawUnsafe<{ db: string; v: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS v",
    );
    expect(info[0]?.db).toBe("gafus_auth_rows_qa");
    expect(info[0]?.v).toBeGreaterThanOrEqual(180000);
    isolated = true;
    await prisma.user.create({
      data: {
        id: owner,
        username: owner,
        password: "synthetic-hash",
        role: "USER",
        registrationPending: false,
      },
    });
  });
  afterAll(async () => {
    if (!isolated) return;
    await prisma.refreshToken.deleteMany({ where: { userId: owner } });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });
  it("reads only the requested user", async () => {
    expect((await readAuthUserSummary(owner))?.username).toBe(owner);
    expect((await readLoginCredentials(owner))?.registrationPending).toBe(false);
  });
  it("one refresh rotation succeeds under a concurrent second attempt", async () => {
    await createAuthRefreshToken(owner, "qa-original", "qa-hash", { expiresAt: expiry });
    const outcomes = await Promise.all([
      rotateAuthRefreshToken("qa-hash", owner, "qa-next-a", "qa-a", { expiresAt: expiry }),
      rotateAuthRefreshToken("qa-hash", owner, "qa-next-b", "qa-b", { expiresAt: expiry }),
    ]);
    expect(outcomes.sort()).toEqual(["CONFLICT", "ROTATED"]);
    expect((await readAuthRefreshToken("qa-hash"))?.revokedAt).not.toBeNull();
  });
  it("password compare-and-swap rejects stale operations and revokes sessions", async () => {
    expect(await setAuthPasswordOnce(owner, "synthetic-updated")).toBe(true);
    expect(await setAuthPasswordOnce(owner, "synthetic-repeat")).toBe(false);
    expect(await changeAuthPasswordCAS(owner, "synthetic-updated", "synthetic-changed")).toBe(true);
    expect(await changeAuthPasswordCAS(owner, "synthetic-updated", "synthetic-repeat")).toBe(false);
    expect((await readAuthPasswordForChange(owner))?.password).toBe("synthetic-changed");
    await revokeAllAuthSessions(owner);
  });
});
