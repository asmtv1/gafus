/** Opt-in LEARN032: genuine JWT/login -> original Hono -> actual WORK PG18. */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

type ResponseData = Record<string, unknown>;
type Actor = { id: string; username: string; password: string };
const prefix = "ag1_learn032_http_20261025_" + randomBytes(4).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
let phase = "PRECHECK";
let author: Actor | null = null;
let learner: Actor | null = null;
let foreign: Actor | null = null;
let courseId = "";
let courseType = "";
let dayId = "";
let dayOnCourseId = "";
let stepA = "";
let stepB = "";
let occurrenceA = "";
let occurrenceB = "";
const obj = (v: unknown): ResponseData =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as ResponseData) : {};
function ensure(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(`ASSERT_${code}`);
}
function pass(name: string) {
  console.warn(`AG1_LEARN032_HTTP ${name}=PASS`);
}
async function http(path: string, method = "GET", token?: string, body?: unknown, binding = false) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(binding ? { "X-Gafus-Web-Step-Binding": "1" } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(11000),
  });
  return { status: res.status, body: obj(await res.json()) };
}
async function seedActor(role: "TRAINER" | "USER", suffix: string): Promise<Actor> {
  const username = prefix + "_" + suffix;
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({
    data: {
      username,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
      role,
    },
  });
  return { id: user.id, username, password };
}
async function token(actor: Actor) {
  const r = await http("/auth/login", "POST", undefined, {
    username: actor.username,
    password: actor.password,
  });
  ensure(r.status === 200 && r.body.success, "AUTH_LOGIN_200");
  const jwt = obj(r.body.data).accessToken;
  ensure(typeof jwt === "string" && jwt.length > 30, "REAL_AUTH_TOKEN");
  return jwt;
}
const dayPath = () =>
  `/training/day?courseType=${encodeURIComponent(courseType)}&dayOnCourseId=${dayOnCourseId}&createIfMissing=false`;
