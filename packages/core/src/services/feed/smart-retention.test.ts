import { describe, expect, it, vi } from "vitest";
import { pruneSmartImpressions, pruneSmartRankingEvents, type SmartRetentionPort } from "./smart-retention";
describe("smart retention portable bounded policy",()=>{
  it("bounds both expiry batch sizes and passes dates without SQL delegates",async()=>{
    const pruneImpressions=vi.fn().mockResolvedValue(17);
    const pruneRankingEvents=vi.fn().mockResolvedValue(3);
    const port={pruneImpressions,pruneRankingEvents} satisfies SmartRetentionPort;
    expect(await pruneSmartImpressions(port,90,9000)).toBe(17);
    expect(pruneImpressions).toHaveBeenCalledWith(expect.any(Date),5000);
    expect(await pruneSmartRankingEvents(port,0,0)).toBe(3);
    expect(pruneRankingEvents).toHaveBeenCalledWith(expect.any(Date),1);
  });
});
