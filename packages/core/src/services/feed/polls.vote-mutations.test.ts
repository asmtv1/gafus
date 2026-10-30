/** In-memory transactional Prisma port: no database, provider, or HTTP listener. */
import { describe, expect, it } from "vitest";
import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";
import { createFeedPolls } from "./polls";

type VoteState = { voted: boolean; choices: string[]; updatedAt: Date | null };

function fixture(
  config: {
    quiz?: boolean;
    multiple?: boolean;
    voted?: boolean;
    closed?: boolean;
    visible?: boolean;
    published?: boolean;
    deleted?: boolean;
  } = {},
) {
  const timestamp = new Date("2026-10-24T12:00:00.000Z");
  const post = {
    id: "post1",
    authorId: "author",
    deletedAt: config.deleted ? timestamp : null,
    status: config.published === false ? "draft" : "published",
    moderationState: config.visible === false ? "hidden" : "visible",
    activeRevisionId: config.published === false ? null : "revision1",
  };
  const poll = {
    id: "poll1",
    postId: "post1",
    question: "Обычный опрос?",
    explanation: null,
    allowMultiple: config.multiple ?? false,
    isQuiz: config.quiz ?? false,
    isAnonymous: false,
    hideResults: false,
    shuffleOptions: false,
    endDate: config.closed ? new Date(timestamp.getTime() - 1000) : null,
    options: ["option_a", "option_b", "option_c"].map((id, position) => ({
      id,
      position,
      text: id,
      isCorrect: position === 0,
      imageMedia: null,
      imageMediaId: null,
    })),
  };
  let state: VoteState = {
    voted: config.voted ?? true,
    choices: config.voted === false ? [] : ["option_a"],
    updatedAt: null,
  };
  let serialized: Promise<void> = Promise.resolve();
  let failNextCreate = false;
  const locks: string[] = [];
  const writes: string[] = [];
  const db = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        ["reader", "stranger"].includes(where.id) ? { id: where.id } : null,
    },
    feedPost: {
      findUnique: async () => post,
      findFirst: async () =>
        post.status === "published" &&
        post.activeRevisionId &&
        !post.deletedAt &&
        post.moderationState === "visible"
          ? { id: post.id }
          : null,
    },
    feedPoll: { findUnique: async () => poll },
    feedPollVoteSelection: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        where.userId === "reader" ? state.choices.map((optionId) => ({ optionId })) : [],
      groupBy: async () => state.choices.map((optionId) => ({ optionId, _count: { _all: 1 } })),
    },
    feedPollVote: { count: async () => Number(state.voted) },
    $transaction: <T>(run: (tx: unknown) => Promise<T>) => {
      const task = serialized.then(async () => {
        const staged: VoteState = { ...state, choices: [...state.choices] };
        const tx = {
          $queryRaw: async (sql: TemplateStringsArray) => {
            const lock = sql.join("?");
            locks.push(lock);
            return [{ id: post.id }];
          },
          feedPost: { findFirst: db.feedPost.findFirst },
          feedPoll: { findUnique: db.feedPoll.findUnique },
          feedPollVote: {
            findUnique: async ({ where }: { where: { pollId_userId: { userId: string } } }) =>
              staged.voted && where.pollId_userId.userId === "reader" ? { pollId: poll.id } : null,
            delete: async () => {
              writes.push("deleteVote");
              staged.voted = false;
              staged.choices = [];
            },
            update: async ({ data }: { data: { updatedAt: Date } }) => {
              writes.push("updateVote");
              staged.updatedAt = data.updatedAt;
            },
            create: async () => {
              if (staged.voted)
                throw new Prisma.PrismaClientKnownRequestError("Unique vote", {
                  code: "P2002",
                  clientVersion: "synthetic",
                });
              writes.push("createVote");
              staged.voted = true;
            },
          },
          feedPollVoteSelection: {
            findMany: async ({ where }: { where: { userId: string } }) =>
              where.userId === "reader" ? staged.choices.map((optionId) => ({ optionId })) : [],
            deleteMany: async () => {
              writes.push("deleteSelections");
              staged.choices = [];
            },
            createMany: async ({ data }: { data: { optionId: string }[] }) => {
              writes.push("createSelections");
              if (failNextCreate) {
                failNextCreate = false;
                throw new Error("synthetic atomic failure");
              }
              staged.choices = data.map((row) => row.optionId);
            },
          },
        };
        const result = await run(tx);
        state = staged; // only a successfully committed transaction becomes visible
        return result;
      });
      serialized = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
  };
  const service = createFeedPolls({
    db: db as unknown as FeedDb,
    enabled: () => true,
    now: () => new Date(timestamp),
    storage: { signCdn: async () => "unused" },
  });
  return {
    service,
    snapshot: () => ({ ...state, choices: [...state.choices] }),
    failNext: () => {
      failNextCreate = true;
    },
    writes,
    locks,
  };
}

