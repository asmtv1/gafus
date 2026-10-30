/** Real original Hono/Auth/Core/JWT/SQL against the attested local WORK copy.
 * NO production access. Skipped unless explicitly enabled by the guarded runner.
 */
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdirSync, rmSync, existsSync, lstatSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { corsMiddleware } from "../../middleware/cors";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { authRoutes } from "./auth";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const ENABLED = process.env.GAFUS_AUTH_ISOLATED_WORK_TEST === "1";
const expected = {
  hostname: "127.0.0.1", port: "55921",
  pathname: "/gafus_refactor_real_work_20261024", username: "gafus_refactor_local_real",
};
if (ENABLED) {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
  if (Object.entries(expected).some(([key, value]) => url[key as keyof URL] !== value) ||
      !url.password || url.search !== "?schema=public" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
      process.env.GAFUS_LOCAL_BROWSER_AUTH !== "1" ||
      process.env.API_HOST !== "127.0.0.1" || process.env.API_PORT !== "3001" ||
      process.env.REDIS_URL !== "redis://127.0.0.1:55927/1" ||
      process.cwd() !== `${ROOT}/apps/api`) {
    throw new Error("DENIED: auth session test requires exact local Refactor WORK DB and attested API flags");
  }
}
const suite = ENABLED ? describe : describe.skip;
const app = new Hono();
app.route("/api/v1/auth", authRoutes);
const path = (suffix: string) => `http://127.0.0.1:3001/api/v1/auth/${suffix}`;
const origin = "http://127.0.0.1:5173";
const browserHeaders = { "Content-Type": "application/json", Origin: origin, "X-Gafus-Auth-Transport": "cookie" };
function cookies(response: Response): string {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}
function post(suffix: string, headers: Record<string, string>, body: object) {
  return app.request(path(suffix), { method: "POST", headers, body: JSON.stringify(body) });
}
function getMe(headers: Record<string, string>) { return app.request(path("me"), { headers }); }

