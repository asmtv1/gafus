import {describe,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>({
  chat2Conversation:{findUnique:vi.fn()},
  chat2Message:{findUnique:vi.fn()},
  chat2OutboxEvent:{updateMany:vi.fn()},
  $transaction:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:db}));
import {prepareChat2PushReceipt,claimChat2Outbox,quarantineExhaustedChat2Outbox} from "./chat2-outbox-rows";
describe("Chat2 push receipt scope",()=>{
  it("never creates a notification for a message from another conversation",async()=>{
    db.chat2Conversation.findUnique.mockResolvedValue({kind:"DIRECT"});
    db.chat2Message.findUnique.mockResolvedValue({conversationId:"other",authorId:"a",deletedAt:null});
    await expect(prepareChat2PushReceipt("requested","message",null)).resolves.toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

it("rechecks retry schedule and attempt snapshot before claiming or quarantining",async()=>{
  db.chat2OutboxEvent.updateMany.mockResolvedValue({count:0});
  const item={id:"event",attempts:8,operationId:null,lastErrorCode:null};
  await expect(claimChat2Outbox(item,"token",new Date())).resolves.toEqual({count:0});
  await expect(quarantineExhaustedChat2Outbox(item)).resolves.toEqual({count:0});
  for(const [query] of db.chat2OutboxEvent.updateMany.mock.calls) {
    expect(query.where).toMatchObject({id:"event",attempts:8,nextAttemptAt:{lte:expect.any(Date)}});
  }
});
