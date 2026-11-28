import { beforeEach, describe, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({
  chat2V2MediaTask:{findUnique:vi.fn(),updateMany:vi.fn()},
  chat2MediaDeletionIntent:{updateMany:vi.fn()},
}));
vi.mock("@gafus/prisma",()=>({prisma:db}));
import {prepareChat2V2MediaDeletion,acknowledgeChat2DeletionIntent,claimChat2DeletionIntent} from "./chat2DeletionRows";
describe("Chat2 terminal deletion fence",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("refuses to release object keys when the terminal-state CAS fails",async()=>{
    db.chat2V2MediaTask.findUnique.mockResolvedValue({
      mediaId:"m",conversationId:"c",ownerId:"u",status:"READY",
      sourceKey:"chat2/c/u/m/incoming/source.mp4",
    });
    db.chat2V2MediaTask.updateMany.mockResolvedValue({count:0});
    await expect(prepareChat2V2MediaDeletion("m")).rejects.toThrow("CHAT2_V2_DELETE_ACTIVE_PROCESSING");
    db.chat2V2MediaTask.updateMany.mockResolvedValue({count:1});
    await expect(prepareChat2V2MediaDeletion("m")).resolves.toEqual({
      sourceKey:"chat2/c/u/m/incoming/source.mp4",finalBase:"chat2/c/u/m/v1/",
    });
  });
  it("acknowledges only the exact deletion lease",async()=>{
    const lease=new Date("2026-11-27T01:00:00Z");
    db.chat2MediaDeletionIntent.updateMany.mockResolvedValue({count:0});
    await expect(acknowledgeChat2DeletionIntent({objectKey:"key",status:"PENDING"},lease))
      .resolves.toEqual({count:0});
    expect(db.chat2MediaDeletionIntent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{objectKey:"key",status:"PENDING",claimedUntil:lease},
    }));
  });
});

it("does not claim an intent rescheduled since the due scan",async()=>{
  db.chat2MediaDeletionIntent.updateMany.mockResolvedValue({count:0});
  await expect(claimChat2DeletionIntent({objectKey:"key",status:"PENDING",attempts:2},new Date())).resolves.toEqual({count:0});
  expect(db.chat2MediaDeletionIntent.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({where:expect.objectContaining({attempts:2,availableAt:{lte:expect.any(Date)}})}));
});
