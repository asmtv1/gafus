/** True PostgreSQL Chat2 send idempotency. Invoked only via isolated DB launcher.
 * This executes production service code with no fake JWT, CDN, broker, or network. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { sendMessage } from "../../apps/api/src/modules/chat2/service.js";
const safe=(()=>{try{const u=new URL(process.env.DATABASE_URL??"");return   process.env.GAFUS_CHAT2_REALPG==="1" && u.protocol==="postgresql:" &&
  u.hostname==="127.0.0.1" && u.username==="qachat" && Number(u.port)>10000 &&
  /^chat2_delivery_[a-f0-9]{12}$/.test(u.pathname.slice(1)) &&
  process.env.GAFUS_CHAT2_DB_NAME===u.pathname.slice(1);
}catch{return false;}})();
if(process.env.GAFUS_CHAT2_REALPG==="1" && !safe) throw Error("CHAT2_DISPOSABLE_TEST_GUARD_FAILED");
const suite=safe?describe:describe.skip;
let actor="",other="",room="",secondRoom="";
const rows=async()=>Promise.all([
  prisma.chat2Message.findMany({where:{conversationId:room},orderBy:{sequence:"asc"}}),
  prisma.chat2OutboxEvent.findMany({where:{conversationId:room},orderBy:{createdAt:"asc"}}),
  prisma.chat2Conversation.findUniqueOrThrow({where:{id:room}}),
]);
suite("production Chat2 message sends on one disposable PostgreSQL",()=>{
  beforeAll(async()=>{
    const [db]=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
    expect(db?.db).toBe(process.env.GAFUS_CHAT2_DB_NAME);
    const seed=randomUUID().slice(0,8);
    actor=(await prisma.user.create({data:{username:`qa-chat-owner-${seed}`,password:"not-a-login"}})).id;
    other=(await prisma.user.create({data:{username:`qa-chat-peer-${seed}`,password:"not-a-login"}})).id;
    room=(await prisma.chat2Conversation.create({data:{kind:"COMMUNITY",visibility:"PUBLIC",createdById:actor}})).id;
    secondRoom=(await prisma.chat2Conversation.create({data:{kind:"COMMUNITY",visibility:"PUBLIC",createdById:actor}})).id;
    await prisma.chat2Member.createMany({data:[{conversationId:room,userId:actor},
      {conversationId:room,userId:other},{conversationId:secondRoom,userId:actor}]});
  });
  afterAll(async()=>{await prisma.$disconnect();});
  it("concurrent same-key sends commit one message, one outbox and one sequence",async()=>{
    const key=randomUUID();
    const data={clientMessageId:key,text:"A message whose first HTTP response is lost"};
    const [a,b]=await Promise.all([sendMessage(actor,room,data),sendMessage(actor,room,data)]);
    expect(a.id).toBe(b.id);
    expect(a.sequence).toBe("1");
    const [messages,outbox,conversation]=await rows();
    expect(messages).toHaveLength(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.eventType).toBe("message.created");
    expect(conversation.nextSequence).toBe(1n);
    const retry=await sendMessage(actor,room,data);
    expect(retry.id).toBe(a.id);
    expect((await rows())[1]).toHaveLength(1);
  });
  it("changed same-key payload is rejected without writing; intentional subsequent same text has a new identity",async()=>{
    const first=(await rows())[0][0]!;
    await expect(sendMessage(actor,room,{clientMessageId:first.clientMessageId,text:"tampered"}))
      .rejects.toMatchObject({code:"MESSAGE_ID_CONFLICT",status:409});
    const next=await sendMessage(actor,room,{clientMessageId:randomUUID(),text:first.text});
    expect(next.id).not.toBe(first.id);
    expect(next.sequence).toBe("2");
    const [messages,events,conversation]=await rows();
    expect(messages).toHaveLength(2);
    expect(events).toHaveLength(2);
    expect(conversation.nextSequence).toBe(2n);
  });
  it("same client ID is scoped by actor and room, never replayed across principals",async()=>{
    const key=randomUUID();
    const [anotherActor,anotherRoom]=await Promise.all([
      sendMessage(other,room,{clientMessageId:key,text:"same-key"}),
      sendMessage(actor,secondRoom,{clientMessageId:key,text:"same-key"}),
    ]);
    expect(anotherActor.id).not.toBe(anotherRoom.id);
    expect((await rows())[0]).toHaveLength(3);
    expect(await prisma.chat2OutboxEvent.count({where:{conversationId:room}})).toBe(3);
    expect(await prisma.chat2OutboxEvent.count({where:{conversationId:secondRoom}})).toBe(1);
  });
});
