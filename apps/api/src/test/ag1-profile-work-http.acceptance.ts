/** AG1 signed original user/profile Hono + permanent WORK PG18. No external media. */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_profile_http_20261025_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const people: Actor[] = [];
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function ensure(v: unknown, k: string): asserts v {
  if (!v) throw Error("ASSERT_" + k);
}
function pass(k: string) {
  console.warn("AG1_PROFILE_WORK_HTTP " + k + "=PASS");
}
async function request(path: string, method = "GET", actor?: Actor, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(actor?.token ? { Authorization: "Bearer " + actor.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: res.status, data: obj(await res.json()), headers: res.headers };
}
async function create(suffix: string) {
  const pwd = randomBytes(30).toString("base64url");
  const row = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      role: "USER",
      password: await bcrypt.hash(pwd, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
    },
  });
  const a: Actor = { id: row.id, username: row.username, password: pwd };
  people.push(a);
  const logged = await request("/auth/login", "POST", undefined, {
    username: a.username,
    password: a.password,
  });
  ensure(logged.status === 200 && logged.data.success === true, "ACTUAL_LOGIN");
  const token = obj(logged.data.data).accessToken;
  ensure(typeof token === "string" && token.length > 35, "ACTUAL_JWT");
  a.token = token;
  return a;
}
async function cleanup() {
  for (const a of people) {
    const current = await prisma.user.findUnique({
      where: { id: a.id },
      select: { username: true },
    });
    if (current?.username === a.username && a.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: a.id } });
  }
}
async function main() {
  ensure(process.env.AG1_PROFILE_WORK_HTTP === "1", "EXPLICIT_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["127.0.0.1", "localhost"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_PG_ONLY",
  );
  const r = await prisma.$queryRaw<{ db: string; version: string }[]>`
 SELECT current_database() AS db,current_setting('server_version_num') AS version`;
  ensure(r[0]?.db === "gafus_refactor_real_work_20261024" && r[0].version === "180004", "PG18");
  ensure(
    (
      await fetch("http://127.0.0.1:3001/health", {
        signal: AbortSignal.timeout(5000),
      })
    ).status === 200,
    "REAL_HONO",
  );
  pass("WORK_PG18_ORIGINAL_HONO");
  const owner = await create("owner"),
    stranger = await create("stranger");
  pass("TWO_GENUINE_AUTHENTICATED_JWT");
  const initial = await request("/user/profile", "GET", owner);
  ensure(initial.status === 200 && initial.data.success === true, "OWNER_GET");
  ensure(initial.headers.get("cache-control") === "private, no-store", "GET_NO_STORE");
  const naked = await request("/user/profile", "GET");
  ensure(naked.status === 401, "NO_AUTH_DENIED");
  const other = await request("/user/profile", "GET", stranger);
  ensure(other.status === 200 && other.data.success === true, "FOREIGN_GET_OWN_PROFILE");
  const noPublic = await request(
    "/user/profile/public?username=" + encodeURIComponent("does-not-exist-" + prefix),
  );
  ensure(noPublic.status === 404, "NO_PUBLIC_PROFILE");
  pass("OWNER_READ_ONLY_AND_NOAUTH_401");
  const profile = {
    fullName: "AG1 Test Owner",
    city: "Самара",
    birthDate: "2002-03-04",
    about: "AG1 synthetic source to SQL",
    telegram: "@ag1testrunner",
    instagram: "@ag1testrunner",
    website: "https://example.org",
  };
  const updated = await request("/user/profile", "PUT", owner, profile);
  ensure(
    updated.status === 200 && updated.data.success === true,
    "PROFILE_WRITE_200_" + updated.status,
  );
  ensure(updated.headers.get("cache-control") === "private, no-store", "PUT_NO_STORE");
  const physical = await prisma.userProfile.findUnique({ where: { userId: owner.id } });
  ensure(
    physical?.fullName === "AG1 Test Owner" &&
      physical.city === "Самара" &&
      physical.birthDate?.toISOString().startsWith("2002-03-04") &&
      physical.about === "AG1 synthetic source to SQL",
    "SQL_PROFILE_FIELDS",
  );
  const getAfter = await request("/user/profile", "GET", owner);
  const body = obj(getAfter.data.data);
  ensure(getAfter.status === 200 && JSON.stringify(body).includes("Самара"), "GET_SQL_RECONCILE");
  ensure(!JSON.stringify(body).includes(owner.password), "NO_PASSWORD_LEAK");
  pass("PUT_PROFILE_REAL_SQL_GET_PRIVATE");
  const sparse = await request("/user/profile", "PUT", owner, {
    about: "AG1 patch via same PUT",
  });
  ensure(sparse.status === 200, "SPARSE_PUT_200");
  const afterSparse = await prisma.userProfile.findUnique({ where: { userId: owner.id } });
  ensure(
    afterSparse?.fullName === "AG1 Test Owner" &&
      afterSparse.city === "Самара" &&
      afterSparse.about === "AG1 patch via same PUT",
    "OMITTED_UNCHANGED_SQL",
  );
  const cleared = await request("/user/profile", "PUT", owner, {
    telegram: "",
    birthDate: "",
  });
  ensure(cleared.status === 200, "CLEAR_PUT_200");
  const afterClear = await prisma.userProfile.findUnique({ where: { userId: owner.id } });
  ensure(
    afterClear?.birthDate === null &&
      afterClear.telegram === null &&
      afterClear.fullName === "AG1 Test Owner",
    "CLEAR_SQL",
  );
  pass("PARTIAL_PUT_AND_EXPLICIT_CLEAR_SQL");
  const invalidDate = await request("/user/profile", "PUT", owner, { birthDate: "2038-02-31" });
  ensure(invalidDate.status === 400, "INVALID_DATE_400");
  const invalidSocial = await request("/user/profile", "PUT", owner, {
    telegram: "https://not-telegram.example/path",
  });
  ensure(invalidSocial.status === 400, "INVALID_SOCIAL_400");
  const untouched = await prisma.userProfile.findUnique({ where: { userId: owner.id } });
  ensure(
    untouched?.fullName === "AG1 Test Owner" && untouched.about === "AG1 patch via same PUT",
    "INVALID_DID_NOT_CHANGE_SQL",
  );
  pass("INVALID_BIRTHDATE_SOCIAL_NO_WRITES");
  const publicRead = await request(
    "/user/profile/public?username=" + encodeURIComponent(owner.username),
  );
  ensure(publicRead.status === 200 && publicRead.data.success === true, "PUBLIC_DETAIL_200");
  const publicData = obj(publicRead.data.data);
  const serial = JSON.stringify(publicData);
  ensure(
    publicData.username === owner.username &&
      !serial.includes(owner.password) &&
      !serial.includes("password") &&
      !serial.includes("registrationPending") &&
      !serial.includes("email") &&
      !serial.includes("refreshToken"),
    "PUBLIC_WHITELIST_PRIVACY",
  );
  ensure(obj(publicData.profile).city === "Самара", "PUBLIC_CITY_SQL");
  const otherPrivate = await request("/user/profile", "GET", stranger);
  ensure(
    otherPrivate.status === 200 && !JSON.stringify(otherPrivate.data).includes("AG1 Test Owner"),
    "FOREIGN_PRIVATE_OWN_ONLY",
  );
  pass("PUBLIC_PROJECTION_AND_FOREIGN_OWNER_PRIVACY");
}
void (async () => {
  try {
    await main();
  } catch (e) {
    process.exitCode = 1;
    console.error(
      "AG1_PROFILE_WORK_HTTP_FAILED",
      e instanceof Error && e.message.startsWith("ASSERT_") ? e.message : "UNEXPECTED_REDACTED",
    );
  } finally {
    try {
      await cleanup();
      console.warn("AG1_PROFILE_WORK_HTTP_SYNTHETIC_CLEANUP=PASS");
    } catch {
      process.exitCode = 1;
      console.error("AG1_PROFILE_WORK_HTTP_CLEANUP_REVIEW_REQUIRED");
    }
    await prisma.$disconnect();
  }
})();
