import { beforeEach, describe, expect, it, vi } from "vitest";
const queries=vi.hoisted(()=>({
  viewer:vi.fn(),affinity:vi.fn(),liked:vi.fn(),commented:vi.fn(),
  saved:vi.fn(),viewed:vi.fn(),posts:vi.fn(),stats:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{
  user:{findUnique:queries.viewer},
  feedUserAuthorAffinity:{findMany:queries.affinity},
  feedPostReaction:{findMany:queries.liked},
  feedComment:{findMany:queries.commented},
  feedBookmark:{findMany:queries.saved},
  feedPostView:{findMany:queries.viewed},
  feedPost:{findMany:queries.posts},
  feedPostStats:{findMany:queries.stats},
}}));
import {smartRetrievalRows} from "./smartRetrievalRows.js";
const at=new Date("2026-10-10T13:00:00Z");
const row=(id:string,authorId=id)=>({id,authorId,publishedAt:at});
beforeEach(()=>{
  vi.resetAllMocks();
  queries.viewer.mockResolvedValue({profile:{city:" МОСКВА "},pets:[{type:"DOG",breed:"Лабрадор"}]});
  queries.affinity.mockResolvedValue([{authorId:"followed"}]);
  queries.liked.mockResolvedValue([{post:{authorId:"liked"}}]);
  queries.commented.mockResolvedValue([{post:{authorId:"commented"}}]);
  queries.saved.mockResolvedValue([{post:{authorId:"bookmarked"}}]);
  queries.viewed.mockResolvedValue([{post:{authorId:"viewed"}}]);
  queries.posts.mockResolvedValueOnce([row("recent"),row("shared")])
    .mockResolvedValueOnce([row("local"),row("shared")])
    .mockResolvedValueOnce([row("pet"),row("shared")])
    .mockResolvedValueOnce([row("affinity"),row("shared")]);
  queries.stats.mockResolvedValue([{post:row("trending")},{post:row("shared")}]);
});
describe("feed-server owns all SQL/ACL selection for multi-source smart feed",()=>{
  it("applies hard owner/moderation/visibility filters to every source",async()=>{
    const sources=await smartRetrievalRows.readCandidateSources("viewer",at,{
      useCity:true,usePets:true,useBehavior:true,
    });
    expect(sources.map(s=>s.source)).toEqual(["recent","local","pet","affinity","trending"]);
    expect(sources[4]?.posts.map(p=>p.id)).toEqual(["trending","shared"]);
    expect(queries.posts).toHaveBeenCalledTimes(4);
    for(const args of queries.posts.mock.calls){
      const where=args[0].where;
      expect(where).toMatchObject({
        status:"published",deletedAt:null,moderationState:"visible",
        feedback:{none:{userId:"viewer",kind:"not_interested"}},
        author:{feedSubscribers:{none:{userId:"viewer",hidden:true}}},
      });
    }
    expect(queries.posts.mock.calls[1]?.[0].where.author.profile).toEqual({is:{cityKey:"москва"}});
    expect(queries.posts.mock.calls[2]?.[0].where.author.pets.some.showInProfile).toBe(true);
    expect(queries.posts.mock.calls[3]?.[0].where.authorId.in)
      .toEqual(["followed","liked","commented","bookmarked","viewed"]);
    expect(queries.stats.mock.calls[0]?.[0].where).toEqual({post:expect.objectContaining({
      moderationState:"visible",deletedAt:null,
    })});
  });
  it("does not query location, pets or behavioral profiles when opted out",async()=>{
    await smartRetrievalRows.readCandidateSources("viewer",at,{
      useCity:false,usePets:false,useBehavior:false,
    });
    expect(queries.posts).toHaveBeenCalledTimes(1);
    expect(queries.affinity).not.toHaveBeenCalled();
    expect(queries.liked).not.toHaveBeenCalled();
    expect(queries.commented).not.toHaveBeenCalled();
    expect(queries.saved).not.toHaveBeenCalled();
    expect(queries.viewed).not.toHaveBeenCalled();
  });
  it("respects reset cutoff when deriving behavioral candidates",async()=>{
    const cutoff=new Date("2026-10-10T10:00:00Z");
    await smartRetrievalRows.readCandidateSources("viewer",at,{
      useCity:false,usePets:false,useBehavior:true,historyResetAt:cutoff,
    });
    expect(queries.affinity.mock.calls[0]?.[0].where.updatedAt).toEqual({gte:cutoff});
    expect(queries.liked.mock.calls[0]?.[0].where.createdAt).toEqual({gte:cutoff});
    expect(queries.commented.mock.calls[0]?.[0].where.createdAt).toEqual({gte:cutoff});
  });
});
