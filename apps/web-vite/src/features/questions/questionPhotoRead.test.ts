// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchQuestionPhotoUrls } from "./questionPhotoRead";
import { isolatedNonprodBrowserS3Url } from "../../shared/api/client";

const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data,
}), { status });
afterEach(() => vi.unstubAllGlobals());

describe("authorized on-demand question media", () => {
  it("only returns explicitly requested photos from question detail, never caches URLs", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({
      id: "question-1",
      photos: [
        { id: "p1", url: "https://storage.example/path?signature=secret" },
        { id: "p2", url: "https://storage.example/other" },
      ],
      answers: [],
    }));
    vi.stubGlobal("fetch", fake);
    expect(await fetchQuestionPhotoUrls({ questionId: "question-1", photoIds: ["p2"] }))
      .toEqual(["https://storage.example/other"]);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/question-1?page=1");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "GET", credentials: "include", cache: "no-store",
    });
  });

  it("matches a specific root answer on its actual detail page", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({
      answers: [{ id: "answer-9", photos: [{ id: "p1",
        url: "https://storage.example/answer?token=short-lived" }] }],
    }));
    vi.stubGlobal("fetch", fake);
    expect(await fetchQuestionPhotoUrls({
      questionId: "question-1", answerId: "answer-9",
      page: 3, photoIds: ["p1"],
    })).toEqual(["https://storage.example/answer?token=short-lived"]);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/question-1?page=3");
  });

  it("loads nested-answer photos with exact root ID and page", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({
      items: [{ id: "child-3", photos: [{ id: "p2",
        url: "https://storage.example/child-photo" }] }],
    }));
    vi.stubGlobal("fetch", fake);
    expect(await fetchQuestionPhotoUrls({
      questionId: "question-1", rootId: "root-1", answerId: "child-3",
      page: 2, photoIds: ["p2"],
    })).toEqual(["https://storage.example/child-photo"]);
    expect(fake.mock.calls[0][0])
      .toBe("/api/v1/questions/answers/root-1/replies?page=2");
  });

  it("selects actual 360/720 WebP variants and allows pending without broken URLs",async()=>{
    const small="https://cdn.example/one/s.webp?sig=1";
    const medium="https://cdn.example/one/m.webp?sig=1";
    const fake=vi.fn().mockResolvedValueOnce(envelope({
      photos:[{id:"p1",url:medium,smallUrl:small,
        smallWidth:360,smallHeight:576,width:720,height:1152}],
    })).mockResolvedValueOnce(envelope({
      photos:[{id:"p1",url:medium,smallUrl:small,
        smallWidth:360,smallHeight:576,width:720,height:1152}],
    })).mockResolvedValueOnce(envelope({
      photos:[{id:"p1",url:"",status:"PROCESSING"}],
    }));
    vi.stubGlobal("fetch",fake);
    const where={questionId:"question-1",photoIds:["p1"]};
    expect(await fetchQuestionPhotoUrls(where)).toEqual([small]);
    expect(await fetchQuestionPhotoUrls(where,undefined,"medium")).toEqual([medium]);
    expect(await fetchQuestionPhotoUrls(where)).toEqual([""]);
  });
  it("only approves exact signed Questions localhost S3 GET in isolated Vite dev", () => {
    const signed = "http://127.0.0.1:9000/gafus-refactor-questions-test/" +
      "questions/uploads/questions/owner/photo.png?X-Amz-Signature=synthetic-test" +
      "&X-Amz-Expires=300";
    const allowed = (url: string, origin = "http://127.0.0.1:5173") =>
      isolatedNonprodBrowserS3Url(url, "questions", "signed-get", origin);
    expect(allowed(signed)).toBe(true);
    expect(allowed(signed, "https://gafus.ru")).toBe(false);
    expect(allowed(signed.replace("127.0.0.1", "localhost"))).toBe(false);
    expect(allowed(signed.replace("questions-test", "feed-test"))).toBe(false);
    expect(allowed(signed.replace("X-Amz-Signature=synthetic-test", "notSigned=1")))
      .toBe(false);
    expect(allowed(signed.replace("http:", "https:"))).toBe(false);
    expect(allowed("http://attacker.example/" + signed.slice(7))).toBe(false);
  });

  it.each(["fetch", "json"])(
    "stops an unanswered %s photo detail read after 12 seconds and aborts the request",
    async (phase) => {
      vi.useFakeTimers();
      try {
        const never = () => new Promise<never>(() => undefined);
        const fake = vi.fn().mockImplementation(() => phase === "fetch"
          ? never()
          : Promise.resolve({ json: never }));
        vi.stubGlobal("fetch", fake);
        const request = fetchQuestionPhotoUrls({
          questionId: "question-1", photoIds: ["p1"],
        });
        // Attach the rejection assertion before advancing virtual time.
        const assertion = expect(request).rejects.toThrow("Превышено время ожидания фотографий");
        await vi.advanceTimersByTimeAsync(12_000);
        await assertion;
        expect(fake).toHaveBeenCalledTimes(1);
        expect(fake.mock.calls[0][1].signal.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("rejects unsafe paths and cross-origin plaintext HTTP before fetch", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({
      photos: [{ id: "p1", url: "http://attacker.example/private" }],
    }));
    vi.stubGlobal("fetch", fake);
    await expect(fetchQuestionPhotoUrls({
      questionId: "../admin", photoIds: ["p1"],
    })).rejects.toThrow("Некорректный");
    expect(fake).not.toHaveBeenCalled();
    await expect(fetchQuestionPhotoUrls({
      questionId: "question-1", photoIds: ["p1"],
    })).rejects.toThrow("недопустимый адрес");
  });

  it("rejects missing photo records and server permission failures", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(envelope(null, 403))
      .mockResolvedValueOnce(envelope({ photos: [] }));
    vi.stubGlobal("fetch", fake);
    await expect(fetchQuestionPhotoUrls({
      questionId: "question-1", photoIds: ["p1"],
    })).rejects.toMatchObject({ status: 403 });
    await expect(fetchQuestionPhotoUrls({
      questionId: "question-1", photoIds: ["p1"],
    })).rejects.toThrow("недоступна");
  });
});
