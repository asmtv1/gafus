import { describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({findMany:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{feedPost:{findMany:m.findMany}}}));
import { readChronologicalFeedRows } from "./chronologicalRows.js";

describe("feed-server chronological SQL projection and visibility",()=>{
  it("filters hidden authors and moderated/deleted posts, fetches one extra row for keyset cursor", async()=>{
    m.findMany.mockResolvedValueOnce([]);
    await readChronologicalFeedRows({actorId:"viewer",bookmarksOnly:false,cursor:null,pageSize:10});
    expect(m.findMany).toHaveBeenCalledTimes(1);
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take:11,
      orderBy:[{publishedAt:"desc"},{id:"desc"}],
      where:expect.objectContaining({status:"published",deletedAt:null,moderationState:"visible",
        author:{feedSubscribers:{none:{userId:"viewer",hidden:true}}}}),
    }));
  });
  it("binds bookmarks to the viewer and applies equal-time id tie-breaker",async()=>{
    m.findMany.mockResolvedValueOnce([]);
    const date=new Date("2026-11-18T10:00:00.000Z");
    await readChronologicalFeedRows({actorId:"another",bookmarksOnly:true,cursor:{date,id:"post-b"},pageSize:3});
    expect(m.findMany).toHaveBeenLastCalledWith(expect.objectContaining({take:4,
      where:expect.objectContaining({
        bookmarks:{some:{userId:"another"}},
        OR:[{publishedAt:{lt:date}},{publishedAt:date,id:{lt:"post-b"}}],
      }),
    }));
  });
});
