/** AG1 consultation positive signed Hono/WORK SQL, synthetic no-recipient accounts. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";
import { validateCredentials } from "@gafus/core/services/auth";

const prefix = "ag1_cons_race_20261025_" + randomBytes(5).toString("hex");
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
  console.warn("AG1_CONS_TRUE_RACE_HTTP " + name + "=PASS");
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
      // Normal original credentials lookup lowercases usernames before SQL;
      // fixtures must use the same canonical persisted username.
      username: prefix + "_" + suffix.toLowerCase(),
      role,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
      // No email, no PushSubscription: real external messages cannot have recipients.
    },
  });
  const v: Actor = { id: user.id, username: user.username, password };
  actors.push(v);
  const inDb = await prisma.user.findUnique({where:{username:v.username.toLowerCase()},select:{id:true,password:true,registrationPending:true}});
  const selfCompare = inDb ? await bcrypt.compare(password,inDb.password) : false;
  const coreValidation = await validateCredentials(v.username,password);
  console.warn("AG1_CONS_SYNTH_AUTH_LOCAL_SQL_FOUND="+Boolean(inDb)+";BCRYPT="+selfCompare+";CORE_VALID="+coreValidation.success+";PENDING="+String(inDb?.registrationPending));
  ensure(inDb?.id===v.id&&selfCompare&&coreValidation.success,"LOCAL_SQL_CREDENTIALS_INVARIANT");
  const res = await http("/auth/login", "POST", undefined, { username: v.username, password });
  if (res.status !== 200 || res.data.success !== true)
    console.warn("AG1_CONS_LOGIN_FAILURE_HTTP_STATUS=" + res.status + ";CODE=" + String(res.data.code ?? "NO_CODE"));
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
  // The winner is resolved from SQL after each potentially unknown ACK.
  // Only exact synthetic bookings owned by our trainer are eligible for cleanup.
  if (cynId) {
    const active = await prisma.consultationBooking.findMany({
      where: { cynologistId: cynId, status: { in: ["PENDING_TRAINER_CONFIRMATION", "CONFIRMED"] } },
      select: { id: true, clientId: true },
    });
    for (const b of active) {
      const actual = actors.find((a) => a.id === b.clientId && a.username.startsWith(prefix));
      if (actual) await http("/consultations/bookings/" + b.id + "/cancel", "POST", actual, {}).catch(() => undefined);
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
  ensure(process.env.AG1_CONS_TRUE_RACE_HTTP === "1" &&
    process.env.NODE_ENV === "development" &&
    process.env.GAFUS_LOCAL_ISOLATED_API === "1", "STRICT_LOCAL_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(u.hostname === "127.0.0.1" && u.port === "55921" &&
    u.username === "gafus_refactor_local_real" &&
    u.pathname === "/gafus_refactor_real_work_20261024", "RESTRICTED_WORK_ONLY");
  const meta = await prisma.$queryRaw<{db:string,version:string}[]>`
    SELECT current_database() AS db,current_setting('server_version_num') AS version`;
  ensure(meta[0]?.db === "gafus_refactor_real_work_20261024" && meta[0].version === "180004", "WORK_PG18");
  const ready = await fetch("http://127.0.0.1:3001/ready", {signal:AbortSignal.timeout(4000)});
  ensure(ready.status === 200, "ORIGINAL_HONO_READY");
  const before = {users:await prisma.user.count(), bookings:await prisma.consultationBooking.count(), slots:await prisma.consultationSlot.count(), cynologists:await prisma.consultationCynologist.count()};
  const trainer = await actor("trainer", "TRAINER");
  trainerId = trainer.id;
  const clientA = await actor("clientA", "USER"), clientB = await actor("clientB", "USER");
  await grantSyntheticEntitlement(clientA.id);
  await grantSyntheticEntitlement(clientB.id);
  cynId = (await prisma.consultationCynologist.create({data:{
    userId:trainerId,isListed:true,slotHorizonDays:12,bookingLeadTimeMin:5,slotDurationMin:30,
  }})).id;
  for(let day=0;day<7;day++)await prisma.consultationAvailabilityRule.create({data:{
    cynologistId:cynId,weekday:day,startTime:"12:00",endTime:"14:00",isWorkingDay:true,
  }});
  const from=new Date(Date.now()+6*86400000),to=new Date(Date.now()+9*86400000);
  const path="/consultations/cynologists/"+trainerId+"/slots?from="+encodeURIComponent(from.toISOString())+"&to="+encodeURIComponent(to.toISOString());
  const aSlots=await http(path,"GET",clientA);
  const bSlots=await http(path,"GET",clientB);
  ensure(aSlots.status===200&&bSlots.status===200&&Array.isArray(aSlots.data.data)&&Array.isArray(bSlots.data.data),"BOTH_ENTITLED_REAL_SLOT_GET");
  const choices=aSlots.data.data as unknown[];
  ensure(choices.length>0,"OWN_SYNTHETIC_SLOTS");
  slotId=obj(choices[0]).id as string;
  ensure(typeof slotId==="string"&&slotId.length>8 &&
    (bSlots.data.data as unknown[]).some(s=>obj(s).id===slotId),"SAME_REAL_AVAILABLE_SLOT_ID");
  const initialSlot=await prisma.consultationSlot.findUnique({where:{id:slotId},select:{cynologistId:true,status:true}});
  ensure(initialSlot?.cynologistId===cynId&&initialSlot.status==="FREE","OWN_SLOT_SQL_FREE_BEFORE_RACE");
  pass("THREE_OWN_STOCK_JWT_ACTORS_TWO_SYNTHETIC_ENTITLED_USERS_ONE_PHYSICAL_SLOT_FREE");

  const payload=(name:string,key:string)=>({
    slotId,idempotencyKey:key,clientOwnerName:"AG1 "+name,clientPhone:"+79990000000",
    petName:"AG1 Dog",petGender:"MALE",petAge:"3",petBreed:"mixed",
    clientProblem:"only owned synthetic race",clientSelfHelpAttempt:"no real consultation",
  });
  const keyA=randomUUID(),keyB=randomUUID();
  const bodyA=payload("A",keyA),bodyB=payload("B",keyB);
  const [rA,rB]=await Promise.all([
    http("/consultations/book","POST",clientA,bodyA),
    http("/consultations/book","POST",clientB,bodyB),
  ]);
  console.warn("AG1_CONS_TRUE_RACE_HTTP_CONCURRENT_BOOK_STATUSES="+[rA.status,rB.status].sort().join(","));
  const rows=await prisma.consultationBooking.findMany({where:{slotId},select:{id:true,slotId:true,clientId:true,status:true}});
  const physicalSlot=await prisma.consultationSlot.findUnique({where:{id:slotId},select:{status:true,cynologistId:true}});
  ensure(rows.length===1&&physicalSlot?.status==="BOOKED"&&physicalSlot.cynologistId===cynId,
    "ONE_BOOKING_ONE_SLOT_BOOKED_AFTER_SIMULTANEOUS_HTTP");
  const receipts=await prisma.consultationBookingIdempotency.findMany({
    where:{clientId:{in:[clientA.id,clientB.id]}},select:{clientId:true,key:true,bookingId:true},
  });
  ensure(receipts.length===1&&receipts[0].bookingId===rows[0].id,
    "ONE_ATOMIC_SQL_IDEMPOTENCY_RECEIPT");
  // Reconcile all observed SQL effects BEFORE any HTTP retry; never blindly
  // resend a request after a failed or unknown ACK.
  const winner=rows[0].clientId===clientA.id?clientA:clientB;
  const loser=rows[0].clientId===clientA.id?clientB:clientA;
  const winningBody=winner.id===clientA.id?bodyA:bodyB;
  const losingBody=loser.id===clientA.id?bodyA:bodyB;
  const wr=winner.id===clientA.id?rA:rB, lr=loser.id===clientA.id?rA:rB;
  bookId=rows[0].id;
  ensure(wr.status===201&&obj(wr.data.data).kind==="created"&&
    obj(obj(wr.data.data).booking).id===bookId&&
    lr.status===409&&lr.data.code==="CONSULTATION_SLOT_TAKEN",
    "TWO_SIGNED_CONCURRENT_POST_201_409_NO_500");
  ensure(receipts[0].clientId===winner.id&&receipts[0].key===winningBody.idempotencyKey,
    "LOSER_DID_NOT_LEAVE_IDEMPOTENCY_OR_BOOKING");
  pass("REAL_PARALLEL_TWO_ENTITLED_OWNERS_ONE_201_OTHER_409_ONE_BOOKING_AND_RECEIPT");

  const observed=await http("/consultations/book/lookup","POST",winner,{idempotencyKey:winningBody.idempotencyKey});
  ensure(observed.status===200&&obj(observed.data.data).state==="FOUND","WINNER_SQL_FIRST_LOOKUP");
  const retry=await http("/consultations/book","POST",winner,winningBody);
  ensure(retry.status===200&&obj(retry.data.data).kind==="idempotent_replay"&&
    obj(obj(retry.data.data).booking).id===bookId,"ACK_RETRY_200_SAME_BOOKING");
  const replayConflict=await http("/consultations/book","POST",winner,{...winningBody,petName:"Other dog"});
  ensure(replayConflict.status===409&&replayConflict.data.code==="CONSULTATION_IDEMPOTENCY_CONFLICT",
    "CHANGED_INTENT_SAME_KEY409");
  const loserUnknown=await http("/consultations/book/lookup","POST",loser,{idempotencyKey:losingBody.idempotencyKey});
  ensure(loserUnknown.status===200&&obj(loserUnknown.data.data).state==="UNKNOWN","LOSER_NO_LEAKED_RECEIPT");
  ensure((await prisma.consultationBooking.count({where:{slotId}}))===1&&
    (await prisma.consultationBookingIdempotency.count({where:{clientId:winner.id,key:winningBody.idempotencyKey}}))===1,
    "REPLAY_NO_SECOND_SQL_BOOKING_RECEIPT");
  pass("SQL_FIRST_UNKNOWN_ACK_WINNER_REPLAY_AND_CHANGING_INTENT_409_LOSER_LOOKUP_UNKNOWN");

  const foreignCancel=await http("/consultations/bookings/"+bookId+"/cancel","POST",loser,{});
  ensure(foreignCancel.status===403,"FOREIGN_CANCEL_403");
  const stillBooked=await prisma.consultationSlot.findUnique({where:{id:slotId},select:{status:true}});
  ensure(stillBooked?.status==="BOOKED"&&
    (await prisma.consultationBooking.findUnique({where:{id:bookId},select:{status:true}}))?.status==="PENDING_TRAINER_CONFIRMATION",
    "FOREIGN_CANCEL_CANNOT_UNBOOK");
  pass("LOSER_FOREIGN_CANCEL_403_NO_SQL_OR_SLOT_EFFECT");

  const cancel=await http("/consultations/bookings/"+bookId+"/cancel","POST",winner,{});
  ensure(cancel.status===200,"OWNER_CANCEL_200");
  const slotAfter=await prisma.consultationSlot.findUnique({where:{id:slotId},select:{status:true}});
  const bookAfter=await prisma.consultationBooking.findUnique({where:{id:bookId},select:{status:true,clientId:true}});
  ensure(slotAfter?.status==="FREE"&&bookAfter?.status==="CANCELLED_BY_USER"&&bookAfter.clientId===winner.id,
    "ATOMIC_CANCEL_BOOKING_AND_FREE_SLOT");
  const cancelledReplay=await http("/consultations/bookings/"+bookId+"/cancel","POST",winner,{});
  ensure(cancelledReplay.status===403,"DUPLICATE_CANCEL_DENIED_403");
  const verifyFree=await http("/consultations/cynologists/"+trainerId+"/slots/"+slotId+"/verify","GET",loser);
  ensure(verifyFree.status===200,"SECOND_ENTITLED_USER_SEES_RELEASED_SLOT");
  const ownMy=await http("/consultations/my","GET",winner);
  ensure(ownMy.status===200&&Array.isArray(obj(ownMy.data.data).items)&&
    (obj(ownMy.data.data).items as unknown[]).some(row=>obj(row).id===bookId&&obj(row).status==="CANCELLED_BY_USER"),
    "ORIGINAL_MY_GET_CANCELLED_STATUS");
  pass("ONE_OWNER_CANCEL_200_DUPLICATE_403_ATOMIC_FREE_SLOT_AND_LIVE_VERIFY_MY_GET");
  await cleanup();
  ensure(await prisma.user.count()===before.users&&
    await prisma.consultationBooking.count()===before.bookings&&
    await prisma.consultationSlot.count()===before.slots&&
    await prisma.consultationCynologist.count()===before.cynologists,
    "OWN_SCOPED_CLEANUP_RESTORES_AGGREGATE_SQL_COUNTS");
  pass("EXACT_OWN_SYNTHETIC_USER_TRAINER_BOOKING_SLOT_AND_ENTITLEMENT_CLEANUP");
  pass("ORIGINAL_HONO_CONCURRENT_SAME_SLOT_DIFFERENT_ENTITLED_USERS_ACCEPTED");
}
void (async()=>{try{await main();}catch(e){process.exitCode=1;console.error("AG1_CONS_TRUE_RACE_FAILED",e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"UNEXPECTED_REDACTED");}finally{try{await cleanup();console.warn("AG1_CONS_TRUE_RACE_OWN_CLEANUP=PASS");}catch{process.exitCode=1;console.error("AG1_CONS_TRUE_RACE_CLEANUP_REVIEW_REQUIRED");}await prisma.$disconnect();}})();
