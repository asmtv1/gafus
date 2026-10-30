import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTextDraftPoll, getExistingDraftPoll,
} from "./momentDraftPollApi";

const poll = {
  question: "Как помочь собаке?", allowMultiple: false, isQuiz: false,
  isAnonymous: false, hideResults: false, shuffleOptions: false,
  explanation: null, endDate: null,
  options: [
    { text: "Постепенно", isCorrect: false },
    { text: "С поддержкой", isCorrect: false },
  ],
};
const serverPoll = {
  id: "poll-1", postId: "post-1", ...poll, canEdit: true,
  closed: false, totalVotes: null, myOptionIds: [],
  serverNow: "2026-10-16T12:00:00.000Z",
  options: [
    { id: "opt-1", position: 0, text: "Постепенно", votes: null,
      imageUrl: "https://private.example/signed?secret", imageMediaId: "photo-1" },
    { id: "opt-2", position: 1, text: "С поддержкой", votes: null },
  ],
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200, data, error: "Core rejected",
  }), { status });
}
afterEach(() => vi.unstubAllGlobals());

describe("draft poll shared Core creation", () => {
  it("GET 200/null means no saved draft poll; authenticated PUT then fresh read", async () => {
    let created = false;
    const fake = vi.fn((path: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "PUT"
        ? (created = true, response(serverPoll))
        : created ? response(serverPoll) : response(null)));
    vi.stubGlobal("fetch", fake);
    expect((await getExistingDraftPoll("post-1"))).toBeNull();
    expect(fake.mock.calls[0]?.[0]).toBe("/api/v1/feed/posts/post-1/draft-poll");
    const saved = await createTextDraftPoll({
      postId: "post-1", expectedVersion: 1, poll,
    });
    expect(saved.id).toBe("poll-1");
    expect(saved.options).toHaveLength(2);
    expect(JSON.stringify(saved)).not.toContain("private.example");
    const write = fake.mock.calls.find(call => call[1]?.method === "PUT");
    expect(write?.[0]).toBe("/api/v1/feed/posts/post-1/poll");
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
      ...poll, expectedVersion: 1,
    });
    expect(write?.[1]).toMatchObject({
      method: "PUT", credentials: "include", cache: "no-store",
    });
    expect(fake.mock.calls).toHaveLength(4);
  });

  it("does not overwrite pre-existing poll after uncertain response", async () => {
    const fake = vi.fn().mockResolvedValue(response(serverPoll));
    vi.stubGlobal("fetch", fake);
    await expect(createTextDraftPoll({
      postId: "post-1", expectedVersion: 1, poll,
    })).rejects.toThrow("уже есть опрос");
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls[0][1].method).toBe("GET");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1/draft-poll");
  });

  it("rejects invalid poll and malicious image attachments before network", async () => {
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    await expect(createTextDraftPoll({
      postId: "../admin", expectedVersion: 1, poll,
    })).rejects.toThrow("Некорректные");
    await expect(createTextDraftPoll({
      postId: "post-1", expectedVersion: 0, poll,
    })).rejects.toThrow("Некорректные");
    await expect(createTextDraftPoll({
      postId: "post-1", expectedVersion: 1,
      poll: { ...poll, options: [poll.options[0]!] },
    })).rejects.toThrow("от 2 до 10");
    await expect(createTextDraftPoll({
      postId: "post-1", expectedVersion: 1,
      poll: { ...poll, options: [{ ...poll.options[0], imageMediaId: "external" },
        poll.options[1]!] },
    })).rejects.toThrow("Некорректные");
    expect(fake).not.toHaveBeenCalled();
  });

  it("does not mistake a missing or unauthorized draft for an absent poll", async () => {
    const fake = vi.fn().mockResolvedValue(response(null, 404));
    vi.stubGlobal("fetch", fake);
    await expect(getExistingDraftPoll("post-1"))
      .rejects.toMatchObject({ status: 404 });
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls[0]?.[0]).toBe("/api/v1/feed/posts/post-1/draft-poll");
  });

  it("denied GET/PUT never pretends a poll was saved", async () => {
    const fake = vi.fn().mockResolvedValue(response(null, 503));
    vi.stubGlobal("fetch", fake);
    await expect(getExistingDraftPoll("post-1"))
      .rejects.toMatchObject({ status: 503 });
    await expect(createTextDraftPoll({
      postId: "post-1", expectedVersion: 1, poll,
    })).rejects.toMatchObject({ status: 503 });
  });
});