suite("refactor-only original Hono session and SQL integration", () => {
  let id: string;
  let username: string;
  const password = "SyntheticWorkPass9!";
  beforeAll(async () => {
    const rows = await prisma.$queryRaw<Array<{ db: string; actor: string }>>`
      SELECT current_database() AS db, current_user AS actor`;
    expect(rows[0]).toEqual({ db: "gafus_refactor_real_work_20261024", actor: "gafus_refactor_local_real" });
  });
  beforeEach(async () => {
    id = randomUUID();
    username = `authwork_${id.replaceAll("-", "").slice(0, 20)}`;
    await prisma.user.create({ data: {
      id, username, email: `${username}@example.test`, password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(), role: "USER", registrationPending: false,
    } });
  });
  afterEach(async () => {
    if (!id || !username.startsWith("authwork_")) return;
    const user = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (user?.username !== username) throw new Error("DENIED: synthetic test cleanup ownership mismatch");
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    if (user) await prisma.user.delete({ where: { id } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("real packaged Chrome: browser-managed HttpOnly cookies across original TCP Hono", async () => {
    const chrome = join(ROOT, "apps/admin-panel/.ag4-w1-browser-hono-20261017/browsers/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (!existsSync(chrome) || lstatSync(chrome).isSymbolicLink()) throw new Error("LOCAL_CHROME_UNAVAILABLE");
    const client = new Hono();
    client.use("/api/v1/auth/*", corsMiddleware);
    client.route("/api/v1/auth", authRoutes);
    const nodeServer = serve({ fetch: client.fetch, port: 3001, hostname: "127.0.0.1" });
    // An ephemeral unprivileged page origin. Actual cross-port browser fetches
    // set Origin/Cookie themselves; do not forge either header in test JS.
    const html = `<!doctype html><html><body><main id="status">PENDING</main><script>
      (async()=>{
        const el=document.querySelector('#status');
        try {
          const base='http://127.0.0.1:3001/api/v1/auth/';
          const headers={'Content-Type':'application/json','X-Gafus-Auth-Transport':'cookie'};
          const options=(method)=>({method,credentials:'include',headers,body:JSON.stringify({})});
          const login=await fetch(base+'login',{...options('POST'),body:JSON.stringify(${JSON.stringify({ username, password })})});
          if(login.status!==200){el.textContent='LOGIN_'+login.status;return;}
          if(document.cookie.includes('gafus_')){el.textContent='COOKIE_JS_VISIBLE';return;}
          const me=await fetch(base+'me',{credentials:'include'});
          if(me.status!==200){el.textContent='ME_'+me.status;return;}
          const refresh=await fetch(base+'refresh',options('POST'));
          if(refresh.status!==200){el.textContent='REFRESH_'+refresh.status;return;}
          const me2=await fetch(base+'me',{credentials:'include'});
          if(me2.status!==200){el.textContent='ME2_'+me2.status;return;}
          const logout=await fetch(base+'logout',options('POST'));
          if(logout.status!==200){el.textContent='LOGOUT_'+logout.status;return;}
          const me3=await fetch(base+'me',{credentials:'include'});
          if(me3.status!==401){el.textContent='ME_AFTER_LOGOUT_'+me3.status;return;}
          el.textContent='AUTH_BROWSER_REAL_PASS';
        }catch(e){el.textContent='BROWSER_FETCH_ERROR';}
      })();
    </script></body></html>`;
    const browserServer = createHttpServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(html);
    });
    const profile = join(ROOT, ".local-pg-scratch", `auth-browser-real-${randomUUID()}`);
    mkdirSync(profile, { mode: 0o700 });
    try {
      await new Promise<void>((resolve, reject) => {
        browserServer.once("error", reject);
        browserServer.listen(5173, "127.0.0.1", resolve);
      });
      const run = promisify(execFile);
      const output = await run(chrome, [
        "--headless=old", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--disable-background-networking", "--disable-extensions", "--disable-sync",
        "--disable-crash-reporter", "--disable-features=Crashpad", "--no-first-run",
        "--no-proxy-server", "--virtual-time-budget=9000",
        `--user-data-dir=${profile}`, "--dump-dom",
        "http://127.0.0.1:5173/api/v1/local-browser-check",
      ], {
        timeout: 25_000, maxBuffer: 4 * 1024 * 1024,
        env: { NODE_ENV: "development", PATH: process.env.PATH ?? "", HOME: join(ROOT, ".local-pg-scratch"), TMPDIR: join(ROOT, ".local-pg-scratch") + "/" },
      });
      const match = output.stdout.match(/<main id="status">([^<]*)<\/main>/);
      expect(match?.[1]).toBe("AUTH_BROWSER_REAL_PASS");
      expect(await prisma.refreshToken.count({ where: { userId: id, revokedAt: null } })).toBe(0);
    } finally {
      await new Promise<void>((resolve) => browserServer.close(() => resolve()));
      await new Promise<void>((resolve) => nodeServer.close(() => resolve()));
      rmSync(profile, { recursive: true, force: true });
    }
  }, 45_000);

  it("native login -> JWT /me -> logout revokes refresh and access on real SQL", async () => {
    const login = await post("login", { "Content-Type": "application/json" }, { username, password });
    expect(login.status).toBe(200);
    const body = await login.json() as { data: { accessToken: string; refreshToken: string } };
    const auth = { Authorization: `Bearer ${body.data.accessToken}` };
    expect((await getMe(auth)).status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: id, revokedAt: null } })).toBe(1);
    const logout = await post("logout", { "Content-Type": "application/json" }, { refreshToken: body.data.refreshToken });
    expect(logout.status).toBe(200);
    expect((await getMe(auth)).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: id, revokedAt: null } })).toBe(0);
  });

  it("real browser cookies: trusted origin, CSRF denial, refresh rotation, revoke", async () => {
    const login = await post("login", browserHeaders, { username, password });
    expect(login.status).toBe(200);
    expect(login.headers.getSetCookie()).toHaveLength(2);
    expect(login.headers.getSetCookie().every((c) => c.includes("HttpOnly") && c.includes("Secure"))).toBe(true);
    const oldCookie = cookies(login);
    expect((await getMe({ Cookie: oldCookie })).status).toBe(200);
    expect((await post("refresh", { "Content-Type": "application/json", "X-Gafus-Auth-Transport": "cookie", Cookie: oldCookie }, {})).status).toBe(403);
    const refresh = await post("refresh", { ...browserHeaders, Cookie: oldCookie }, {});
    expect(refresh.status).toBe(200);
    const nextCookie = cookies(refresh);
    expect((await getMe({ Cookie: oldCookie })).status).toBe(401);
    expect((await getMe({ Cookie: nextCookie })).status).toBe(200);
    expect((await post("logout", { ...browserHeaders, Cookie: nextCookie }, {})).status).toBe(200);
    expect((await getMe({ Cookie: nextCookie })).status).toBe(401);
  });

  it("an existing privileged JWT is rejected after DB role demotion", async () => {
    await prisma.user.update({ where: { id }, data: { role: "ADMIN" } });
    const login = await post("login", { "Content-Type": "application/json" }, { username, password });
    expect(login.status).toBe(200);
    const json = await login.json() as { data: { accessToken: string } };
    const auth = { Authorization: `Bearer ${json.data.accessToken}` };
    expect((await getMe(auth)).status).toBe(200);
    await prisma.user.update({ where: { id }, data: { role: "USER" } });
    expect((await getMe(auth)).status).toBe(401);
  });

  it("logout-all invalidates two active native sessions and all their JWTs", async () => {
    const headers = { "Content-Type": "application/json" };
    const first = await post("login", headers, { username, password });
    const second = await post("login", headers, { username, password });
    expect([first.status, second.status]).toEqual([200, 200]);
    const one = await first.json() as { data: { accessToken: string; refreshToken: string } };
    const two = await second.json() as { data: { accessToken: string; refreshToken: string } };
    const principalOne = { Authorization: `Bearer ${one.data.accessToken}` };
    const principalTwo = { Authorization: `Bearer ${two.data.accessToken}` };
    expect(await prisma.refreshToken.count({ where: { userId: id, revokedAt: null } })).toBe(2);
    expect((await post("logout-all", { ...headers, ...principalOne }, {})).status).toBe(200);
    expect((await getMe(principalOne)).status).toBe(401);
    expect((await getMe(principalTwo)).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: id, revokedAt: null } })).toBe(0);
  });

  it("delayed refresh replay revokes all sessions and access credentials", async () => {
    const login = await post("login", browserHeaders, { username, password });
    expect(login.status).toBe(200);
    const previous = cookies(login);
    const rotated = await post("refresh", { ...browserHeaders, Cookie: previous }, {});
    expect(rotated.status).toBe(200);
    const current = cookies(rotated);
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 12_000) },
    });
    const replay = await post("refresh", { ...browserHeaders, Cookie: previous }, {});
    expect(replay.status).toBe(401);
    const payload = await replay.json() as { code: string };
    expect(payload.code).toBe("TOKEN_REUSE_DETECTED");
    expect((await getMe({ Cookie: current })).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: id, revokedAt: null } })).toBe(0);
  });

  it("two concurrent browser refreshes have exactly one SQL winner, never 500", async () => {
    const login = await post("login", browserHeaders, { username, password });
    expect(login.status).toBe(200);
    const oldCookie = cookies(login);
    const results = await Promise.all([
      post("refresh", { ...browserHeaders, Cookie: oldCookie }, {}),
      post("refresh", { ...browserHeaders, Cookie: oldCookie }, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.refreshToken.count({ where: { userId: id, revokedAt: null } })).toBe(1);
    expect((await getMe({ Cookie: oldCookie })).status).toBe(401);
    const winner = results.find((r) => r.status === 200)!;
    expect((await getMe({ Cookie: cookies(winner) })).status).toBe(200);
  });
});
