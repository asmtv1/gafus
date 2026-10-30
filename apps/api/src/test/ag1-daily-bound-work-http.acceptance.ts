/** Original registered Hono + genuine login -> permanent local WORK PostgreSQL; no push worker. */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_daily_http_20261025_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
let authorId = "",
  studentId = "",
  nativeId = "",
  bundleId = "",
  scheduleId = "";
let stepA = "",
  stepB = "",
  linkA = "",
  linkB = "",
  date: Date;
type Json = {
  success?: boolean;
  code?: string;
  data?: {
    accessToken?: string;
    onlineStepBinding?: string;
    serverNow?: string;
    steps?: {
      bundleStepId?: string;
      stepId?: string;
      status?: string;
      timerSnapshot?: { remainingSecAtServerNow: number | null; expiresAt: string | null };
    }[];
  };
};
function ensure(v: unknown, msg: string): asserts v {
  if (!v) throw Error("ASSERT_" + msg);
}
function pass(label: string) {
  console.warn("AG1_DAILY_REAL_HTTP " + label + "=PASS");
}
async function http(path: string, token?: string, method = "GET", body?: unknown, bound = false) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(bound ? { "X-Gafus-Web-Daily-Binding": "1" } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: res.status, data: (await res.json()) as Json };
}
async function createUser(suffix: string, role: "TRAINER" | "USER") {
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({
    data: {
      username: prefix + suffix,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
      role,
    },
  });
  return { id: user.id, username: user.username, password };
}
async function login(username: string, password: string) {
  const res = await http("/auth/login", undefined, "POST", { username, password });
  ensure(res.status === 200 && res.data.success === true, "GENUINE_LOGIN");
  const value = res.data.data?.accessToken;
  ensure(typeof value === "string" && value.length > 30, "GENUINE_JWT");
  return value as string;
}
async function progress(userId: string) {
  return prisma.dailyCourseUserStep.findMany({
    where: { dailyCourseUserTraining: { userId, scheduleId } },
    select: { bundleStepId: true, status: true, remainingSec: true },
  });
}
async function cleanup() {
  if (scheduleId && authorId)
    await prisma.dailyCourseSchedule.deleteMany({
      where: { id: scheduleId, createdById: authorId },
    });
  if (bundleId && authorId)
    await prisma.dailyCourseBundle.deleteMany({ where: { id: bundleId, authorId } });
  for (const sid of [stepA, stepB])
    if (sid && authorId) await prisma.step.deleteMany({ where: { id: sid, authorId } });
  for (const uid of [studentId, nativeId, authorId]) {
    if (!uid) continue;
    const current = await prisma.user.findUnique({
      where: { id: uid },
      select: { username: true },
    });
    if (current?.username.startsWith(prefix)) await prisma.user.delete({ where: { id: uid } });
  }
}
async function main() {
  ensure(process.env.AG1_DAILY_BOUND_WORK_HTTP === "1", "EXPLICIT_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["localhost", "127.0.0.1"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_DB_ONLY",
  );
  const m = await prisma.$queryRaw<{ db: string; version: string }[]>`
    SELECT current_database() AS db, current_setting('server_version_num') AS version`;
  ensure(m[0]?.db === "gafus_refactor_real_work_20261024" && m[0]?.version === "180004", "PG18");
  ensure(
    (await fetch("http://127.0.0.1:3001/health", { signal: AbortSignal.timeout(4500) })).status ===
      200,
    "REAL_HONO_HEALTH",
  );
  pass("REAL_HONO_WORK_PG18");
  const trainer = await createUser("_trainer", "TRAINER");
  authorId = trainer.id;
  const student = await createUser("_student", "USER");
  studentId = student.id;
  const native = await createUser("_native", "USER");
  nativeId = native.id;
  const ownToken = await login(student.username, student.password);
  const nativeToken = await login(native.username, native.password);
  pass("TWO_GENUINE_LOGINS");
  stepA = (
    await prisma.step.create({
      data: {
        authorId,
        title: "AG1 synthetic daily A",
        type: "TRAINING",
        durationSec: 1000,
        isDailyCourse: true,
      },
    })
  ).id;
  stepB = (
    await prisma.step.create({
      data: {
        authorId,
        title: "AG1 synthetic daily B",
        type: "PRACTICE",
        durationSec: 1000,
        isDailyCourse: true,
      },
    })
  ).id;
  bundleId = (
    await prisma.dailyCourseBundle.create({
      data: {
        authorId,
        title: "AG1 synthetic daily Hono",
        type: "daily_course",
      },
    })
  ).id;
  linkA = (
    await prisma.dailyCourseBundleStep.create({ data: { bundleId, stepId: stepA, order: 0 } })
  ).id;
  linkB = (
    await prisma.dailyCourseBundleStep.create({ data: { bundleId, stepId: stepB, order: 1 } })
  ).id;
  for (let d = 1; d <= 27; d++) {
    const candidate = new Date(Date.UTC(2014, 2, d));
    const existing = await prisma.dailyCourseSchedule.findFirst({
      where: { date: candidate },
      select: { id: true },
    });
    if (!existing) {
      date = candidate;
      break;
    }
  }
  ensure(date!, "AVAILABLE_HISTORICAL_DATE");
  scheduleId = (
    await prisma.dailyCourseSchedule.create({
      data: {
        date: date!,
        bundleId,
        createdById: authorId,
        isPublished: true,
      },
    })
  ).id;
  const url = "/daily-course/day?scheduleId=" + encodeURIComponent(scheduleId);
  const get = await http(url, ownToken, "GET", undefined, true);
  ensure(get.status === 200 && get.data.success, "BOUND_GET_200");
  const day = get.data.data;
  ensure(day?.onlineStepBinding === "BUNDLE_STEP_ID_V1", "BOUND_MARKER");
  ensure(Number.isFinite(Date.parse(day.serverNow ?? "")), "SERVER_NOW_REAL_DATE");
  ensure(day.steps && day.steps.length === 2, "BOUND_ARRAY");
  ensure(
    day.steps.length === 2 &&
      day.steps[0].bundleStepId === linkA &&
      day.steps[0].stepId === stepA &&
      day.steps[1].bundleStepId === linkB,
    "BOUND_IDS",
  );
  const old = await http(url, nativeToken);
  ensure(
    old.status === 200 &&
      old.data.success &&
      !old.data.data?.onlineStepBinding &&
      !old.data.data?.serverNow &&
      !old.data.data?.steps?.[0]?.bundleStepId &&
      !old.data.data?.steps?.[0]?.timerSnapshot,
    "LEGACY_WIRE",
  );
  ensure(
    (await prisma.dailyCourseUserTraining.count({ where: { userId: studentId, scheduleId } })) ===
      0,
    "GET_READONLY",
  );
  pass("READ_BOUND_NATIVE_UNCHANGED_ZERO_SQL_WRITES");
  await prisma.dailyCourseBundleStep.update({ where: { id: linkA }, data: { order: 4 } });
  await prisma.dailyCourseBundleStep.update({ where: { id: linkB }, data: { order: 0 } });
  await prisma.dailyCourseBundleStep.update({ where: { id: linkA }, data: { order: 1 } });
  const binding = { scheduleId, stepIndex: 1, expectedBundleStepId: linkB, expectedStepId: stepB };
  const started = await http(
    "/daily-course/step/start",
    ownToken,
    "POST",
    {
      ...binding,
      durationSec: 90,
    },
    true,
  );
  ensure(started.status === 200 && started.data.success === true, "BOUND_START_200");
  const one = await progress(studentId);
  ensure(
    one.length === 1 && one[0].bundleStepId === linkB && one[0].status === "IN_PROGRESS",
    "SQL_B_NOT_A",
  );
  const after = await http(url, ownToken, "GET", undefined, true);
  ensure(
    after.status === 200 &&
      after.data.data?.steps?.[0]?.bundleStepId === linkB &&
      after.data.data?.steps?.[0]?.status === "IN_PROGRESS",
    "GET_RECONCILE",
  );
  pass("REORDER_POST_REAL_SQL_GET_ONLY_B");
  const running = after.data.data?.steps?.[0]?.timerSnapshot;
  ensure(
    Number.isFinite(Date.parse(after.data.data?.serverNow ?? "")) &&
      Number.isFinite(Date.parse(running?.expiresAt ?? "")) &&
      running?.remainingSecAtServerNow !== null &&
      typeof running?.remainingSecAtServerNow === "number" &&
      running.remainingSecAtServerNow >= 88 &&
      running.remainingSecAtServerNow <= 90,
    "RUNNING_TIMER_FROM_PERSISTED_UPDATED_AT",
  );
  const stale = await http(
    "/daily-course/step/complete",
    ownToken,
    "POST",
    {
      ...binding,
      expectedStepId: stepA,
    },
    true,
  );
  ensure(stale.status === 409 && stale.data.code === "STALE_STEP_BINDING", "STALE_409");
  const incomplete = await http(
    "/daily-course/step/start",
    ownToken,
    "POST",
    {
      scheduleId,
      stepIndex: 0,
      durationSec: 90,
    },
    true,
  );
  ensure(
    incomplete.status === 400 && incomplete.data.code === "INVALID_STEP_BINDING",
    "WEB_MISSING_400",
  );
  ensure((await progress(studentId)).length === 1, "NO_OTHER_STEP_SIDE_EFFECT");
  pass("STALE_409_MISSING_400_NO_OTHER_SQL_WRITES");
  const pause = await http(
    "/daily-course/step/pause",
    ownToken,
    "POST",
    { ...binding, timeLeftSec: 35 },
    true,
  );
  ensure(pause.status === 200, "PAUSE_200");
  const paused = (await progress(studentId))[0];
  ensure(paused.bundleStepId === linkB && paused.remainingSec === 35, "PAUSE_SQL_35");
  const pausedResponse = await http(url, ownToken, "GET", undefined, true);
  const pausedTimer = pausedResponse.data.data?.steps?.[0]?.timerSnapshot;
  ensure(
    pausedResponse.status === 200 &&
      pausedTimer?.expiresAt === null &&
      pausedTimer.remainingSecAtServerNow === 35,
    "PAUSED_TIMER_FROM_PHYSICAL_STATE",
  );
  const resume = await http("/daily-course/step/resume", ownToken, "POST", binding, true);
  ensure(resume.status === 200, "RESUME_200");
  const resumedResponse = await http(url, ownToken, "GET", undefined, true);
  const resumedTimer = resumedResponse.data.data?.steps?.[0]?.timerSnapshot;
  ensure(
    resumedResponse.status === 200 &&
      Number.isFinite(Date.parse(resumedTimer?.expiresAt ?? "")) &&
      typeof resumedTimer?.remainingSecAtServerNow === "number" &&
      resumedTimer.remainingSecAtServerNow >= 33 &&
      resumedTimer.remainingSecAtServerNow <= 35,
    "RESUMED_TIMER_FROM_PHYSICAL_STATE",
  );
  pass("SERVER_TIMER_GET_BOUND_RUN_PAUSE_RESUME");
  const complete = await http("/daily-course/step/complete", ownToken, "POST", binding, true);
  ensure(complete.status === 200, "COMPLETE_200");
  const duplicate = await http("/daily-course/step/complete", ownToken, "POST", binding, true);
  ensure(duplicate.status === 200, "REPLAY_COMPLETE_200");
  const rows = await progress(studentId);
  ensure(
    rows.length === 1 && rows[0].bundleStepId === linkB && rows[0].status === "COMPLETED",
    "SQL_ONE_COMPLETION",
  );
  pass("PAUSE_RESUME_COMPLETE_REPLAY_SQL_GET");
  // Former/native request still targets current positional index 0, now B.
  const nativeStart = await http("/daily-course/step/start", nativeToken, "POST", {
    scheduleId,
    stepIndex: 0,
    durationSec: 65,
  });
  ensure(nativeStart.status === 200, "OLD_MOBILE_POST_200");
  const nrows = await progress(nativeId);
  ensure(nrows.length === 1 && nrows[0].bundleStepId === linkB, "OLD_MOBILE_SQL");
  pass("LEGACY_MOBILE_POSITIONAL_POST_COMPATIBLE");
}
void (async () => {
  try {
    await main();
  } catch (e) {
    console.error(
      "AG1_DAILY_REAL_HTTP_FAILED",
      e instanceof Error ? e.message.replace(/postgresql:\/\/\S+/g, "<secret>") : "unknown",
    );
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
      console.warn("AG1_DAILY_REAL_HTTP_SYNTHETIC_CLEANUP=PASS");
    } catch (e) {
      process.exitCode = 1;
      console.error("AG1_DAILY_REAL_HTTP_CLEANUP_FAILED", e instanceof Error ? e.name : "unknown");
    }
    await prisma.$disconnect();
  }
})();
