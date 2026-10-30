/** WEB1: registered worker -> real Core -> isolated PostgreSQL -> fake push ACK.
 * Never enumerate or deliver to a snapshot user. Only the synthetic fixture is
 * eligible, with every network provider replaced by a local test double.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { getTrainingReminderLocalTime } from "@gafus/core/services/reminders";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const enabled = process.env.GAFUS_WEB1_ISOLATED_REMINDER_TEST === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
  if (process.cwd() !== `${ROOT}/packages/worker` ||
      url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      url.port !== "55921" || url.pathname !== "/gafus_refactor_real_work_20261024" ||
      url.username !== "gafus_refactor_local_real" || !url.password ||
      url.search !== "?schema=public" || process.env.GAFUS_LOCAL_ISOLATED_API !== "1") {
    throw Error("DENIED: WEB1 only accepts the attested project-local WORK PostgreSQL");
  }
}
const fake = vi.hoisted(() => ({
  id: "", reminder: "", endpoint: "", sends: vi.fn(),
}));
// Candidate list is hard-bound to this test's synthetic reminder. Never call
// the broad production-shaped Core scan that would include unrelated users.
vi.mock("@gafus/core/services/reminders", async (importOriginal) => {
  const original = await importOriginal<object>();
  const { prisma: db } = await import("@gafus/prisma");
  const trainingReminderLocalDayKey = (original as {
    trainingReminderLocalDayKey: (timezone:string,now:Date)=>string
  }).trainingReminderLocalDayKey;
  const projection = { id: true, userId: true, name: true, reminderTime: true,
    reminderDays: true, timezone: true, lastSentAt: true } as const;
  return {
    ...original,
    listActiveTrainingReminderCandidates: async () => {
      if (!fake.id || !fake.reminder) throw Error("DENIED: no WEB1 owned synthetic fixture");
      return db.reminder.findMany({where:{id:fake.reminder,userId:fake.id,type:"training",enabled:true},select:projection});
    },
    listRetryableTrainingReminderCandidates: async (now:Date) => {
      if (!fake.id || !fake.reminder) throw Error("DENIED: no WEB1 owned synthetic fixture");
      const rows = await db.trainingReminderDelivery.findMany({
        where: {reminderId:fake.reminder,status:"PENDING",
          OR:[{leaseExpiresAt:null},{leaseExpiresAt:{lt:now}}],
          reminder:{userId:fake.id,type:"training",enabled:true}},
        select:{localDate:true,reminder:{select:projection}},
      });
      return rows.filter(row=>
        row.localDate===trainingReminderLocalDayKey(row.reminder.timezone,now))
        .map(row=>row.reminder);
    },
  };
});
vi.mock("@gafus/webpush", () => ({
  PushNotificationService: {
    fromEnvironment: () => ({
      sendNotifications: async (subscriptions: {endpoint:string}[], payload: string) => {
        if (subscriptions.length!==1 || subscriptions[0]?.endpoint!==fake.endpoint ||
            !fake.endpoint.startsWith("https://example.invalid/web1-isolated/")) {
          throw Error("DENIED: attempted non-WEB1 push delivery");
        }
        const json=JSON.parse(payload) as {title?:unknown;body?:unknown};
        if(json.title!=="Напоминание о тренировке" || typeof json.body!=="string")
          throw Error("DENIED: unexpected push payload");
        return fake.sends(subscriptions,payload);
      },
    }),
    shouldDeleteSubscription: () => false,
  },
  partitionPushSubscriptions: (subscriptions:{endpoint:string}[]) => {
    if (subscriptions.some(item=>item.endpoint!==fake.endpoint))
      throw Error("DENIED: foreign push subscription");
    return {web:subscriptions,expo:[],rustore:[]};
  },
  sendExpoPushNotifications: () => { throw Error("DENIED: external Expo provider"); },
  sendRustorePushNotifications: () => { throw Error("DENIED: external RuStore provider"); },
}));
vi.mock("@gafus/logger", () => ({createWorkerLogger:()=>({
  info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn(),
})}));
import { sendTrainingReminders } from "./training-reminders-sender";
const suite = enabled ? describe : describe.skip;
const success = () => ({successCount:1,failureCount:0,
  results:[{endpoint:fake.endpoint,success:true}]});
const failed = () => ({successCount:0,failureCount:1,
  results:[{endpoint:fake.endpoint,success:false,error:new Error("fake delivery refused")}]});

suite("WEB1 isolated PostgreSQL training reminder delivery + fake provider", () => {
  beforeAll(async () => {
    const identity = await prisma.$queryRaw<{db:string;actor:string}[]>`
      SELECT current_database() AS db, current_user AS actor`;
    expect(identity).toEqual([{db:"gafus_refactor_real_work_20261024",actor:"gafus_refactor_local_real"}]);
  });
  beforeEach(async () => {
    fake.sends.mockReset();fake.id=randomUUID();fake.reminder=randomUUID();
    fake.endpoint=`https://example.invalid/web1-isolated/${fake.id}`;
    const local=getTrainingReminderLocalTime("Etc/UTC",new Date());
    const at=`${String(local.hour).padStart(2,"0")}:${String(local.minute).padStart(2,"0")}`;
    await prisma.user.create({data:{id:fake.id,username:`web1_reminder_${fake.id.replaceAll("-", "")}`,
      password:randomUUID(),role:"USER",registrationPending:false}});
    await prisma.reminder.create({data:{id:fake.reminder,userId:fake.id,type:"training",
      name:"WEB1 disposable training reminder",enabled:true,reminderTime:at,
      reminderDays:null,timezone:"Etc/UTC"}});
    await prisma.pushSubscription.create({data:{userId:fake.id,endpoint:fake.endpoint,
      keys:{auth:"web1-synthetic-only",p256dh:"web1-synthetic-only"}}});
    fake.sends.mockImplementation(async()=>success());
  });
  afterEach(async () => {
    const user=await prisma.user.findUnique({where:{id:fake.id},select:{username:true}});
    if (user && user.username!==`web1_reminder_${fake.id.replaceAll("-", "")}`)
      throw Error("DENIED: test cleanup owner does not match");
    await prisma.pushSubscription.deleteMany({where:{userId:fake.id,endpoint:fake.endpoint}});
    await prisma.reminder.deleteMany({where:{id:fake.reminder,userId:fake.id}});
    if(user)await prisma.user.delete({where:{id:fake.id}});
    fake.id="";fake.reminder="";fake.endpoint="";
  });
  afterAll(async()=>prisma.$disconnect());

  it("SQL candidate -> 1 fake web ACK -> SENT receipt, no second delivery same day", async () => {
    const first=await sendTrainingReminders();
    expect(first).toEqual({sent:1,skipped:0,errors:0});
    expect(fake.sends).toHaveBeenCalledTimes(1);
    const receipt=await prisma.trainingReminderDelivery.findMany({
      where:{reminderId:fake.reminder},
    });
    expect(receipt).toHaveLength(1);
    expect(receipt[0]).toMatchObject({status:"SENT",attemptCount:1});
    expect(receipt[0]?.sentAt).toBeInstanceOf(Date);
    const stored=await prisma.reminder.findUniqueOrThrow({where:{id:fake.reminder}});
    expect(stored.lastSentAt).toBeInstanceOf(Date);
    const again=await sendTrainingReminders();
    expect(again).toEqual({sent:0,skipped:1,errors:0});
    expect(fake.sends).toHaveBeenCalledTimes(1);
  });
  it("fake provider refusal releases claim, next attempt succeeds without duplicate daily receipt", async () => {
    fake.sends.mockImplementationOnce(async()=>failed()).mockImplementation(async()=>success());
    expect(await sendTrainingReminders()).toEqual({sent:0,skipped:0,errors:1});
    let receipt=await prisma.trainingReminderDelivery.findMany({where:{reminderId:fake.reminder}});
    expect(receipt).toHaveLength(1);
    expect(receipt[0]).toMatchObject({status:"PENDING",attemptCount:1,leaseToken:null});
    expect(await sendTrainingReminders()).toEqual({sent:1,skipped:0,errors:0});
    receipt=await prisma.trainingReminderDelivery.findMany({where:{reminderId:fake.reminder}});
    expect(receipt).toHaveLength(1);
    expect(receipt[0]).toMatchObject({status:"SENT",attemptCount:2});
    expect(fake.sends).toHaveBeenCalledTimes(2);
  });
});