function detail(r: Awaited<ReturnType<typeof http>>) {
  ensure(r.status === 200 && r.body.success, "DAY_READ_200");
  return obj(r.body.data);
}
async function assertOneStep(target: string, status: string) {
  const rows = await prisma.userStep.findMany({
    where: {
      userTraining: { userId: learner!.id, dayOnCourseId },
    },
  });
  ensure(
    rows.length === 1 && rows[0].stepOnDayId === target && rows[0].status === status,
    `SQL_ONLY_ONE_STEP_${status}`,
  );
}
async function cleanup() {
  if (dayOnCourseId && learner)
    await prisma.userTraining.deleteMany({ where: { dayOnCourseId, userId: learner.id } });
  if (courseId) {
    await prisma.dayOnCourse.deleteMany({ where: { courseId } });
    await prisma.courseAccess.deleteMany({ where: { courseId } });
    await prisma.stepOnDay.deleteMany({ where: { dayId } });
    for (const id of [stepA, stepB])
      if (id) await prisma.step.deleteMany({ where: { id, authorId: author!.id } });
    if (dayId) await prisma.trainingDay.deleteMany({ where: { id: dayId, authorId: author!.id } });
    await prisma.course.deleteMany({ where: { id: courseId, authorId: author!.id } });
  }
  for (const actor of [learner, foreign, author])
    if (actor) {
      const actual = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { username: true },
      });
      if (actual?.username === actor.username && actual.username.startsWith(prefix)) {
        await prisma.user.delete({ where: { id: actor.id } });
      }
    }
}
async function main() {
  ensure(process.env.AG1_LEARN032_WORK_HTTP === "1", "EXPLICIT_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["127.0.0.1", "localhost"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_DB_ONLY",
  );
  const meta = await prisma.$queryRaw<{ name: string; version: string }[]>`
    SELECT current_database() AS name, current_setting('server_version_num') AS version`;
  ensure(
    meta.length === 1 &&
      meta[0].name === "gafus_refactor_real_work_20261024" &&
      meta[0].version === "180004",
    "WORK_DB_VERSION",
  );
  const health = await fetch("http://127.0.0.1:3001/health", { signal: AbortSignal.timeout(5000) });
  ensure(health.status === 200, "ORIGINAL_HONO_HEALTH");
  pass("ORIGINAL_HONO_REAL_PG");
  phase = "SEED";
  author = await seedActor("TRAINER", "author");
  learner = await seedActor("USER", "learner");
  foreign = await seedActor("USER", "foreign");
  courseType = "ag1_l032h_" + randomBytes(5).toString("hex");
  courseId = (
    await prisma.course.create({
      data: {
        name: "AG1 learn032 local fixture",
        type: courseType,
        duration: "1",
        logoImg: "",
        authorId: author.id,
        trainingLevel: "BEGINNER",
        isPrivate: true,
      },
    })
  ).id;
  dayId = (
    await prisma.trainingDay.create({
      data: { title: "AG1 HTTP local lesson", authorId: author.id },
    })
  ).id;
  dayOnCourseId = (await prisma.dayOnCourse.create({ data: { dayId, courseId, order: 1 } })).id;
  stepA = (
    await prisma.step.create({
      data: { title: "AG1 HTTP step A", authorId: author.id, type: "TRAINING", durationSec: 1000 },
    })
  ).id;
  stepB = (
    await prisma.step.create({
      data: { title: "AG1 HTTP step B", authorId: author.id, type: "TRAINING", durationSec: 1000 },
    })
  ).id;
  occurrenceA = (await prisma.stepOnDay.create({ data: { dayId, stepId: stepA, order: 10 } })).id;
  occurrenceB = (await prisma.stepOnDay.create({ data: { dayId, stepId: stepB, order: 30 } })).id;
  await prisma.courseAccess.create({ data: { courseId, userId: learner.id } });
  phase = "LOGIN";
  const ownerToken = await token(learner);
  const foreignToken = await token(foreign);
  pass("TWO_GENUINE_LOGINS");
  phase = "INITIAL_GET";
  const first = detail(await http(dayPath(), "GET", ownerToken, undefined, true));
  ensure(first.onlineStepBinding === "STEP_ON_DAY_ID_V1", "GET_BINDING_MARKER");
  const steps = first.steps as ResponseData[];
  ensure(
    steps.length === 2 &&
      steps[0].stepOnDayId === occurrenceA &&
      steps[1].stepOnDayId === occurrenceB &&
      steps[0].id === stepA &&
      steps[1].id === stepB,
    "GET_OCCURRENCE_PAIRS",
  );
  const legacy = detail(await http(dayPath(), "GET", ownerToken));
  ensure(
    legacy.onlineStepBinding === undefined &&
      !("stepOnDayId" in (legacy.steps as ResponseData[])[0]),
    "LEGACY_NATIVE_GET_UNCHANGED",
  );
  ensure(
    (await prisma.userTraining.count({ where: { userId: learner.id } })) === 0,
    "GET_ZERO_WRITES",
  );
  pass("GET_OPTIN_OCCURRENCE_NATIVE_UNCHANGED_ZERO_WRITES");
  phase = "REORDER_AND_START";
  await prisma.stepOnDay.update({ where: { id: occurrenceA }, data: { order: 40 } });
  await prisma.stepOnDay.update({ where: { id: occurrenceB }, data: { order: 10 } });
  const bound = {
    courseId,
    dayOnCourseId,
    stepIndex: 1,
    expectedStepOnDayId: occurrenceB,
    expectedStepId: stepB,
  };
  const started = await http("/training/step/start", "POST", ownerToken, {
    ...bound,
    durationSec: 1000,
  });
  ensure(started.status === 200 && started.body.success === true, "POST_START_200");
  await assertOneStep(occurrenceB, "IN_PROGRESS");
  const after = detail(await http(dayPath(), "GET", ownerToken, undefined, true));
  const nowSteps = after.steps as ResponseData[];
  ensure(
    nowSteps[0].id === stepB &&
      nowSteps[0].stepOnDayId === occurrenceB &&
      nowSteps[0].status === "IN_PROGRESS" &&
      nowSteps[1].id === stepA &&
      nowSteps[1].status === "NOT_STARTED",
    "GET_REORDER_READBACK",
  );
  pass("REORDER_STALE_INDEX_STARTS_EXACT_OCCURRENCE_B_SQL_GET");
  phase = "STALE_FOREIGN";
  const stale = await http("/training/step/complete/practice", "POST", ownerToken, {
    ...bound,
    expectedStepId: stepA,
  });
  ensure(stale.status === 409 && stale.body.code === "STALE_STEP_BINDING", "STALE_409");
  const foreignDenied = await http("/training/step/complete/practice", "POST", foreignToken, bound);
  ensure(
    foreignDenied.status === 403 && foreignDenied.body.code === "FORBIDDEN",
    "FOREIGN_OWNER_403",
  );
  const incomplete = await http("/training/step/start", "POST", ownerToken, {
    courseId,
    dayOnCourseId,
    stepIndex: 1,
    durationSec: 500,
    expectedStepOnDayId: occurrenceB,
  });
  ensure(
    incomplete.status === 400 && incomplete.body.code === "INVALID_STEP_BINDING",
    "INCOMPLETE_400",
  );
  await assertOneStep(occurrenceB, "IN_PROGRESS");
  pass("STALE_409_FOREIGN_403_INCOMPLETE_400_NO_WRONG_STEP");
  phase = "PAUSE_RESUME_COMPLETE";
  const paused = await http("/training/step/pause", "POST", ownerToken, {
    ...bound,
    timeLeftSec: 42,
  });
  ensure(paused.status === 200, "PAUSE_200");
  const pausedSql = await prisma.userStep.findFirst({
    where: { userTraining: { userId: learner.id }, stepOnDayId: occurrenceB },
  });
  ensure(pausedSql?.paused === true && pausedSql.remainingSec === 42, "PAUSE_SQL");
  const resumed = await http("/training/step/resume", "POST", ownerToken, bound);
  ensure(resumed.status === 200, "RESUME_200");
  const finished = await http("/training/step/complete/practice", "POST", ownerToken, bound);
  ensure(finished.status === 200 && finished.body.success === true, "COMPLETE_200");
  await assertOneStep(occurrenceB, "COMPLETED");
  const reopened = detail(await http(dayPath(), "GET", ownerToken, undefined, true));
  ensure(
    (reopened.steps as ResponseData[])[0].status === "COMPLETED" &&
      (reopened.steps as ResponseData[])[1].status === "NOT_STARTED",
    "REOPEN_GET_SQL",
  );
  pass("PAUSE_RESUME_COMPLETE_PERSIST_REOPEN_GET");
}
try {
  await main();
} catch (e) {
  process.exitCode = 1;
  const code = e instanceof Error && /^ASSERT_/.test(e.message) ? e.message : "UNEXPECTED_REDACTED";
  console.error(`AG1_LEARN032_HTTP FAILED_PHASE=${phase} ${code}`);
} finally {
  try {
    await cleanup();
    pass("SYNTHETIC_FIXTURES_CLEANED");
  } catch {
    process.exitCode = 1;
    console.error("AG1_LEARN032_HTTP CLEANUP_REQUIRES_REVIEW");
  }
  await prisma.$disconnect();
}
