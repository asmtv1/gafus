import { describe, expect, it, vi } from "vitest";
import { mergeSmartSources, retrieveSmartCandidates, type SmartRetrievalPort } from "./smart-retrieval";
const at = new Date("2026-10-10T13:00:00Z");
const row = (id: string, authorId = id) => ({ id, authorId, publishedAt: at });

describe("multi-source Core retrieval has no database/table dependency", () => {
  it("deduplicates overlapping server-verified results and retains every source", async () => {
    const readCandidateSources = vi.fn().mockResolvedValue([
      { source:"recent", posts:[row("recent"),row("shared")] },
      { source:"local", posts:[row("local"),row("shared")] },
      { source:"pet", posts:[row("pet"),row("shared")] },
      { source:"affinity", posts:[row("affinity"),row("shared")] },
      { source:"trending", posts:[row("trending"),row("shared")] },
    ]);
    const port = {readCandidateSources} satisfies SmartRetrievalPort;
    const options = {useCity:true,usePets:true,useBehavior:true};
    const result = await retrieveSmartCandidates(port,"viewer",at,options);
    expect(result).toHaveLength(6);
    expect(result.find(post=>post.id==="shared")?.sources)
      .toEqual(["recent","local","pet","affinity","trending"]);
    expect(new Set(result.map(post=>post.id)).size).toBe(result.length);
    expect(readCandidateSources).toHaveBeenCalledExactlyOnceWith("viewer",at,options);
  });
  it("never supplies a fallback actor or suppresses server selection errors",async()=>{
    const error = new Error("smart retrieval projection unavailable");
    const port = {readCandidateSources:vi.fn().mockRejectedValue(error)} satisfies SmartRetrievalPort;
    await expect(retrieveSmartCandidates(port,"owner",at,{useCity:false,usePets:false,useBehavior:false}))
      .rejects.toBe(error);
    expect(port.readCandidateSources).toHaveBeenCalledOnce();
  });
  it("respects the global limit while accumulating overlapping source names", () => {
    const unique = Array.from({ length: 9 }, (_, index) => row(String(index)));
    const merged = mergeSmartSources([
      { source: "recent", posts: unique },
      { source: "trending", posts: [row("0"), row("1")] },
    ], 5);
    expect(merged).toHaveLength(5);
    expect(merged[0]?.sources).toEqual(["recent", "trending"]);
  });
});
