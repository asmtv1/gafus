import { describe, it, expect } from "vitest";
import { updateChat2ReactionSummary, CHAT2_EMOJIS } from "./messageReactions";
describe("Chat2 reaction summary", () => {
  it("offers six shared emoji choices", () => {
    expect(CHAT2_EMOJIS).toEqual(["👍", "❤️", "😂", "😮", "😢", "👏"]);
  });
  it("switches an own reaction, preserving other people's counts", () => {
    const previous = [{ emoji: "👍", count: 2, mine: true }, { emoji: "😂", count: 3, mine: false }];
    const changed = updateChat2ReactionSummary(previous, "😂", true);
    expect(changed).toEqual([
      { emoji: "👍", count: 1, mine: false }, { emoji: "😂", count: 4, mine: true },
    ]);
    expect(previous[0].count).toBe(2);
    expect(updateChat2ReactionSummary(changed, "😂", false)).toEqual([
      { emoji: "👍", count: 1, mine: false }, { emoji: "😂", count: 3, mine: false },
    ]);
    expect(updateChat2ReactionSummary([], "👏", true)).toEqual([
      { emoji: "👏", count: 1, mine: true },
    ]);
  });
});
