import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: {
  findMany: mocks.findMany, findFirst: mocks.findFirst,
} } }));
import { findChatUserIdByUsername, listCandidateChatUsers } from "./service";
beforeEach(() => vi.clearAllMocks());
describe("scoped chat discovery reads in application layer", () => {
  it("excludes the actor, deleted accounts and the reserved specialist", async () => {
    mocks.findMany.mockResolvedValue([{ id: "found", username: "member" }]);
    expect(await listCandidateChatUsers("actor", "mem")).toEqual([{ id: "found", username: "member" }]);
    expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        username: { contains: "mem", mode: "insensitive", not: "lana" },
        id: { not: "actor" }, accountDeletionRequestedAt: null,
      }, select: { id: true, username: true }, take: 15,
    });
  });
  it("only resolves nondeleted case-insensitive usernames", async () => {
    mocks.findFirst.mockResolvedValue({ id: "target" });
    expect(await findChatUserIdByUsername("TeAmB")).toBe("target");
    expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { username: { equals: "TeAmB", mode: "insensitive" }, accountDeletionRequestedAt: null },
      select: { id: true },
    });
  });
  it("never invents an ID for a deleted or unknown target", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await findChatUserIdByUsername("missing")).toBeNull();
  });
});
