import { normalizeSmartBreed } from "./smart-ranking";
import { describe, expect, it } from "vitest";
import {
  calculateSmartFeedScore, jaccardSimilarity, normalizeSmartText,
  rerankSmartFeed, smartAffinity, smartExploration,
} from "./smart-ranking";

const base = {
  ageHours: 6, cityMatch: 0, petTypeOverlap: 0, breedOverlap: 0,
  authorAffinity: 0, reactions: 2, uniqueCommenters: 1,
  bookmarks: 0, exploration: 0.3, seenRecently: false,
};

describe("smart feed scoring", () => {
  it("boosts the same city without filtering other cities", () => {
    expect(calculateSmartFeedScore({ ...base, cityMatch: 1 }).score)
      .toBeGreaterThan(calculateSmartFeedScore(base).score);
  });
  it("boosts matching public pet traits", () => {
    expect(calculateSmartFeedScore({ ...base, petTypeOverlap: 1, breedOverlap: 1 }).score)
      .toBeGreaterThan(calculateSmartFeedScore(base).score);
  });
  it("penalizes recent views only if behavior is enabled", () => {
    const seen = { ...base, seenRecently: true };
    expect(calculateSmartFeedScore(seen).score).toBeLessThan(calculateSmartFeedScore(base).score);
    const off = { city: true, pets: true, behavior: false, exploration: true };
    expect(calculateSmartFeedScore(seen, off)).toEqual(calculateSmartFeedScore(base, off));
  });
  it("saturates engagement; handles cold start and disabled signals", () => {
    const high = calculateSmartFeedScore({ ...base, reactions: 1e9, uniqueCommenters: 1e9, bookmarks: 1e9 });
    expect(Number.isFinite(high.score)).toBe(true);
    expect(high.score).toBeLessThan(101);
    const cold = calculateSmartFeedScore(base, { city: false, pets: false, behavior: false, exploration: true });
    expect(cold.score).toBeGreaterThan(0);
  });
  it("decays affinity, caps historic dominance", () => {
    expect(smartAffinity(100, 0)).toBeGreaterThan(smartAffinity(100, 60));
    expect(smartAffinity(1e7, 0)).toBeLessThanOrEqual(1);
  });
  it("exploration remains deterministic within the bucket", () => {
    const first = smartExploration("viewer", "post", "2026-10-10");
    expect(smartExploration("viewer", "post", "2026-10-10")).toBe(first);
    expect(smartExploration("viewer", "post", "2026-10-11")).not.toBe(first);
  });
  it("normalizes Cyrillic city and breed names", () => {
    expect(normalizeSmartText("  САНКТ-  ПЕТЕРБУРГ  ")).toBe("санкт- петербург");
    expect(normalizeSmartText(null)).toBeNull();
    expect(jaccardSimilarity(new Set(["DOG", "CAT"]), new Set(["DOG"]))).toBe(0.5);
  });
  it("keeps different authors apart when possible and never duplicates", () => {
    const make = (id: string, authorId: string, score: number) => ({
      id, authorId, score, publishedAt: new Date("2026-10-10"), discovery: false, reason: null,
    });
    const ranked = rerankSmartFeed([
      make("a1", "a", 99), make("a2", "a", 98), make("b1", "b", 97), make("b2", "b", 96),
    ]);
    expect(ranked.map(row => row.id)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(new Set(ranked.map(row => row.id)).size).toBe(4);
  });
  it("reserves discovery slots and honors the exploration opt-out", () => {
    const candidates = Array.from({ length: 27 }, (_, index) => ({
      id: `post_${index}`, authorId: `author_${index}`,
      score: 100 - index, publishedAt: new Date("2026-10-10"),
      discovery: index >= 24, reason: null,
    }));
    const exploratory = rerankSmartFeed(candidates, 27);
    expect(exploratory.slice(0, 20).filter(post => post.discovery)).toHaveLength(3);
    const optedOut = rerankSmartFeed(candidates, 27, false);
    expect(optedOut.slice(0, 20).filter(post => post.discovery)).toHaveLength(0);
    expect(exploratory.map(post => post.id).sort()).toEqual(optedOut.map(post => post.id).sort());
  });
});


describe("breed normalization", () => {
  it("unifies common Russian and English dog breed aliases", () => {
    expect(normalizeSmartBreed(" Labrador Retriever ")).toBe("лабрадор");
    expect(normalizeSmartBreed("ЛАБРАДОР-РЕТРИВЕР")).toBe("лабрадор");
    expect(normalizeSmartBreed("Йорк")).toBe("йоркширский терьер");
    expect(normalizeSmartBreed("")).toBeNull();
  });
});
