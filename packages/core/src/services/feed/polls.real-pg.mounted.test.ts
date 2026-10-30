/** SOC041: source createFeedPolls → real Prisma → owned PG18 schema, fiction only. */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@gafus/prisma";
import { createFeedPolls } from "./polls";

const expectedDb = "gafus_refactor_poll_tx_ag1_20261024";
const expectedData =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const expectedSocket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const candidate = process.env.DATABASE_URL ?? "";
const parse = new URL(candidate);
if (
  process.env.G1_AG1_POLL_OWN_PG18 !== "1" ||
  parse.protocol !== "postgresql:" ||
  parse.hostname !== "localhost" ||
  parse.port !== "55917" ||
  parse.pathname !== `/${expectedDb}` ||
  parse.searchParams.get("host") !== expectedSocket ||
  parse.searchParams.get("application_name") !== "ag1_poll_tx_20261024" ||
  parse.password !== ""
) {
  throw Error("REFUSE_NONOWNED_POLL_PG18_DATABASE");
}
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = require("@prisma/client").PrismaClient as new (args: {
  datasources: { db: { url: string } };
}) => PrismaClient;
const db = new Client({ datasources: { db: { url: candidate } } });
const now = new Date("2026-10-24T12:00:00.000Z");
const forbiddenCdn = async () => {
  throw Error("POLL_MEDIA_URL_PORT_CALLED_UNEXPECTEDLY");
};
const service = createFeedPolls({
  db,
  enabled: () => true,
  now: () => new Date(now),
  storage: { signCdn: forbiddenCdn },
});
let owner = "";
let reader = "";
let other = "";
let postId = "";
let pollId = "";
let optionIds: string[] = [];
const actors = () => [owner, reader, other];
async function guard() {
  const rows = await db.$queryRaw<
    {
      correctDb: boolean;
      correctVersion: boolean;
      correctData: boolean;
      socketOnly: boolean;
      correctSocket: boolean;
      peers: bigint;
    }[]
  >`
    SELECT current_database() = ${expectedDb} AS "correctDb",
      current_setting('server_version_num') = '180004' AS "correctVersion",
      current_setting('data_directory') = ${expectedData} AS "correctData",
      current_setting('listen_addresses') = '' AS "socketOnly",
      current_setting('unix_socket_directories') = ${expectedSocket} AS "correctSocket",
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend'
       AND pid <> pg_backend_pid()
       AND (application_name IS DISTINCT FROM 'ag1_poll_tx_20261024'
         OR datname IS DISTINCT FROM ${expectedDb})) AS peers
  `;
  expect(rows).toEqual([
    {
      correctDb: true,
      correctVersion: true,
      correctData: true,
      socketOnly: true,
      correctSocket: true,
      peers: 0n,
    },
  ]);
}
async function totals() {
  const votes = await db.feedPollVote.findMany({
    where: { pollId },
    include: { selections: true },
    orderBy: { userId: "asc" },
  });
  const counts = await db.feedPollVoteSelection.groupBy({
    by: ["optionId"],
    where: { pollId },
    _count: { _all: true },
  });
  const perOption = new Map(counts.map((c) => [c.optionId, c._count._all]));
  const rows = votes.map((v) => ({
    userId: v.userId,
    optionIds: v.selections.map((s) => s.optionId).sort(),
  }));
  const selectionCount = await db.feedPollVoteSelection.count({ where: { pollId } });
  expect(selectionCount).toBe(rows.reduce((n, r) => n + r.optionIds.length, 0));
  expect([...perOption.values()].reduce((n, c) => n + c, 0)).toBe(selectionCount);
  expect(rows.every((row) => row.optionIds.length >= 1)).toBe(true);
  expect(rows.every((row) => new Set(row.optionIds).size === row.optionIds.length)).toBe(true);
  return { rows, perOption, selectionCount };
}
const choices = async (actorId: string) =>
  (
    await db.feedPollVoteSelection.findMany({
      where: { pollId, userId: actorId },
      orderBy: { optionId: "asc" },
    })
  ).map((r) => r.optionId);
const checkError = async (promise: Promise<unknown>, code: string, status: number) =>
  expect(promise).rejects.toMatchObject({ code, status });

beforeAll(async () => {
  await guard();
  const rows = await db.$queryRaw<
    { users: bigint; posts: bigint; polls: bigint; votes: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."FeedPost") AS posts,
      (SELECT count(*) FROM public."FeedPoll") AS polls,
      (SELECT count(*) FROM public."FeedPollVote") AS votes,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(rows).toEqual([{ users: 0n, posts: 0n, polls: 0n, votes: 0n, ledger: 0n }]);
}, 30000);

