/** AG1 consultation positive signed Hono/WORK SQL, synthetic no-recipient accounts. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_cons_http_20261025_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const actors: Actor[] = [];
let cynId = "",
  trainerId = "",
  bookId = "";
let slotId = "";
function obj(u: unknown): Record<string, unknown> {
  return u !== null && typeof u === "object" && !Array.isArray(u)
    ? (u as Record<string, unknown>)
    : {};
}
function ensure(v: unknown, key: string): asserts v {
  if (!v) throw Error("ASSERT_" + key);
}
function pass(name: string) {
  console.warn("AG1_CONS_WORK_HTTP " + name + "=PASS");
}
async function http(path: string, method = "GET", who?: Actor, body?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(who?.token ? { Authorization: "Bearer " + who.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: r.status, data: obj(await r.json()) };
}
async function actor(suffix: string, role: "USER" | "TRAINER") {
  const password = randomBytes(28).toString("base64url");
  const user = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      role,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
      // No email, no PushSubscription: real external messages cannot have recipients.
    },
  });
  const v: Actor = { id: user.id, username: user.username, password };
  actors.push(v);
  const res = await http("/auth/login", "POST", undefined, { username: v.username, password });
  ensure(res.status === 200 && res.data.success === true, "REAL_LOGIN");
  const token = obj(res.data.data).accessToken;
  ensure(typeof token === "string" && token.length > 30, "JWT");
  v.token = token;
  return v;
}
async function grantSyntheticEntitlement(userId: string) {
  return prisma.appSubscription.create({
    data: {
      userId,
      provider: "MANUAL",
      status: "ACTIVE",
      planCode: "THREE_MONTHS",
      currentPeriodStart: new Date(Date.now() - 3600000),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
      manualReason: "AG1 WORK synthetic consultation E2E; no payment",
    },
  });
}
async function cleanup() {
  if (bookId) {
    // Registered Hono cancellation owns its synthetic SLA queue job.
    // Never import the shared queue barrel into this test process: it can
    // attach to a default Redis instance and keep this acceptance alive.
    const owner = actors.find((a) => a.username === prefix + "_client");
    const row = await prisma.consultationBooking.findUnique({
      where: { id: bookId },
      select: { status: true, clientId: true },
    });
    if (
      owner &&
      row?.clientId === owner.id &&
      ["PENDING_TRAINER_CONFIRMATION", "CONFIRMED"].includes(row.status)
    ) {
      await http("/consultations/bookings/" + bookId + "/cancel", "POST", owner, {}).catch(
        () => undefined,
      );
    }
  }
  if (cynId) {
    await prisma.consultationBooking.deleteMany({ where: { cynologistId: cynId } });
    await prisma.consultationCynologist.deleteMany({ where: { id: cynId, userId: trainerId } });
  }
  for (const a of actors) {
    const u = await prisma.user.findUnique({ where: { id: a.id }, select: { username: true } });
    if (u?.username === a.username && a.username.startsWith(prefix)) {
      await prisma.user.delete({ where: { id: a.id } });
    }
  }
}
async function main() {
  ensure(process.env.AG1_CONS_WORK_HTTP === "1", "EXPLICIT_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["127.0.0.1", "localhost"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_DB_ONLY",
  );
  const meta = await prisma.$queryRaw<{ db: string; version: string }[]>`
 SELECT current_database() AS db,current_setting('server_version_num') AS version`;
  ensure(
    meta[0]?.db === "gafus_refactor_real_work_20261024" && meta[0].version === "180004",
    "WORK_PG18",
  );
  ensure(
    (
      await fetch("http://127.0.0.1:3001/health", {
        signal: AbortSignal.timeout(4000),
      })
    ).status === 200,
    "HONO_HEALTH",
  );
  pass("WORK_PG18_REAL_HONO");
  const trainer = await actor("trainer", "TRAINER");
  trainerId = trainer.id;
  const client = await actor("client", "USER"),
    other = await actor("other", "USER");
  const noEntitlement = await http("/consultations/my", "GET", client);
  ensure(
    noEntitlement.status === 200 && obj(noEntitlement.data.data).items instanceof Array,
    "MY_EMPTY_GET",
  );
  const badBook = await http("/consultations/book", "POST", client, {
    slotId: "nonexisting-synthetic",
    idempotencyKey: randomUUID(),
    clientOwnerName: "AG1 Synthetic",
    clientPhone: "+79990000000",
    petName: "AG1 test dog",
    petGender: "MALE",
    petAge: "3",
    petBreed: "mixed",
    clientProblem: "SYNTHETIC ONLY",
    clientSelfHelpAttempt: "SYNTHETIC ONLY",
  });
  ensure(
    badBook.status === 402 && badBook.data.code === "SUBSCRIPTION_REQUIRED",
    "NO_SUBSCRIPTION_402_" + badBook.status + "_" + String(badBook.data.code ?? "NO_CODE"),
  );
  pass("REAL_JWT_MY_EMPTY_AND_SUBSCRIPTION_GATE_402");
  await grantSyntheticEntitlement(client.id);
  await grantSyntheticEntitlement(other.id);
  cynId = (
    await prisma.consultationCynologist.create({
      data: {
        userId: trainerId,
        isListed: true,
        slotHorizonDays: 12,
        bookingLeadTimeMin: 5,
        slotDurationMin: 30,
      },
    })
  ).id;
  for (let day = 0; day < 7; day++)
    await prisma.consultationAvailabilityRule.create({
      data: {
        cynologistId: cynId,
        weekday: day,
        startTime: "12:00",
        endTime: "14:00",
        isWorkingDay: true,
      },
    });
  const from = new Date(Date.now() + 6 * 86400000),
    to = new Date(Date.now() + 9 * 86400000);
  const path =
    "/consultations/cynologists/" +
    trainerId +
    "/slots?from=" +
    encodeURIComponent(from.toISOString()) +
    "&to=" +
    encodeURIComponent(to.toISOString());
  const catalog = await http("/consultations/cynologists", "GET", client);
  ensure(catalog.status === 200 && catalog.data.success === true, "CATALOG_200");
  const cards = catalog.data.data;
  ensure(
    cards instanceof Array && cards.some((c) => obj(c).userId === trainerId),
    "CATALOG_SYNTHETIC_TRAINER",
  );
  const slots = await http(path, "GET", client);
  ensure(slots.status === 200 && slots.data.success === true, "SLOTS_200");
  const values = slots.data.data;
  ensure(values instanceof Array && values.length > 0, "ACTUAL_SYNTHETIC_SLOTS");
  const choice = obj(values[0]);
  slotId = choice.id as string;
  ensure(typeof slotId === "string" && slotId.length > 5, "SLOT_ID");
  const foreignVerify = await http(
    "/consultations/cynologists/" + trainerId + "/slots/" + slotId + "/verify",
    "GET",
    client,
  );
  ensure(foreignVerify.status === 200, "REAL_FREE_VERIFY");
  pass("LISTED_CYNOLOGISTS_SYNTHETIC_CALENDAR_VERIFY");
  const key = randomUUID();
  const intake = {
    slotId,
    idempotencyKey: key,
    clientOwnerName: "AG1 Client",
    clientPhone: "+79990000000",
    petName: "AG1 Test Dog",
    petGender: "MALE",
    petAge: "3",
    petBreed: "Mixed",
    clientProblem: "Synthetic scenario only",
    clientSelfHelpAttempt: "Synthetic scenario only",
  };
  const booked = await http("/consultations/book", "POST", client, intake);
  ensure(
    booked.status === 201 && booked.data.success === true,
    "BOOK_CREATED_201_" + booked.status + "_" + String(booked.data.code ?? "NO_CODE"),
  );
  const booking = obj(booked.data.data);
  ensure(booking.kind === "created", "BOOK_KIND");
  bookId = obj(booking.booking).id as string;
  ensure(typeof bookId === "string" && bookId.length > 10, "BOOKING_ID");
  const physical = await prisma.consultationBooking.findUnique({ where: { id: bookId } });
  ensure(
    physical?.clientId === client.id &&
      physical.slotId === slotId &&
      physical.status === "PENDING_TRAINER_CONFIRMATION",
    "BOOKING_PHYSICAL_SQL",
  );
  const receipt = await prisma.consultationBookingIdempotency.findUnique({
    where: { clientId_key: { clientId: client.id, key } },
  });
  ensure(receipt?.bookingId === bookId, "DURABLE_RECEIPT_SQL");
  const my = await http("/consultations/my", "GET", client);
  const myItems = obj(my.data.data).items;
  ensure(
    my.status === 200 && myItems instanceof Array && myItems.some((v) => obj(v).id === bookId),
    "MY_BOOKING_GET",
  );
  const strangers = await http("/consultations/my", "GET", other);
  const strangerItems = obj(strangers.data.data).items;
  ensure(
    strangers.status === 200 &&
      strangerItems instanceof Array &&
      !strangerItems.some((v) => obj(v).id === bookId),
    "FOREIGN_MY_PRIVATE",
  );
  pass("SIGNED_BOOKING_SQL_RECEIPT_MY_OWNER_PRIVATE");
  const replay = await http("/consultations/book", "POST", client, intake);
  ensure(
    replay.status === 200 &&
      obj(replay.data.data).kind === "idempotent_replay" &&
      obj(obj(replay.data.data).booking).id === bookId,
    "LOST_ACK_REPLAY",
  );
  const conflict = await http("/consultations/book", "POST", client, {
    ...intake,
    petName: "AG1 Other Dog",
  });
  ensure(
    conflict.status === 409 && conflict.data.code === "CONSULTATION_IDEMPOTENCY_CONFLICT",
    "INTENT_CONFLICT_409",
  );
  const lookup = await http("/consultations/book/lookup", "POST", client, { idempotencyKey: key });
  ensure(lookup.status === 200 && obj(lookup.data.data).state === "FOUND", "LOOKUP_FOUND");
  const foreignLookup = await http("/consultations/book/lookup", "POST", other, {
    idempotencyKey: key,
  });
  ensure(
    foreignLookup.status === 200 && obj(foreignLookup.data.data).state === "UNKNOWN",
    "LOOKUP_FOREIGN_UNKNOWN",
  );
  ensure((await prisma.consultationBooking.count({ where: { slotId } })) === 1, "BOOKING_ONE_ROW");
  pass("IDEMPOTENT_REPLAY_CHANGED_INTENT_409_LOOKUP_PRIVACY");
  const foreignCancel = await http(
    "/consultations/bookings/" + bookId + "/cancel",
    "POST",
    other,
    {},
  );
  ensure(foreignCancel.status === 403, "CANCEL_OWNER_DENIED");
  const ownCancel = await http("/consultations/bookings/" + bookId + "/cancel", "POST", client, {});
  ensure(ownCancel.status === 200, "CLIENT_CANCEL_200");
  const post = await prisma.consultationBooking.findUnique({ where: { id: bookId } });
  const slot = await prisma.consultationSlot.findUnique({ where: { id: slotId } });
  ensure(post?.status === "CANCELLED_BY_USER" && slot?.status === "FREE", "CANCEL_SQL_SLOT_FREE");
  const ownerAfter = await http("/consultations/my", "GET", client);
  ensure(
    ownerAfter.status === 200 &&
      (obj(ownerAfter.data.data).items as unknown[]).some(
        (v) => obj(v).id === bookId && obj(v).status === "CANCELLED_BY_USER",
      ),
    "MY_RECONCILE",
  );
  pass("FOREIGN_CANCEL_403_OWNER_CANCEL_SLOT_RELEASE_SQL_GET");
}
void (async () => {
  try {
    await main();
  } catch (e) {
    process.exitCode = 1;
    console.error(
      "AG1_CONS_REAL_HTTP_FAILED",
      e instanceof Error && e.message.startsWith("ASSERT_") ? e.message : "UNEXPECTED_REDACTED",
    );
  } finally {
    try {
      await cleanup();
      console.warn("AG1_CONS_WORK_HTTP_SYNTHETIC_CLEANUP=PASS");
    } catch {
      process.exitCode = 1;
      console.error("AG1_CONS_WORK_HTTP_CLEANUP_REVIEW_REQUIRED");
    }
    await prisma.$disconnect();
  }
})();
