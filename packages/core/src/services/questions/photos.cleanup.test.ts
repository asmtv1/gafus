import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  remove: vi.fn(),
  deletePhoto: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
  purge: vi.fn(),
}));
vi.mock("@gafus/queues", () => ({ enqueueQuestionsProcessing: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    questionPhoto: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  deleteFileFromCDN: mocks.remove,
  parsePendingQuestionLocation: () => null,
  parsePublicQuestionLocation: (value: string) => value.startsWith("cloudru:questions-public:")
    ? value.slice("cloudru:questions-public:".length) : null,
  parsePrivateMediaLocation: () => null,
  publicQuestionsEnabled: () => false,
  questionCloudJobEnabled: () => false,
  privateMediaEnabled: () => false,
}));
vi.mock("../mediaDelivery/purgeQueue", () => ({
  enqueueDeletedMediaPurge: mocks.purge,
}));
vi.mock("./service", () => ({
  questionActor: vi.fn().mockResolvedValue({ id: "owner" }),
}));
import { cleanupUnusedQuestionPhotos } from "./photos";

const id = "photo-id";
const ownerId = "owner";
const location = "cloudru:questions-public:questions/uploads/questions/owner/image.jpg";
const attached = { id, ownerId, questionId: "question-id", answerId: null };
const tx = {
  $queryRaw: mocks.lock,
  questionPhoto: { findFirst: mocks.findFirst, delete: mocks.deletePhoto },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.findFirst.mockResolvedValue({ id, url: location, storagePath: location });
  mocks.remove.mockResolvedValue(undefined);
  mocks.purge.mockResolvedValue(undefined);
  mocks.deletePhoto.mockResolvedValue({});
  mocks.lock.mockResolvedValue([{id}]);
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
    callback(tx));
});

describe("question photo tombstone cleanup", () => {
  it("scans abandoned uploads and all deleted question/answer relations, not live photos", async () => {
    await cleanupUnusedQuestionPhotos();
    expect(mocks.findMany).toHaveBeenCalledOnce();
    const params = mocks.findMany.mock.calls[0]![0];
    const [abandoned, removed] = params.where.OR;
    expect(abandoned).toMatchObject({questionId: null, answerId: null});
    expect(abandoned.createdAt.lt).toBeInstanceOf(Date);
    expect(removed.OR).toEqual([
      { question: { is: { deletedAt: { not: null } } } },
      { answer: { is: { deletedAt: { not: null } } } },
      { answer: { is: { question: { is: { deletedAt: { not: null } } } } } },
    ]);
    expect(params.take).toBe(100);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("requires a fresh deleted-parent predicate under owner and photo locks", async () => {
    mocks.findMany.mockResolvedValue([attached]);
    mocks.findFirst.mockResolvedValue(null); // parent revived or relation changed
    await cleanupUnusedQuestionPhotos();
    expect(mocks.lock).toHaveBeenCalledTimes(2);
    const params = mocks.findFirst.mock.calls[0]![0];
    expect(params.where.id).toBe(id);
    expect(params.where.ownerId).toBe(ownerId);
    expect(params.where.OR).toHaveLength(3);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
  });

  it("deletes an attached deleted-question image then enqueues exact CDN purge before removing DB row", async () => {
    const events: string[] = [];
    mocks.findMany.mockResolvedValue([attached]);
    mocks.remove.mockImplementation(async () => { events.push("S3"); });
    mocks.purge.mockImplementation(async () => { events.push("PURGE"); });
    mocks.deletePhoto.mockImplementation(async () => { events.push("DB"); });
    await cleanupUnusedQuestionPhotos();
    expect(events).toEqual(["S3", "PURGE", "DB"]);
    expect(mocks.remove).toHaveBeenCalledWith(location);
    expect(mocks.purge).toHaveBeenCalledWith(
      tx, "questions", id, ["questions/uploads/questions/owner/image.jpg"],
    );
    expect(mocks.deletePhoto).toHaveBeenCalledWith({where: {id}});
  });

  it("does not lose the durable deletion target when S3 or the CDN queue fails", async () => {
    mocks.findMany.mockResolvedValue([attached]);
    mocks.remove.mockRejectedValueOnce(new Error("S3_TIMEOUT"));
    await cleanupUnusedQuestionPhotos(); // scheduler retries later; row retained
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();

    mocks.purge.mockRejectedValueOnce(new Error("PURGE_QUEUE_UNAVAILABLE"));
    await cleanupUnusedQuestionPhotos();
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledTimes(2);

    await cleanupUnusedQuestionPhotos();
    expect(mocks.deletePhoto).toHaveBeenCalledOnce();
  });

  it("prevents overlapping workers from erasing the same photo", async () => {
    mocks.findMany.mockResolvedValue([attached]);
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    mocks.remove.mockImplementation(() => wait);
    const first = cleanupUnusedQuestionPhotos();
    const second = cleanupUnusedQuestionPhotos();
    await second;
    expect(mocks.transaction).toHaveBeenCalledOnce();
    release();
    await first;
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.deletePhoto).toHaveBeenCalledOnce();
  });
});