beforeEach(async () => {
  await guard();
  [owner, reader, other] = [randomUUID(), randomUUID(), randomUUID()];
  postId = randomUUID();
  pollId = randomUUID();
  optionIds = [randomUUID(), randomUUID(), randomUUID()];
  await db.user.createMany({
    data: actors().map((id) => ({ id, username: `ag1_poll_${id}`, password: "fictional-only" })),
  });
  await db.feedPost.create({
    data: { id: postId, authorId: owner, clientRequestId: randomUUID() },
  });
  const revision = await db.feedPostRevision.create({
    data: {
      id: randomUUID(),
      postId,
      revisionNumber: 1,
      status: "ready",
      text: "Fictional poll",
      clientRequestId: randomUUID(),
    },
  });
  await db.feedPost.update({
    where: { id: postId },
    data: {
      status: "published",
      activeRevisionId: revision.id,
      publishedAt: now,
      version: 1,
    },
  });
  await db.feedPoll.create({
    data: {
      id: pollId,
      postId,
      question: "Ordinary fictional poll",
      allowMultiple: false,
      isQuiz: false,
    },
  });
  await db.feedPollOption.createMany({
    data: optionIds.map((id, position) => ({
      id,
      pollId,
      position,
      text: `Answer ${position + 1}`,
      isCorrect: position === 0,
    })),
  });
  for (const [actorId, selected] of [
    [reader, optionIds[0]!],
    [other, optionIds[2]!],
  ] as const) {
    await db.feedPollVote.create({ data: { pollId, userId: actorId } });
    await db.feedPollVoteSelection.create({
      data: { pollId, userId: actorId, optionId: selected },
    });
  }
}, 30000);

