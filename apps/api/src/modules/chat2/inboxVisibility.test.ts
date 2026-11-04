import { describe, expect, it } from "vitest";
import { collectBlockedDirectPeerIds, collectDirectInboxPeerIds } from "./inboxVisibility";

describe("Chat2 inbox access policy projections", () => {
  it("deduplicates direct counterparts and ignores self-only, non-direct and empty rooms", () => {
    const room = (kind: string, members: string[]) => ({
      conversation: { kind, members: members.map(userId => ({ userId })) },
    });
    expect(collectDirectInboxPeerIds([
      room("DIRECT", ["actor", "other"]), room("DIRECT", ["actor", "other"]),
      room("GROUP", ["actor", "foreign"]), room("DIRECT", ["actor"]),
      room("DIRECT", ["actor", "third"]),
    ], "actor")).toEqual(["other", "third"]);
    expect(collectDirectInboxPeerIds([], "actor")).toEqual([]);
  });
  it("treats incoming and outgoing blocks symmetrically without foreign-pair privilege", () => {
    expect([...collectBlockedDirectPeerIds("actor", [
      { blockerId: "actor", blockedId: "outgoing" },
      { blockerId: "incoming", blockedId: "actor" },
      { blockerId: "unrelated", blockedId: "unrelated2" },
      { blockerId: "actor", blockedId: "outgoing" },
    ])]).toEqual(["outgoing", "incoming"]);
  });
});
