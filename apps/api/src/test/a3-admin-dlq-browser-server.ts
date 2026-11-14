/** Loopback-only browser QA server. Not an application entrypoint, no real user auth.
 * Actual adminMediaRoutes + Prisma-backed diagnostics, but test-only synthetic role.
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { a3AdminDlqFixture as fixture } from "../../../../packages/prisma/tests/a3AdminDlqFixture";
import { adminMediaRoutes } from "../routes/v1/admin-media";

const url = process.env.DATABASE_URL ?? "";
if (process.env.GAFUS_A3_ADMIN_DLQ_ISOLATED_QA !== "1" ||
    process.env.GAFUS_A3_ADMIN_DLQ_BROWSER_QA !== "1" ||
    !/^postgresql:\/\/a3qa@127\.0\.0\.1:\d+\/postgres(?:\?|$)/.test(url)) {
  throw Error("A3_BROWSER_REQUIRES_DISPOSABLE_LOOPBACK_DB");
}
let role: "ADMIN" | "MODERATOR" = "ADMIN";
const app = new Hono();
app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.set("user", { id: "a3-local-synthetic", username: "qa-operator", role } as never);
  await next();
});
const actor = () => ({ id: "a3-local-synthetic", username: "qa-operator", role });
const stats = Object.fromEntries([
  "totalExamResults", "withVideo", "withoutVideo", "deletedVideos",
  "completedWithVideo", "pendingWithVideo", "completedOlderThan30Days",
  "pendingOlderThan90Days", "deletedByReplacement", "deletedByAutoCleanupCompleted",
  "deletedByAutoCleanupPending",
].map(key => [key, 0]));
app.get("/api/v1/auth/me", c => c.json({ success: true, data: actor() }));
app.get("/api/v1/admin/media/stats", c => c.json({ success: true, data: stats }));
app.get("/api/v1/admin/mail/alerts", c => c.json({ success: true, data: { count: 0 } }));
app.get("/api/v1/a3-qa/role", c => {
  if (c.req.query("role") === "ADMIN") role = "ADMIN";
  else if (c.req.query("role") === "MODERATOR") role = "MODERATOR";
  else return c.json({ success: false, code: "INVALID_ROLE" }, 400);
  return c.json({ success: true, data: { role } });
});
app.get("/api/v1/a3-qa/state", async c =>
  c.json({ success: true, data: await fixture.state(1) }));
app.post("/api/v1/a3-qa/seed", async c => {
  await fixture.reset();
  await fixture.seed(1);
  await fixture.seed(2, { claimed: true });
  return c.json({ success: true });
});
app.route("/api/v1/admin/media", adminMediaRoutes);
await fixture.reset();
await fixture.seed(1);
await fixture.seed(2, { claimed: true });
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3001 });
console.log("A3_ADMIN_BROWSER_LOOPBACK_HONO_READY");
async function stop() {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await fixture.reset().catch(() => undefined);
  await fixture.disconnect();
}
process.once("SIGINT", () => { void stop().then(() => process.exit(0)); });
process.once("SIGTERM", () => { void stop().then(() => process.exit(0)); });