afterEach(async () => {
  await guard();
  if (owner) {
    // Only the exact fictional actors; post/poll/revision/votes cascade from their FK.
    await db.user.deleteMany({ where: { id: { in: actors() } } });
  }
  const result = await db.$queryRaw<
    { users: bigint; posts: bigint; polls: bigint; votes: bigint; choices: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."FeedPost") AS posts,
      (SELECT count(*) FROM public."FeedPoll") AS polls,
      (SELECT count(*) FROM public."FeedPollVote") AS votes,
      (SELECT count(*) FROM public."FeedPollVoteSelection") AS choices
  `;
  expect(result).toEqual([{ users: 0n, posts: 0n, polls: 0n, votes: 0n, choices: 0n }]);
}, 30000);
afterAll(async () => {
  await db.$disconnect();
}, 30000);

describe("SOC041 ordinary poll mutation REAL Prisma and owned PG18", () => {
  it("single choice replacement is actor-scoped, same PUT idempotent and render counts agree", async () => {
    const first = await service.changeVote(reader, postId, { optionIds: [optionIds[1]!] });
    expect(first.myOptionIds).toEqual([optionIds[1]]);
    expect(first.totalVotes).toBe(2);
    expect(await choices(reader)).toEqual([optionIds[1]]);
    expect(await choices(other)).toEqual([optionIds[2]]);
    const voteBefore = await db.feedPollVote.findUniqueOrThrow({
      where: { pollId_userId: { pollId, userId: reader } },
    });
    const again = await service.changeVote(reader, postId, { optionIds: [optionIds[1]!] });
    expect(again.myOptionIds).toEqual([optionIds[1]]);
    const voteAfter = await db.feedPollVote.findUniqueOrThrow({
      where: { pollId_userId: { pollId, userId: reader } },
    });
    expect(voteAfter.updatedAt.getTime()).toBe(voteBefore.updatedAt.getTime());
    const state = await totals();
    expect(state.rows).toHaveLength(2);
    expect(state.perOption.get(optionIds[1]!)).toBe(1);
    expect(state.perOption.get(optionIds[2]!)).toBe(1);
  });
  it("multi-choice changes selections atomically and repeats same unordered intent", async () => {
    await db.feedPoll.update({ where: { id: pollId }, data: { allowMultiple: true } });
    const r = await service.changeVote(reader, postId, {
      optionIds: [optionIds[2]!, optionIds[1]!],
    });
    expect(new Set(r.myOptionIds)).toEqual(new Set([optionIds[1], optionIds[2]]));
    expect(await choices(reader)).toEqual([optionIds[1], optionIds[2]].sort());
    await service.changeVote(reader, postId, { optionIds: [optionIds[1]!, optionIds[2]!] });
    expect(await choices(other)).toEqual([optionIds[2]]);
    const state = await totals();
    expect(state.selectionCount).toBe(3);
    expect(state.perOption.get(optionIds[2]!)).toBe(2);
  });
  it("cancel is actor-scoped, twice idempotent, actor vote/choices are removed", async () => {
    const canceled = await service.cancelVote(reader, postId);
    expect(canceled.myOptionIds).toEqual([]);
    expect(await choices(reader)).toEqual([]);
    expect(await service.cancelVote(reader, postId)).toMatchObject({ myOptionIds: [] });
    expect(
      await db.feedPollVote.findUnique({ where: { pollId_userId: { pollId, userId: reader } } }),
    ).toBeNull();
    expect((await totals()).rows).toEqual([{ userId: other, optionIds: [optionIds[2]] }]);
  });
  it("missing own vote cannot be changed and has 409 without touching other actor", async () => {
    await service.cancelVote(reader, postId);
    await checkError(
      service.changeVote(reader, postId, { optionIds: [optionIds[1]!] }),
      "VOTE_NOT_FOUND",
      409,
    );
    expect((await totals()).rows).toEqual([{ userId: other, optionIds: [optionIds[2]] }]);
  });
  it("quiz refuses change and cancellation even with existing vote", async () => {
    await db.feedPoll.update({ where: { id: pollId }, data: { isQuiz: true } });
    await checkError(
      service.changeVote(reader, postId, { optionIds: [optionIds[1]!] }),
      "QUIZ_VOTE_LOCKED",
      409,
    );
    await checkError(service.cancelVote(reader, postId), "QUIZ_VOTE_LOCKED", 409);
    expect(await choices(reader)).toEqual([optionIds[0]]);
    expect((await totals()).selectionCount).toBe(2);
  });
  it("closed poll refuses change/cancel without mutation", async () => {
    await db.feedPoll.update({
      where: { id: pollId },
      data: { endDate: new Date(now.getTime() - 1000) },
    });
    await checkError(
      service.changeVote(reader, postId, { optionIds: [optionIds[1]!] }),
      "POLL_CLOSED",
      409,
    );
    await checkError(service.cancelVote(reader, postId), "POLL_CLOSED", 409);
    expect(await choices(reader)).toEqual([optionIds[0]]);
  });
  it.each(["hidden", "deleted", "draft"] as const)(
    "nonvisible post %s refuses both mutations",
    async (mode) => {
      await db.feedPost.update({
        where: { id: postId },
        data:
          mode === "hidden"
            ? { moderationState: "hidden" }
            : mode === "deleted"
              ? { deletedAt: now, status: "deleted" }
              : { status: "draft" },
      });
      await checkError(
        service.changeVote(reader, postId, { optionIds: [optionIds[1]!] }),
        "NOT_FOUND",
        404,
      );
      await checkError(service.cancelVote(reader, postId), "NOT_FOUND", 404);
      expect(await choices(reader)).toEqual([optionIds[0]]);
    },
  );
  it("invalid poll option or multiple selection single choice rejects and rolls back", async () => {
    await checkError(
      service.changeVote(reader, postId, { optionIds: [randomUUID()] }),
      "VALIDATION_ERROR",
      400,
    );
    await checkError(
      service.changeVote(reader, postId, { optionIds: [optionIds[1]!, optionIds[2]!] }),
      "VALIDATION_ERROR",
      400,
    );
    await checkError(
      service.changeVote(reader, postId, { optionIds: [optionIds[1]!, optionIds[1]!] }),
      "VALIDATION_ERROR",
      400,
    );
    expect(await choices(reader)).toEqual([optionIds[0]]);
    expect((await totals()).selectionCount).toBe(2);
  });
  it("two simultaneous changes serialize without partial choices or duplicate vote", async () => {
    await db.feedPoll.update({ where: { id: pollId }, data: { allowMultiple: true } });
    const results = await Promise.allSettled([
      service.changeVote(reader, postId, { optionIds: [optionIds[0]!, optionIds[1]!] }),
      service.changeVote(reader, postId, { optionIds: [optionIds[1]!, optionIds[2]!] }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const final = await choices(reader);
    expect(
      [
        [optionIds[0], optionIds[1]],
        [optionIds[1], optionIds[2]],
      ].map((a) => a.sort()),
    ).toContainEqual(final);
    expect((await totals()).rows).toHaveLength(2);
  });
  it("concurrent change and cancel commit one consistent winner without orphan selections", async () => {
    const results = await Promise.allSettled([
      service.changeVote(reader, postId, { optionIds: [optionIds[1]!] }),
      service.cancelVote(reader, postId),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect([[], [optionIds[1]]]).toContainEqual(await choices(reader));
    expect(await choices(other)).toEqual([optionIds[2]]);
    const state = await totals();
    expect(state.rows).toHaveLength((await choices(reader)).length ? 2 : 1);
  });
});
