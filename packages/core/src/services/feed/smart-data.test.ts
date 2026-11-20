import { describe, expect, it, vi } from "vitest";
import { rankSmartCandidates, type SmartRankingSnapshotPort } from "./smart-data";
const now = new Date("2026-10-10T12:00:00.000Z");
const posts = [
  {id:"post_local",authorId:"author_local",publishedAt:new Date("2026-10-10T11:00:00Z")},
  {id:"post_other",authorId:"author_other",publishedAt:new Date("2026-10-10T11:00:00Z")},
];
function createSnapshot() {
  const readRecent=vi.fn().mockResolvedValue(posts);
  const readSignals=vi.fn().mockResolvedValue({
    viewer:{profile:{city:"МОСКВА"},pets:[{type:"DOG",breed:"Лабрадор"}]},
    authors:[
      {id:"author_local",profile:{city:"Москва"},pets:[{type:"DOG",breed:"Лабрадор"}]},
      {id:"author_other",profile:{city:"Казань"},pets:[{type:"CAT",breed:"Персидская"}]},
    ],
    seen:[],impressions:[],reactions:[],comments:[],bookmarks:[],views:[],materialized:[],
  });
  const readStats=vi.fn().mockResolvedValue(posts.map(post=>({
    postId:post.id,reactions:0,uniqueCommenters:0,bookmarks:0,impressions:0,
  })));
  return {snapshot:{readRecent,readSignals} satisfies SmartRankingSnapshotPort,readRecent,readSignals,readStats};
}
describe("smart ranking consumes only typed owner-scoped server snapshots",()=>{
  it("boosts matching city/pets and retains other cities",async()=>{
    const {snapshot,readStats}=createSnapshot();
    const result=await rankSmartCandidates(snapshot,"viewer",now,
      {useCity:true,usePets:true,useBehavior:false,exploration:false},readStats);
    expect(result.map(post=>post.id)).toEqual(["post_local","post_other"]);
    expect(result[0]?.score).toBeGreaterThan(result[1]!.score);
    expect(result[0]?.reason).toBe("similar_pet");
  });
  it("passes only viewer-bounded IDs and behavior flags to SQL provider",async()=>{
    const {snapshot,readSignals,readStats}=createSnapshot();
    const cutoff=new Date("2026-10-10T10:00:00Z");
    await rankSmartCandidates(snapshot,"viewer",now,
      {useCity:false,usePets:false,useBehavior:false,exploration:false,historyResetAt:cutoff},readStats);
    expect(readSignals).toHaveBeenCalledExactlyOnceWith("viewer",now,
      ["post_local","post_other"],["author_local","author_other"],{
        useBehavior:false,historyResetAt:cutoff,materializedAffinity:false,
      });
  });
  it("fails closed when a required SQL projection fails; never returns fabricated []",async()=>{
    const {snapshot,readStats}=createSnapshot();
    snapshot.readSignals.mockRejectedValueOnce(new Error("SQL_UNAVAILABLE"));
    await expect(rankSmartCandidates(snapshot,"viewer",now,
      {useCity:true,usePets:true,useBehavior:true,exploration:false},readStats))
      .rejects.toThrow("SQL_UNAVAILABLE");
  });
});
