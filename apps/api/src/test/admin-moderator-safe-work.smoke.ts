/**
 * Opt-in, strictly WORK-only real Hono/DB acceptance of the MODERATOR role.
 * Creates two uniquely named synthetic accounts, performs only synthetic-account
 * edits and denied calls, and removes both accounts in finally.
 * Never sends notifications, uses providers, or contacts production.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
import { generateAccessToken } from "@gafus/auth/jwt";

const out = (message: string) => process.stdout.write(`${message}\n`);
const root = "/Users/asmtv1/Desktop/gafus-refactor";
const connection = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
const alt = process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE === "1";
const localApiPort = alt ? "3301" : "3001";
const realRoot = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const realBranch = execFileSync("git", ["-C", root, "branch", "--show-current"], { encoding: "utf8" }).trim();
if (
  process.env.GAFUS_ADMIN_MODERATOR_SAFE_WORK !== "1" ||
  process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
  process.cwd() !== `${root}/apps/api` || realRoot !== root || realBranch !== "vite" ||
  connection.hostname !== "127.0.0.1" || connection.port !== "55921" ||
  connection.pathname !== "/gafus_refactor_real_work_20261024" ||
  connection.username !== "gafus_refactor_local_real" || !connection.password ||
  connection.search !== "?schema=public" ||
  process.env.API_HOST !== "127.0.0.1" || process.env.API_PORT !== localApiPort ||
  (alt && process.env.GAFUS_WEB1_ALT_HONO !== "1") ||
  process.env.REDIS_URL !== "redis://127.0.0.1:55927/1" ||
  (process.env.JWT_SECRET?.length ?? 0) < 32
) throw Error("MODERATOR_LIVE_WORK_ISOLATION_DENIED");

const scenarios: readonly [string, string, boolean][] = [
  ["feed-moderation", "/api/v1/admin/moderation/feed/reports", true],
  ["questions", "/api/v1/admin/moderation/questions/reports", false],
  ["users", "/api/v1/admin/users", true],
  ["mail", "/api/v1/admin/mail", false],
  ["media", "/api/v1/admin/media/stats", false],
  ["admin", "/api/v1/admin/settings/subscriptions", true],
  ["partners", "/api/v1/admin/partners", false],
  ["profit", "/api/v1/admin/profit", false],
  ["feature-flags", "/api/v1/admin/feature-flags", true],
  ["broadcasts", "/api/v1/admin/broadcasts/preview", false],
  ["reengagement", "/api/v1/admin/analytics/reengagement", false],
  ["rewarded-ads", "/api/v1/admin/analytics/rewarded-ads?days=30", false],
  ["gafus", "/api/v1/gafus/admin/dashboard", false],
  ["mobile-intro", `/api/v1/mobile-intro/admin/report?${new URLSearchParams({
    start: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    end: new Date(Date.now() + 86_400_000).toISOString(),
  })}`, false],
  ["app-subscriptions", "/api/v1/admin/app-subscriptions", true],
  ["consultations", "/api/v1/consultations/admin/cynologists", false],
  ["bookings", "/api/v1/consultations/admin/bookings", false],
  ["trainers-schedules", "/api/v1/consultations/admin/cynologists", false],
  ["cache", "/api/v1/admin/cache", true],
  ["mail-alerts", "/api/v1/admin/mail/alerts", false],
  ["gafus-fraud", "/api/v1/admin/gafus-operations/fraud", false],
  ["gafus-preflight", "/api/v1/admin/gafus-operations/legacy/preflight", false],
  ["promo-archived", "/api/v1/admin/app-subscriptions?tab=promo-codes&includeArchived=1", true],
  ["npd-pending", "/api/v1/admin/app-subscriptions?tab=npd&npdStatus=PENDING", true],
  ["payment-page2", "/api/v1/admin/app-subscriptions?tab=payments&paymentPage=2&paymentPageSize=10", true],
  ["profit-period", "/api/v1/admin/profit?from=2026-10-01&to=2026-10-15&paymentPage=2&videoPage=1", false],
  ["questions-page2", "/api/v1/admin/moderation/questions/reports?page=2", false],
  ["rewarded-week", "/api/v1/admin/analytics/rewarded-ads?days=7", false],
];

const marker = `QAMOD${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;
const fixtures: { id: string; username: string }[] = [];
let ownUiQuestionId = "";
let ownUiReportId = "";
let ownUiQuestionTitle = "";
let ownFinancePartner: { id: string; userId: string } | null = null;
let ownFinanceRequestKey: string | null = null;
let ownFinanceActorId: string | null = null;
const ownPartnerPaymentIds: string[] = [];
let expectedPartnerPayouts = 0;
let failed = false;
const check = (condition: boolean, message: string) => {
  if (!condition) throw Error(message);
};
const http = async (jwt: string, route: string, method = "GET", body?: object) => {
  const response = await fetch(`http://127.0.0.1:${localApiPort}${route}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  const value: unknown = await response.json().catch(() => null);
  return { status: response.status, value };
};

try {
  const identity = await prisma.$queryRaw<[{ db: string; actor: string }]>`
    SELECT current_database() AS db, current_user AS actor`;
  check(identity[0]?.db === "gafus_refactor_real_work_20261024" &&
    identity[0].actor === "gafus_refactor_local_real", "WORK_DB_IDENTITY_DENIED");
  const adminPassword = randomBytes(28).toString("base64url");
  const password = randomBytes(48).toString("base64url"); // No usable login for other fixtures.
  const administrator = await prisma.user.create({
    data: { username: `${marker}ADMIN`.toLowerCase(), password: await bcrypt.hash(adminPassword, 10),
      passwordSetAt: new Date(), role: "ADMIN", registrationPending: false },
    select: { id: true, role: true, username: true },
  });
  fixtures.push({ id: administrator.id, username: administrator.username });
  // Chromium read-only navigation has a different WORK actor from the browser
  // login/mutations actor. Avoid artificially exhausting its 100/min budget.
  const browserReadAdmin = alt ? await prisma.user.create({
    data: { username: `${marker}READADMIN`, password, role: "ADMIN", registrationPending: false },
    select: { id: true, username: true, role: true },
  }) : administrator;
  if (alt) fixtures.push({ id: browserReadAdmin.id, username: browserReadAdmin.username });
  const moderator = await prisma.user.create({
    data: { username: `${marker}MOD`, password, role: "MODERATOR", registrationPending: false },
    select: { id: true, username: true, role: true },
  });
  fixtures.push({ id: moderator.id, username: moderator.username });
  const target = await prisma.user.create({
    data: { username: `${marker}USER`, password, role: "USER", registrationPending: false },
    select: { id: true, username: true, role: true },
  });
  fixtures.push({ id: target.id, username: target.username });
  let ownTrainer: { id: string; username: string } | null = null;
  if (alt) {
    const trainer = await prisma.user.create({
      data: { username: `${marker}TRAINER`, password, role: "TRAINER", registrationPending: false },
      select: { id: true, username: true, role: true },
    });
    ownTrainer = { id: trainer.id, username: trainer.username };
    fixtures.push(ownTrainer);
    await prisma.consultationCynologist.create({
      data: { userId: trainer.id, isListed: false, slotHorizonDays: 8, slotDurationMin: 30 },
    });
  }
  const modJwt = await generateAccessToken(moderator);
  const adminJwt = await generateAccessToken(administrator);
  const browserReadAdminJwt = await generateAccessToken(browserReadAdmin);

  let passed = 0;
  for (const [label, url, allowed] of scenarios) {
    const result = await http(modJwt, url);
    const want = allowed ? 200 : 403;
    if (result.status === want && (!allowed ||
      (result.value !== null && typeof result.value === "object" &&
        "success" in result.value && result.value.success === true &&
        "data" in result.value))) passed++;
    else out(`MODERATOR_GET ${label} expected_${want} got_${result.status}`);
  }
  out(`LIVE_WORK_MODERATOR_28_READONLY ${passed}/${scenarios.length}`);
  check(passed === scenarios.length, "MODERATOR_GET_MATRIX_MISMATCH");

  const updatedUsername = `${marker}EDIT`;
  const change = await http(modJwt, `/api/v1/admin/users/${target.id}`, "PATCH", { username: updatedUsername });
  check(change.status === 200, `MODERATOR_EDIT_OWN_FIXTURE_STATUS_${change.status}`);
  check((await prisma.user.findUnique({ where: { id: target.id } }))?.username === updatedUsername,
    "MODERATOR_EDIT_SQL_READBACK_MISMATCH");
  fixtures.find(fixture => fixture.id === target.id)!.username = updatedUsername;

  const escalation = await http(modJwt, `/api/v1/admin/users/${target.id}`, "PATCH", { role: "ADMIN" });
  check(escalation.status === 403, `MODERATOR_ESCALATION_NOT_DENIED_${escalation.status}`);
  check((await prisma.user.findUnique({ where: { id: target.id } }))?.role === "USER",
    "MODERATOR_ESCALATION_CHANGED_DB");
  const selfEdit = await http(modJwt, `/api/v1/admin/users/${moderator.id}`, "PATCH", { phone: "0" });
  check(selfEdit.status === 403, `MODERATOR_SELF_STAFF_EDIT_NOT_DENIED_${selfEdit.status}`);
  const questionPost = await http(modJwt, "/api/v1/admin/moderation/questions/reports", "POST", {
    reportId: "QA-NOT-REAL", action: "dismiss", reason: "synthetic only",
  });
  check(questionPost.status === 403, `MODERATOR_QUESTION_WRITE_NOT_DENIED_${questionPost.status}`);
  const unsafePromo = await http(modJwt, "/api/v1/admin/app-subscriptions/promo-codes", "POST", {
    code: `${marker}PROMO`, discountPercent: 1, isActive: false,
  });
  check(unsafePromo.status === 403, `MODERATOR_PROMO_WRITE_NOT_DENIED_${unsafePromo.status}`);
  check(!(await prisma.appSubscriptionPromoCode.findFirst({ where: { code: `${marker}PROMO` } })),
    "MODERATOR_DENIED_PROMO_WAS_CREATED");
  const feedValidation = await http(modJwt, "/api/v1/admin/moderation/feed/reports/QA-NOT-REAL", "POST", {
    action: "not-a-real-action", reason: "synthetic only",
  });
  check(feedValidation.status === 400, `MODERATOR_FEED_POST_NOT_REACHED_${feedValidation.status}`);
  out("LIVE_WORK_MODERATOR_SYNTHETIC_EDIT_AND_DENIAL 6/6 PASS");

  if (alt && ownTrainer) {
    const base = `/api/v1/admin/consultations/schedules/${ownTrainer.id}`;
    const fromUtc = new Date(Date.now() + 60_000).toISOString();
    const toUtc = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const range = `?${new URLSearchParams({ fromUtc, toUtc })}`;
    const first = await http(adminJwt, base + range);
    check(first.status === 200, `SCHEDULE_INITIAL_GET_${first.status}`);
    const forbidden = await http(modJwt, base + range);
    check(forbidden.status === 403, `SCHEDULE_MODERATOR_GET_${forbidden.status}`);
    const rules = Array.from({ length: 7 }, (_, weekday) => ({
      weekday, startTime: "10:00", endTime: "11:00", isWorkingDay: true,
    }));
    const updated = await http(adminJwt, base, "PUT", { rules });
    check(updated.status === 200, `SCHEDULE_PUT_${updated.status}`);
    const profile = await prisma.consultationCynologist.findUnique({
      where: { userId: ownTrainer.id },
      include: { availabilityRules: true, slots: true },
    });
    check(!!profile && profile.isListed === false &&
      profile.availabilityRules.length === 7 && profile.slots.length > 0,
    "SCHEDULE_SQL_RULES_SLOTS_MISMATCH");
    const read = await http(adminJwt, base + range);
    check(read.status === 200, `SCHEDULE_SECOND_GET_${read.status}`);
    const responseData = read.value && typeof read.value === "object" &&
      "data" in read.value ? read.value.data : null;
    check(!!responseData && typeof responseData === "object" &&
      "availability" in responseData && !!responseData.availability &&
      typeof responseData.availability === "object" &&
      "rules" in responseData.availability && Array.isArray(responseData.availability.rules) &&
      responseData.availability.rules.length === 7,
    "SCHEDULE_HTTP_READBACK_RULES_MISMATCH");
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(Date.now() + 3 * 86_400_000));
    const off = await http(adminJwt, `${base}/day-offs`, "POST", {
      date: day, reason: "Synthetic WORK-only test",
    });
    check(off.status === 200, `SCHEDULE_DAY_OFF_POST_${off.status}`);
    const persistedOff = await prisma.consultationDayOff.findFirst({
      where: { cynologistId: profile!.id },
    });
    check(!!persistedOff, "SCHEDULE_DAY_OFF_SQL_MISSING");
    const deleteOff = await http(adminJwt, `${base}/day-offs/${persistedOff!.id}`, "DELETE");
    check(deleteOff.status === 200 && !(await prisma.consultationDayOff.findUnique({
      where: { id: persistedOff!.id },
    })), `SCHEDULE_DAY_OFF_DELETE_${deleteOff.status}`);
    const slot = profile!.slots.find(row => row.startAt.getTime() > Date.now() + 86_400_000);
    check(!!slot, "SCHEDULE_SYNTHETIC_SLOT_NOT_MATERIALIZED");
    const ex = await http(adminJwt, `${base}/exceptions`, "POST", {
      startAt: slot!.startAt.toISOString(), endAt: slot!.endAt.toISOString(),
      reason: "Synthetic WORK-only test",
    });
    check(ex.status === 200, `SCHEDULE_EXCEPTION_POST_${ex.status}`);
    const persistedEx = await prisma.consultationSlotException.findFirst({
      where: { cynologistId: profile!.id },
    });
    check(!!persistedEx, "SCHEDULE_EXCEPTION_SQL_MISSING");
    const deleteEx = await http(adminJwt, `${base}/exceptions/${persistedEx!.id}`, "DELETE");
    check(deleteEx.status === 200 && !(await prisma.consultationSlotException.findUnique({
      where: { id: persistedEx!.id },
    })), `SCHEDULE_EXCEPTION_DELETE_${deleteEx.status}`);
    out("LIVE_WORK_SYNTHETIC_ADMIN_TRAINER_SCHEDULE_GET_PUT_DAYOFF_EXCEPTION_SQL 8/8 PASS");
  }

  if (alt) {
    const own = `/api/v1/admin/users/${target.id}/app-subscription`;
    const denied = await http(modJwt, own, "POST", { action: "lifetime", reason: "synthetic" });
    check(denied.status === 403, `MANUAL_GRANT_MODERATOR_DENIAL_${denied.status}`);
    const noRow = await prisma.appSubscription.count({
      where: { userId: target.id, provider: "MANUAL" },
    });
    check(noRow === 0, "MANUAL_GRANT_DENIED_LEFT_SQL_RECORD");
    const paidUntil = new Date(Date.now() + 31 * 86_400_000).toISOString();
    const paid = await http(adminJwt, own, "POST", {
      action: "paid_until", paidUntil, reason: "Synthetic WORK-only test",
    });
    check(paid.status === 200, `MANUAL_GRANT_PAID_${paid.status}`);
    const current = await prisma.appSubscription.findFirst({
      where: { userId: target.id, provider: "MANUAL", status: "ACTIVE" },
    });
    check(!!current && current.manualGrantedById === administrator.id &&
      current.isLifetime === false &&
      current.currentPeriodEnd?.getTime() === new Date(paidUntil).getTime(),
    "MANUAL_GRANT_PAID_SQL_MISMATCH");
    const lifetime = await http(adminJwt, own, "POST", {
      action: "lifetime", reason: "Synthetic WORK-only test",
    });
    check(lifetime.status === 200, `MANUAL_GRANT_LIFETIME_${lifetime.status}`);
    const upgraded = await prisma.appSubscription.findUnique({ where: { id: current!.id } });
    check(!!upgraded && upgraded.isLifetime && upgraded.status === "ACTIVE" &&
      upgraded.currentPeriodEnd === null && upgraded.manualGrantedById === administrator.id,
    "MANUAL_GRANT_LIFETIME_SQL_MISMATCH");
    const snapshot = await http(modJwt, own);
    check(snapshot.status === 200 && !!snapshot.value && typeof snapshot.value === "object" &&
      "success" in snapshot.value && snapshot.value.success === true,
    `MANUAL_GRANT_DETAIL_READ_${snapshot.status}`);
    const cleared = await http(adminJwt, own, "POST", { action: "clear" });
    check(cleared.status === 200, `MANUAL_GRANT_CLEAR_${cleared.status}`);
    const canceled = await prisma.appSubscription.findUnique({ where: { id: current!.id } });
    check(!!canceled && canceled.status === "CANCELED" && !!canceled.canceledAt,
    "MANUAL_GRANT_CLEAR_SQL_MISMATCH");
    out("LIVE_WORK_SYNTHETIC_MANUAL_SUBSCRIPTION_PAID_LIFETIME_CLEAR_AND_ROLES 5/5 PASS");
  }

  if (alt) {
    // Isolated inactive synthetic partner and *only* its synthetic ledger rows.
    // No actual partner payout, provider call or renewal can be triggered.
    const partnerUser = await prisma.user.create({
      data: { username: `${marker}FINANCEUSER`, password, role: "USER",
        registrationPending: false },
      select: { id: true, username: true },
    });
    fixtures.push(partnerUser);
    const partner = await prisma.partnerProfile.create({
      data: { userId: partnerUser.id, isActive: false },
      select: { id: true, userId: true },
    });
    ownFinancePartner = partner;
    ownFinanceActorId = administrator.id;
    const path = "/api/v1/admin/profit/video-expenses";
    const payload = { partnerId: partner.id, paidDay: "2026-10-15", quantity: 1,
      comment: "Temporary WORK-only QA expense" };
    const beforeProfit = await prisma.profitVideoExpense.count({
      where: { partnerId: partner.id },
    });
    check(beforeProfit === 0, "FINANCE_SYNTHETIC_PARTNER_ALREADY_HAS_EXPENSE");
    ownFinanceRequestKey = randomUUID();
    const requestKey = ownFinanceRequestKey;
    const modDenied = await http(modJwt, path, "POST", {
      requestKey, input: payload,
    });
    check(modDenied.status === 403 && (await prisma.profitVideoExpense.count({
      where: { requestKey },
    })) === 0, `FINANCE_MODERATOR_DENIAL_${modDenied.status}`);
    const created = await http(adminJwt, path, "POST", { requestKey, input: payload });
    check(created.status === 200, `FINANCE_CREATE_STATUS_${created.status}`);
    const row = await prisma.profitVideoExpense.findUnique({ where: { requestKey } });
    check(!!row && row.actorId === administrator.id && row.partnerId === partner.id &&
      row.quantity === 1 && row.amountKopecks === 50000 && row.version === 1 &&
      row.canceledAt === null, "FINANCE_CREATE_SQL_MISMATCH");
    const replay = await http(adminJwt, path, "POST", { requestKey, input: payload });
    check(replay.status === 200 && (await prisma.profitVideoExpenseRevision.count({
      where: { expenseId: row!.id },
    })) === 1, `FINANCE_IDEMPOTENT_REPLAY_${replay.status}`);
    const conflicting = await http(adminJwt, path, "POST", { requestKey,
      input: { ...payload, quantity: 2 },
    });
    check(conflicting.status === 400, `FINANCE_DUPLICATE_REQUEST_CONFLICT_${conflicting.status}`);
    const patchKey = randomUUID();
    const changed = await http(adminJwt, path, "POST", {
      id: row!.id, version: 1, requestKey: patchKey,
      input: { ...payload, quantity: 2 },
    });
    check(changed.status === 200, `FINANCE_UPDATE_STATUS_${changed.status}`);
    const updated = await prisma.profitVideoExpense.findUnique({ where: { id: row!.id } });
    check(updated?.version === 2 && updated.quantity === 2 &&
      updated.amountKopecks === 100000,
    "FINANCE_UPDATE_SQL_MISMATCH");
    const stale = await http(adminJwt, path, "POST", {
      id: row!.id, version: 1, requestKey: randomUUID(), input: payload,
    });
    check(stale.status === 409 &&
      (await prisma.profitVideoExpense.findUnique({ where: { id: row!.id } }))?.version === 2,
    `FINANCE_STALE_VERSION_NOT_REJECTED_${stale.status}`);
    const cancel = await http(adminJwt, `${path}/cancel`, "POST", {
      id: row!.id, version: 2,
    });
    const finalExpense = await prisma.profitVideoExpense.findUnique({
      where: { id: row!.id }, include: { revisions: true },
    });
    check(cancel.status === 200 && finalExpense?.version === 3 &&
      !!finalExpense.canceledAt && finalExpense.revisions.length === 3 &&
      finalExpense.revisions.some(r => r.action === "CREATE") &&
      finalExpense.revisions.some(r => r.action === "UPDATE") &&
      finalExpense.revisions.some(r => r.action === "CANCEL"),
    `FINANCE_CANCEL_REVISIONS_MISMATCH_${cancel.status}`);
    out("LIVE_WORK_SYNTHETIC_PROFIT_EXPENSE_CREATE_REPLAY_UPDATE_STALE_CANCEL_PASS");
    // No provider call: PENDING synthetic payment is only a foreign-key anchor
    // for a manually seeded synthetic commission on our own inactive partner.
    // This exercises *administrative ledger accounting*, not real transfers.
    const seedCommission = async (amountKopecks: number) => {
      const payment = await prisma.appSubscriptionPayment.create({
        data: { userId: target.id, provider: "MANUAL", kind: "INITIAL",
          status: "PENDING", idempotenceKey: `${marker}_PAYOUT_${ownPartnerPaymentIds.length}` },
        select: { id: true },
      });
      ownPartnerPaymentIds.push(payment.id);
      await prisma.partnerCommission.create({
        data: { paymentId: payment.id, partnerId: partner.id,
          amountKopecks, kind: "EARNED" },
      });
    };
    await seedCommission(25000);
    const partnerPath = `/api/v1/admin/partners/${partner.id}`;
    const getPartner = await http(adminJwt, partnerPath);
    check(getPartner.status === 200 && !!getPartner.value &&
      typeof getPartner.value === "object" && "data" in getPartner.value &&
      !!getPartner.value.data && typeof getPartner.value.data === "object" &&
      "availableKopecks" in getPartner.value.data &&
      getPartner.value.data.availableKopecks === 25000,
    `PARTNER_SYNTHETIC_DETAIL_${getPartner.status}`);
    const forbiddenPartner = await http(modJwt, partnerPath);
    check(forbiddenPartner.status === 403, `PARTNER_MODERATOR_READ_NOT_DENIED_${forbiddenPartner.status}`);
    const payouts = await Promise.all([
      http(adminJwt, `${partnerPath}/mark-paid`, "POST"),
      http(adminJwt, `${partnerPath}/mark-paid`, "POST"),
    ]);
    check(payouts.map(p => p.status).sort().join(",") === "200,409",
      `PARTNER_CONCURRENT_MARK_PAID_${payouts.map(p => p.status).join("_")}`);
    const firstPaid = await prisma.partnerPayout.findMany({ where: { partnerId: partner.id } });
    check(firstPaid.length === 1 && firstPaid[0]?.amountKopecks === 25000 &&
      firstPaid[0].status === "PAID" && !!firstPaid[0].processedAt,
    "PARTNER_CONCURRENT_SINGLE_LEDGER_PAYOUT_SQL");
    expectedPartnerPayouts = 1;
    // Second commission makes one new payout genuinely available to the UI
    // while preserving the first already-paid ledger entry.
    await seedCommission(30000);
    const secondDetail = await http(adminJwt, partnerPath);
    check(secondDetail.status === 200 && !!secondDetail.value &&
      typeof secondDetail.value === "object" && "data" in secondDetail.value &&
      !!secondDetail.value.data && typeof secondDetail.value.data === "object" &&
      "availableKopecks" in secondDetail.value.data &&
      secondDetail.value.data.availableKopecks === 30000,
    "PARTNER_SECOND_COMMISSION_AVAILABLE_SQL_HTTP");
    out("LIVE_WORK_SYNTHETIC_PARTNER_PAYOUT_CONCURRENT_200_409_SINGLE_SQL_PASS");
  }

  if (alt) {
    // Only synthetic QA users/questions/reports in the verified WORK database.
    // Direct Prisma inserts deliberately bypass publication rewards and mail/S3.
    const reporter = await prisma.user.create({
      data: { username: `${marker}REPORTER`, password, role: "USER", registrationPending: false },
      select: { id: true, username: true },
    });
    fixtures.push(reporter);
    const secondReporter = await prisma.user.create({
      data: { username: `${marker}REPORTER2`, password, role: "USER", registrationPending: false },
      select: { id: true, username: true },
    });
    fixtures.push(secondReporter);
    const questionAdmin = await prisma.user.create({
      data: { username: `${marker}QUESTIONADMIN`, password, role: "ADMIN", registrationPending: false },
      select: { id: true, username: true, role: true },
    });
    fixtures.push(questionAdmin);
    const questionJwt = await generateAccessToken(questionAdmin);
    const unreviewed = await prisma.questionReport.count({ where: { resolvedAt: null } });
    const reportListPage = Math.floor(unreviewed / 30) + 1;
    const reportIds: string[] = [];
    const questionIds: string[] = [];
    for (const action of ["dismiss", "hide", "close", "delete", "block"] as const) {
      const question = await prisma.question.create({
        data: { authorId: target.id, clientRequestId: `${marker}_${action}`,
          title: `Synthetic WORK QA ${action}`, body: "QA only, not published through API",
          category: "training", tags: [] },
        select: { id: true },
      });
      questionIds.push(question.id);
      const report = await prisma.questionReport.create({
        data: { questionId: question.id, reporterId: reporter.id,
          targetKey: `question:${question.id}`, reason: "synthetic-qa", details: "WORK only" },
        select: { id: true },
      });
      reportIds.push(report.id);
      if (action === "hide") {
        // Second pending report on same target must be atomically resolved.
        const second = await prisma.questionReport.create({
          data: { questionId: question.id, reporterId: secondReporter.id,
            targetKey: `question:${question.id}`, reason: "synthetic-qa-duplicate" },
          select: { id: true },
        });
        reportIds.push(second.id);
      }
    }
    const page = await http(questionJwt,
      `/api/v1/admin/moderation/questions/reports?page=${reportListPage}`);
    check(page.status === 200 && !!page.value && typeof page.value === "object" &&
      "data" in page.value && !!page.value.data && typeof page.value.data === "object" &&
      "reports" in page.value.data && Array.isArray(page.value.data.reports) &&
      page.value.data.reports.some((r: { id: string }) => reportIds.includes(r.id)),
    `QUESTIONS_MODERATION_HTTP_LIST_${page.status}`);
    const modDenied = await http(modJwt, "/api/v1/admin/moderation/questions/reports", "POST", {
      reportId: reportIds[0], action: "dismiss", reason: "WORK synthetic",
    });
    check(modDenied.status === 403, `QUESTIONS_MODERATION_ROLE_DENIED_${modDenied.status}`);
    const before = await prisma.questionReport.count({
      where: { id: { in: reportIds }, resolvedAt: { not: null } },
    });
    check(before === 0, "QUESTIONS_MODERATION_DENIAL_CHANGED_SQL");
    let applied = 0;
    for (const [index, action] of ["dismiss", "hide", "close", "delete", "block"].entries()) {
      const response = await http(questionJwt, "/api/v1/admin/moderation/questions/reports", "POST", {
        reportId: reportIds[index === 0 ? 0 : index === 1 ? 1 : index + 1],
        action, reason: "WORK synthetic test",
      });
      check(response.status === 200, `QUESTIONS_MODERATION_${action}_STATUS_${response.status}`);
      const record = await prisma.question.findUnique({ where: { id: questionIds[index] } });
      check(!!record &&
        (action !== "hide" || !!record.hiddenAt) &&
        (action !== "delete" || !!record.deletedAt) &&
        (action !== "close" || !!record.closedAt),
      `QUESTIONS_MODERATION_${action}_SQL_STATE`);
      const matched = await prisma.questionReport.findMany({
        where: { questionId: questionIds[index] },
      });
      check(matched.length === (action === "hide" ? 2 : 1) &&
        matched.every(r => !!r.resolvedAt && r.resolution?.startsWith(`${action}:`)),
      `QUESTIONS_MODERATION_${action}_SQL_RESOLUTION`);
      if (action === "block") {
        check(!!(await prisma.questionBlock.findUnique({ where: { userId: target.id } })),
          "QUESTIONS_MODERATION_BLOCK_SQL_MISSING");
      }
      applied++;
    }
    check(applied === 5, "QUESTIONS_MODERATION_APPLIED_COUNT");
    const blockRemoval = await http(questionJwt,
      `/api/v1/admin/moderation/questions/blocks/${target.id}`, "DELETE");
    check(blockRemoval.status === 200 &&
      !(await prisma.questionBlock.findUnique({ where: { userId: target.id } })),
    `QUESTIONS_MODERATION_UNBLOCK_${blockRemoval.status}`);
    const resolved = await prisma.questionReport.count({
      where: { id: { in: reportIds }, resolvedAt: { not: null } },
    });
    check(resolved === reportIds.length, "QUESTIONS_MODERATION_INCOMPLETE_RESOLUTION");
    // Only delete known question IDs owned by our own synthetic USER.
    const removedQuestions = await prisma.question.deleteMany({
      where: { id: { in: questionIds }, authorId: target.id },
    });
    check(removedQuestions.count === questionIds.length &&
      (await prisma.questionReport.count({ where: { id: { in: reportIds } } })) === 0,
    "QUESTIONS_MODERATION_FIXTURE_CLEANUP_FAILED");
    out("LIVE_WORK_SYNTHETIC_QUESTION_MODERATION_5_ACTIONS_DUPLICATE_BLOCK_UNBLOCK_PASS");
    // Deliberately oldest synthetic report so the actual Admin UI can find it
    // on page one, then immediately resolve it via a strictly scoped POST.
    ownUiQuestionTitle = `${marker}_UI_MODERATION`;
    const uiQuestion = await prisma.question.create({
      data: { authorId: target.id, clientRequestId: `${marker}_ui_report`,
        title: ownUiQuestionTitle, body: "Temporary WORK-only moderation UI acceptance",
        category: "training", tags: [] },
      select: { id: true },
    });
    ownUiQuestionId = uiQuestion.id;
    const uiReport = await prisma.questionReport.create({
      data: { questionId: uiQuestion.id, reporterId: reporter.id,
        targetKey: `question:${uiQuestion.id}`, reason: "synthetic-ui-qa",
        createdAt: new Date("2000-01-01T00:00:00.000Z") },
      select: { id: true },
    });
    ownUiReportId = uiReport.id;
  }

  if (alt) {
    // Explicitly reject dangerous global operations BEFORE any provider call.
    const forbiddenBroadcast = await http(modJwt, "/api/v1/admin/broadcasts", "POST", {
      title: "Never send", body: "synthetic", confirmation: "SEND_TO_ALL_SUBSCRIBERS",
      idempotencyKey: randomUUID(),
    });
    check(forbiddenBroadcast.status === 403, "BROADCAST_MODERATOR_ROLE_NOT_DENIED");
    const noConfirmBroadcast = await http(adminJwt, "/api/v1/admin/broadcasts", "POST", {
      title: "Never send", body: "synthetic", idempotencyKey: randomUUID(),
    });
    check(noConfirmBroadcast.status === 400, "BROADCAST_MISSING_CONFIRM_NOT_DENIED");
    const forbiddenReengagement = await http(modJwt,
      "/api/v1/admin/reengagement/run", "POST", { confirmation: "RUN_REENGAGEMENT" });
    check(forbiddenReengagement.status === 403, "REENGAGEMENT_MODERATOR_NOT_DENIED");
    const noConfirmReengagement = await http(adminJwt,
      "/api/v1/admin/reengagement/run", "POST", { confirmation: "not_confirmed" });
    check(noConfirmReengagement.status === 400, "REENGAGEMENT_MISSING_CONFIRM_NOT_DENIED");
    const forbiddenFlags = await http(modJwt,
      "/api/v1/admin/feature-flags", "PUT", {});
    check(forbiddenFlags.status === 403, "FEATURE_MODERATOR_WRITE_NOT_DENIED");
    const invalidFlags = await http(adminJwt,
      "/api/v1/admin/feature-flags", "PUT", {});
    check(invalidFlags.status === 400, "FEATURE_INVALID_WRITE_NOT_DENIED");
    const cacheInvalid = await http(adminJwt,
      "/api/v1/admin/cache/courses/refresh", "POST", { confirmation: "no" });
    check(cacheInvalid.status === 400, "CACHE_INVALID_REFRESH_NOT_DENIED");
    out("LIVE_WORK_DANGEROUS_BROADCAST_REENGAGEMENT_FLAGS_CACHE_FAIL_CLOSED_7_PASS");
  }

  const subscriptionCountBeforeUi = alt ? await prisma.appSubscription.count({
    where: { userId: target.id, provider: "MANUAL" },
  }) : 0;
  const browser = spawnSync("/opt/homebrew/bin/node", ["scripts/refactor/admin-live-cookie-browser.mjs"], {
    cwd: root, input: JSON.stringify({ adminJwt: browserReadAdminJwt, modJwt,
      adminLogin: { username: administrator.username, password: adminPassword },
      syntheticTargetId: alt ? target.id : undefined,
      uiModeration: alt ? { reportId: ownUiReportId, title: ownUiQuestionTitle } : undefined,
      uiPartnerId: alt ? ownFinancePartner?.id : undefined,
      uiTrainerId: alt ? ownTrainer?.id : undefined,
    }), encoding: "utf8",
    // Real trainer slot rebuild + all 18 Chromium pages exceed the former
    // 75-second child budget on a cold build; retain a bounded deadline.
    timeout: 145_000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test",
      GAFUS_TEST_BROWSER_WORK: "1",
      GAFUS_CHECK_LIVE_BROWSER_LOGIN: process.env.GAFUS_CHECK_LIVE_BROWSER_LOGIN === "1" ? "1" : "0",
      GAFUS_ADMIN_ISOLATED_ALTERNATE: alt ? "1" : "0",
      GAFUS_ADMIN_WRITES_ONLY: alt && process.env.GAFUS_ADMIN_WRITES_ONLY === "1" ? "1" : "0" },
  });
  if (browser.stdout) out(browser.stdout.trim());
  if (browser.stderr) out(browser.stderr.split("\n").slice(-9).join("\n").slice(0, 1300));
  if (browser.status !== 0) {
    const code = browser.stderr?.match(
      /Error: ((?:ADMIN|MODERATOR|WORK|QUERY|CHROMIUM|REAL)_[A-Za-z0-9_./?=&%-]{1,170})/,
    )?.[1];
    out(`LIVE_WORK_BROWSER_DIAGNOSTIC ${code ?? browser.error?.name ?? "CHROMIUM_CHILD_FAILED"}`);
  }
  check(browser.status === 0 && !browser.error, "REAL_COOKIE_BROWSER_ACCEPTANCE_FAILED");
  if (alt) {
    const afterUi = await prisma.appSubscription.findMany({
      where: { userId: target.id, provider: "MANUAL" },
      select: { status: true, isLifetime: true },
    });
    check(afterUi.length === subscriptionCountBeforeUi + 1 &&
      afterUi.every(row => row.status === "CANCELED"),
    "BROWSER_SYNTHETIC_MANUAL_SUBSCRIPTION_SQL_RECONCILIATION_FAILED");
    out("LIVE_WORK_SYNTHETIC_ADMIN_SUBSCRIPTION_BROWSER_SQL_RECONCILIATION PASS");
    const uiResolved = await prisma.questionReport.findUnique({
      where: { id: ownUiReportId },
    });
    check(!!uiResolved?.resolvedAt && uiResolved.resolution?.startsWith("dismiss:") === true,
      "BROWSER_SYNTHETIC_QUESTION_MODERATION_SQL_RESOLUTION_FAILED");
    const removed = await prisma.question.deleteMany({
      where: { id: ownUiQuestionId, authorId: target.id },
    });
    check(removed.count === 1 &&
      !(await prisma.questionReport.findUnique({ where: { id: ownUiReportId } })),
    "BROWSER_SYNTHETIC_QUESTION_MODERATION_DELETE_FAILED");
    out("LIVE_WORK_SYNTHETIC_ADMIN_QUESTION_MODERATION_BROWSER_SQL_RECONCILIATION PASS");
    const finalPayouts = await prisma.partnerPayout.findMany({
      where: { partnerId: ownFinancePartner!.id },
      orderBy: { amountKopecks: "asc" },
    });
    check(finalPayouts.length === expectedPartnerPayouts + 1 &&
      finalPayouts[0]?.amountKopecks === 25000 &&
      finalPayouts[1]?.amountKopecks === 30000 &&
      finalPayouts.every(r => r.status === "PAID" && !!r.processedAt),
    "BROWSER_SYNTHETIC_PARTNER_PAYOUT_SQL_RECONCILIATION_FAILED");
    const settled = await http(adminJwt,
      `/api/v1/admin/partners/${ownFinancePartner!.id}`);
    check(settled.status === 200 && !!settled.value && typeof settled.value === "object" &&
      "data" in settled.value && !!settled.value.data &&
      typeof settled.value.data === "object" &&
      "availableKopecks" in settled.value.data &&
      settled.value.data.availableKopecks === 0,
    "BROWSER_SYNTHETIC_PARTNER_AVAILABLE_BALANCE_NOT_ZERO");
    out("LIVE_WORK_SYNTHETIC_ADMIN_PARTNER_BROWSER_MARK_PAID_SQL_RECONCILIATION_PASS");
    const uiTrainer = await prisma.consultationCynologist.findUnique({
      where: { userId: ownTrainer!.id }, include: { availabilityRules: true },
    });
    check(!!uiTrainer && uiTrainer.isListed === false &&
      uiTrainer.availabilityRules.length === 7 &&
      uiTrainer.availabilityRules.some(rule => rule.weekday === 0 &&
        rule.startTime === "12:00" && rule.endTime === "13:00"),
    "BROWSER_SYNTHETIC_TRAINER_WEEKLY_RULE_SQL_RECONCILIATION_FAILED");
    out("LIVE_WORK_SYNTHETIC_TRAINER_SCHEDULE_BROWSER_PUT_SQL_RECONCILIATION_PASS");
  }
  // spawnSync blocked this Node event loop while Chromium was navigating. Hono
  // may have closed the pooled idle TCP socket. Re-establish it with GET ONLY,
  // never retry an ambiguous PATCH after a transport failure.
  let ready = false;
  await new Promise(resolve => setTimeout(resolve, 150));
  for (let attempt = 0; attempt < 3 && !ready; attempt++) {
    try {
      const probe = await fetch(`http://127.0.0.1:${localApiPort}/ready`, { signal: AbortSignal.timeout(3000) });
      ready = probe.status === 200;
    } catch { /* An idempotent readiness GET may safely retry. */ }
  }
  check(ready, "HONO_NOT_READY_AFTER_BROWSER");

  const demote = await http(adminJwt, `/api/v1/admin/users/${moderator.id}`, "PATCH", { role: "USER" });
  check(demote.status === 200, `ADMIN_DEMOTE_SYNTHETIC_MOD_STATUS_${demote.status}`);
  const after = await prisma.user.findUnique({ where: { id: moderator.id } });
  check(after?.role === "USER" && !!after.sessionsRevokedAt, "ADMIN_DEMOTION_SQL_MISMATCH");
  const stale = await http(modJwt, "/api/v1/admin/users");
  check(stale.status === 401, `DEMOTED_JWT_NOT_REVOKED_${stale.status}`);
  out("LIVE_WORK_MODERATOR_SYNTHETIC_DEMOTION_JWT_REVOCATION 2/2 PASS");
} catch (error) {
  failed = true;
  out(`LIVE_WORK_MODERATOR_ACCEPTANCE_FAILED ${error instanceof Error ? error.message : "UNKNOWN"}`);
} finally {
  // Profit ledger FKs are RESTRICT, not cascade. Delete exact synthetic
  // revisions/expense/partner before removing our QA accounts in reverse order.
  if (ownFinancePartner && ownFinanceRequestKey && ownFinanceActorId) {
    try {
      const row = await prisma.profitVideoExpense.findUnique({
        where: { requestKey: ownFinanceRequestKey },
        select: { id: true, actorId: true, partnerId: true },
      });
      if (row) {
        check(row.actorId === ownFinanceActorId &&
          row.partnerId === ownFinancePartner.id, "FINANCE_CLEANUP_OWNERSHIP_DENIED");
        await prisma.profitVideoExpenseRevision.deleteMany({ where: { expenseId: row.id } });
        const removed = await prisma.profitVideoExpense.deleteMany({
          where: { id: row.id, requestKey: ownFinanceRequestKey,
            actorId: ownFinanceActorId, partnerId: ownFinancePartner.id },
        });
        check(removed.count === 1, "FINANCE_CLEANUP_DELETE_FAILED");
      }
      // The payout ledger has FK RESTRICT. Cleanup only this *newly created*
      // inactive partner; first remove its synthetic commissions and payouts.
      await prisma.partnerPayout.deleteMany({ where: { partnerId: ownFinancePartner.id } });
      await prisma.partnerCommission.deleteMany({
        where: { partnerId: ownFinancePartner.id,
          paymentId: { in: ownPartnerPaymentIds } },
      });
      await prisma.appSubscriptionPayment.deleteMany({
        where: { id: { in: ownPartnerPaymentIds },
          idempotenceKey: { startsWith: `${marker}_PAYOUT_` } },
      });
      const removedPartner = await prisma.partnerProfile.deleteMany({
        where: { id: ownFinancePartner.id, userId: ownFinancePartner.userId,
          isActive: false },
      });
      check(removedPartner.count === 1, "FINANCE_CLEANUP_PARTNER_FAILED");
      out("LIVE_WORK_SYNTHETIC_PROFIT_FINANCE_LEDGER_CLEANUP_PASS");
    } catch {
      failed = true;
      out("LIVE_WORK_SYNTHETIC_PROFIT_FINANCE_CLEANUP_FAILED_REVIEW_REQUIRED");
    }
  }
  const fixtureCount = fixtures.length;
  let removed = 0;
  for (const fixture of fixtures.reverse()) {
    try {
      // Positively identify exact rows created here. Never remove someone else's rows.
      const deleted = await prisma.user.deleteMany({
        where: { id: fixture.id, username: fixture.username },
      });
      if (deleted.count === 1) removed++;
      else {
        failed = true;
        out("MODERATOR_SYNTHETIC_CLEANUP_INCOMPLETE");
      }
    } catch {
      failed = true;
      out("MODERATOR_SYNTHETIC_CLEANUP_FAILED_MANUAL_RECONCILIATION_NEEDED");
    }
  }
  await prisma.$disconnect();
  if (removed === fixtureCount) out("LIVE_WORK_MODERATOR_SYNTHETIC_FIXTURES_REMOVED PASS");
}

if (failed) process.exitCode = 1;