describe("SOC041 ordinary poll change/cancel authoritative transactional source", () => {
  it("changes only actor selections and returns refreshed poll DTO", async () => {
    const t = fixture();
    const result = await t.service.changeVote("reader", "post1", { optionIds: ["option_b"] });
    expect(result.myOptionIds).toEqual(["option_b"]);
    expect(result.totalVotes).toBe(1);
    expect(t.snapshot().choices).toEqual(["option_b"]);
    expect(t.writes).toEqual(["deleteSelections", "createSelections", "updateVote"]);
    expect(t.locks.join(" ")).toContain("FOR UPDATE");
  });

  it("replaying same selection is stable and order-insensitive for multiple choices", async () => {
    const t = fixture({ multiple: true });
    await t.service.changeVote("reader", "post1", { optionIds: ["option_c", "option_b"] });
    const before = t.snapshot();
    t.writes.length = 0;
    const again = await t.service.changeVote("reader", "post1", {
      optionIds: ["option_b", "option_c"],
    });
    expect(again.myOptionIds).toEqual(["option_c", "option_b"]);
    expect(t.snapshot()).toEqual(before);
    expect(t.writes).toEqual([]);
  });

  it("cancel deletes actor vote with cascade; repeated cancel is idempotent", async () => {
    const t = fixture();
    const response = await t.service.cancelVote("reader", "post1");
    expect(response.myOptionIds).toEqual([]);
    expect(response.totalVotes).toBeNull(); // original hidden-results policy after cancel
    expect(t.snapshot()).toMatchObject({ voted: false, choices: [] });
    t.writes.length = 0;
    const second = await t.service.cancelVote("reader", "post1");
    expect(second.myOptionIds).toEqual([]);
    expect(t.writes).toEqual([]);
    expect(t.locks).toHaveLength(2);
  });

  it("PUT does not silently create a missing vote; POST keeps duplicate 409", async () => {
    const t = fixture({ voted: false });
    await expect(
      t.service.changeVote("reader", "post1", { optionIds: ["option_b"] }),
    ).rejects.toMatchObject({ code: "VOTE_NOT_FOUND", status: 409 });
    expect(t.snapshot().voted).toBe(false);
    await t.service.vote("reader", "post1", { optionIds: ["option_a"] });
    await expect(
      t.service.vote("reader", "post1", { optionIds: ["option_b"] }),
    ).rejects.toMatchObject({ code: "ALREADY_VOTED", status: 409 });
  });

  it("quiz changes and cancellations are both locked, without affecting first-vote semantics", async () => {
    const t = fixture({ quiz: true });
    const first = t.snapshot();
    await expect(
      t.service.changeVote("reader", "post1", { optionIds: ["option_b"] }),
    ).rejects.toMatchObject({ code: "QUIZ_VOTE_LOCKED", status: 409 });
    await expect(t.service.cancelVote("reader", "post1")).rejects.toMatchObject({
      code: "QUIZ_VOTE_LOCKED",
      status: 409,
    });
    expect(t.snapshot()).toEqual(first);
    expect(t.writes).toHaveLength(0);
  });

  it("rejects invalid options, multiplicity and duplicate ids before mutation", async () => {
    const t = fixture();
    await expect(
      t.service.changeVote("reader", "post1", { optionIds: ["invalid"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    await expect(
      t.service.changeVote("reader", "post1", { optionIds: ["option_a", "option_b"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    await expect(
      t.service.changeVote("reader", "post1", { optionIds: ["option_a", "option_a"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(t.writes).toHaveLength(0);
    expect(t.snapshot().choices).toEqual(["option_a"]);
  });

  it.each([
    [{ closed: true }, "POLL_CLOSED", 409],
    [{ visible: false }, "NOT_FOUND", 404],
    [{ published: false }, "NOT_FOUND", 404],
    [{ deleted: true }, "NOT_FOUND", 404],
  ] as const)(
    "refuses %j change and cancel without touching votes",
    async (condition, code, status) => {
      const t = fixture(condition);
      await expect(
        t.service.changeVote("reader", "post1", { optionIds: ["option_b"] }),
      ).rejects.toMatchObject({ code, status });
      await expect(t.service.cancelVote("reader", "post1")).rejects.toMatchObject({ code, status });
      expect(t.writes).toHaveLength(0);
      expect(t.snapshot().choices).toEqual(["option_a"]);
    },
  );

  it("rolls back selections and vote timestamp if replacement createMany fails", async () => {
    const t = fixture();
    const before = t.snapshot();
    t.failNext();
    await expect(
      t.service.changeVote("reader", "post1", { optionIds: ["option_b"] }),
    ).rejects.toThrow("synthetic atomic failure");
    expect(t.snapshot()).toEqual(before);
    expect((await t.service.get("reader", "post1")).myOptionIds).toEqual(["option_a"]);
  });

  it("overlapping change/cancel requests serialize with exclusive lock and never partial-update", async () => {
    const t = fixture({ multiple: true });
    const results = await Promise.allSettled([
      t.service.changeVote("reader", "post1", { optionIds: ["option_b", "option_c"] }),
      t.service.cancelVote("reader", "post1"),
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect(t.snapshot()).toMatchObject({ voted: false, choices: [] });
    expect(t.locks).toHaveLength(2);
    expect(t.locks.every((lock) => lock.includes("FOR UPDATE"))).toBe(true);
    expect(t.writes).toEqual(["deleteSelections", "createSelections", "updateVote", "deleteVote"]);
  });

  it("an authenticated stranger cannot change or delete somebody else's vote", async () => {
    const t = fixture();
    const before = t.snapshot();
    await expect(
      t.service.changeVote("stranger", "post1", { optionIds: ["option_b"] }),
    ).rejects.toMatchObject({ code: "VOTE_NOT_FOUND", status: 409 });
    const canceled = await t.service.cancelVote("stranger", "post1");
    expect(canceled.myOptionIds).toEqual([]);
    expect(t.snapshot()).toEqual(before);
    expect(t.writes).toHaveLength(0);
  });

  it("unregistered actor cannot change or cancel and never opens a transaction", async () => {
    const t = fixture();
    await expect(
      t.service.changeVote("unknown", "post1", { optionIds: ["option_b"] }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(t.service.cancelVote("unknown", "post1")).rejects.toMatchObject({ status: 401 });
    expect(t.locks).toHaveLength(0);
  });
});
