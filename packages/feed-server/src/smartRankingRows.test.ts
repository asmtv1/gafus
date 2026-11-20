import {beforeEach,describe,expect,it,vi} from "vitest";
const queries=vi.hoisted(()=>({
 posts:vi.fn(),viewer:vi.fn(),authors:vi.fn(),seen:vi.fn(),impressions:vi.fn(),
 reactions:vi.fn(),comments:vi.fn(),bookmarks:vi.fn(),views:vi.fn(),affinity:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{
 feedPost:{findMany:queries.posts},
 user:{findUnique:queries.viewer,findMany:queries.authors},
 feedPostView:{findMany:queries.seen},
 feedImpression:{groupBy:queries.impressions},
 feedPostReaction:{findMany:queries.reactions},
 feedComment:{findMany:queries.comments},
 feedBookmark:{findMany:queries.bookmarks},
 feedUserAuthorAffinity:{findMany:queries.affinity},
}}));
import {smartRankingRows} from "./smartRankingRows.js";
const at=new Date("2026-10-10T12:00:00.000Z");
beforeEach(()=>{
 vi.resetAllMocks();
 queries.posts.mockResolvedValue([{id:"p",authorId:"a",publishedAt:at}]);
 queries.viewer.mockResolvedValue({profile:{city:"Москва"},pets:[{type:"DOG",breed:"Лабрадор"}]});
 queries.authors.mockResolvedValue([{id:"a",profile:{city:"Москва"},pets:[]}]);
 for(const method of ["seen","impressions","reactions","comments","bookmarks","views","affinity"] as const)
   queries[method].mockResolvedValue([]);
});
describe("feed-server Smart ranking source and signals SQL adapter",()=>{
 it("single-source candidates always exclude hidden authors and negative feedback",async()=>{
  await smartRankingRows.readRecent("owner",at);
  expect(queries.posts).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
   take:400,where:expect.objectContaining({
     status:"published",moderationState:"visible",deletedAt:null,
     feedback:{none:{userId:"owner",kind:"not_interested"}},
     author:{feedSubscribers:{none:{userId:"owner",hidden:true}}},
   }),
  }));
 });
 it("reads public author pets only and suppresses optional behavioral queries",async()=>{
  const snapshot=await smartRankingRows.readSignals("owner",at,["p"],["a"],{
    useBehavior:false,historyResetAt:null,materializedAffinity:false,
  });
  expect(snapshot.authors[0]?.id).toBe("a");
  expect(queries.authors.mock.calls[0]?.[0].select.pets.where.showInProfile).toBe(true);
  expect(queries.reactions).not.toHaveBeenCalled();
  expect(queries.comments).not.toHaveBeenCalled();
  expect(queries.bookmarks).not.toHaveBeenCalled();
  expect(queries.views).not.toHaveBeenCalled();
  expect(queries.affinity).not.toHaveBeenCalled();
 });
 it("scopes all behavior and recent impressions to viewer and reset cutoff",async()=>{
  const cutoff=new Date("2026-10-10T11:00:00.000Z");
  await smartRankingRows.readSignals("owner",at,["p"],["a"],{
    useBehavior:true,historyResetAt:cutoff,materializedAffinity:true,
  });
  expect(queries.seen.mock.calls[0]?.[0].where).toMatchObject({
    userId:"owner",postId:{in:["p"]},createdAt:{gte:cutoff},
  });
  expect(queries.reactions.mock.calls[0]?.[0].where).toMatchObject({
    userId:"owner",post:{authorId:{in:["a"]}},createdAt:{gte:cutoff},
  });
  expect(queries.affinity.mock.calls[0]?.[0].where).toMatchObject({
    userId:"owner",authorId:{in:["a"]},
    updatedAt:{gte:new Date("2026-10-10T11:30:00.000Z")},
  });
 });
});
