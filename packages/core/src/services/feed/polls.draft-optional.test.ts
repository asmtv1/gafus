import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { createFeedPolls } from "./polls";

const postId = "post_1", owner = "author_1", other = "reader_1";
const saved = {
  id: "poll_1", postId, question: "Какой способ?",
  explanation: null, isQuiz: false, allowMultiple: false,
  isAnonymous: false, hideResults: false, shuffleOptions: false,
  endDate: null, options: [
    { id: "option_1", position: 0, text: "Первый",
      imageMedia: null, imageMediaId: null, isCorrect: false },
    { id: "option_2", position: 1, text: "Второй",
      imageMedia: null, imageMediaId: null, isCorrect: false },
  ],
};
function fixture(opts: {
  authorId?: string; status?: string; deleted?: boolean;
  moderated?: boolean; hasPoll?: boolean; exists?: boolean;
} = {}) {
  const post = {
    id: postId, authorId: opts.authorId ?? owner,
    status: opts.status ?? "draft", deletedAt: opts.deleted ? new Date() : null,
    publishedAt: opts.status === "published" ? new Date() : null,
    activeRevisionId: opts.status === "published" ? "revision_1" : null,
    moderationState: opts.moderated ? "hidden" : "visible",
  };
  const db = {
    user: { findUnique: vi.fn(async () => ({ id: owner })) },
    feedPost: { findUnique: vi.fn(async () => opts.exists === false ? null : post) },
    feedPoll: { findUnique: vi.fn(async () => opts.hasPoll ? saved : null) },
    feedPollVoteSelection: {
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
    },
    feedPollVote: {
      count: vi.fn(async () => 0),
    },
  } as unknown as FeedDb;
  const service = createFeedPolls({
    db,
    enabled: () => true,
    storage: { signCdn: vi.fn(async () => "https://cdn.test/file") },
  });
  return { db, service };
}

describe("owner-only optional draft poll", () => {
  it("returns null without an HTTP error for a draft with no poll", async () => {
    const { db, service } = fixture();
    await expect(service.getDraftOptional(owner, postId)).resolves.toBeNull();
    expect(db.feedPoll.findUnique).toHaveBeenCalledTimes(1);
  });
  it.each(["draft", "pending", "published", "failed"])(
    "returns no poll for the author during %s state without 404 races",
    async status => {
      const { service } = fixture({ status });
      await expect(service.getDraftOptional(owner, postId)).resolves.toBeNull();
    },
  );
  it.each([
    { authorId: other }, { deleted: true }, { moderated: true },
    { exists: false }, { status: "deleted" },
  ])("never interprets a foreign or inaccessible post as no poll: %j", async opts => {
    const { db, service } = fixture(opts);
    await expect(service.getDraftOptional(owner, postId))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(db.feedPoll.findUnique).not.toHaveBeenCalled();
  });
  it("returns a saved poll with the existing poll projector and no hidden data", async () => {
    const { service } = fixture({ hasPoll: true });
    const result = await service.getDraftOptional(owner, postId);
    expect(result).toMatchObject({
      id: saved.id, postId, question: saved.question, canEdit: true,
      options: [{ id: "option_1" }, { id: "option_2" }],
    });
  });
  it("rejects unauthenticated author instead of returning null", async () => {
    const { db, service } = fixture();
    vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);
    await expect(service.getDraftOptional(owner, postId))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(db.feedPoll.findUnique).not.toHaveBeenCalled();
  });
});
