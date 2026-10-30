// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discardUnusedQuestionPhoto, uploadQuestionPhoto, validateQuestionFiles,
} from "./questionMedia";

function photo(data: number[], name = "dog.jpg", mime = "image/jpeg") {
  return new File([new Uint8Array(data)], name, { type: mime });
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200 || status === 201, data, error: "Core reports a storage error",
  }), { status });
}
afterEach(() => vi.unstubAllGlobals());

// Direct S3 form POST is a separate unauthenticated transport, not multipart
// content sent through Hono. Only the Hono reservation/confirm needs cookies.
function fakeDirectStorageUpload() {
  const calls: { method: string; url: string; credentials: boolean; form?: FormData }[] = [];
  class FakeXHR {
    status = 204;
    upload: { onprogress?: ((event: ProgressEvent) => void) | null } = {};
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    withCredentials = false;
    private call?: (typeof calls)[number];
    open(method: string, url: string) {
      this.call = { method, url, credentials: this.withCredentials };
      calls.push(this.call);
    }
    send(body: FormData) {
      if (this.call) { this.call.credentials = this.withCredentials; this.call.form = body; }
      queueMicrotask(() => this.onload?.());
    }
    abort() { this.onabort?.(); }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  return calls;
}

describe("Question Web multipart media transport", () => {
  it("reserves with authenticated Hono JSON, uploads directly to S3, confirms before publishing", async () => {
    const file = photo([255, 216, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const direct = fakeDirectStorageUpload();
    const fake = vi.fn()
      .mockResolvedValueOnce(response({id:"photo-1",upload:{method:"POST",
        url:"https://isolated-s3.example/questions/test",fields:{key:"incoming/test"}}},201))
      .mockResolvedValueOnce(response({id:"photo-1",status:"QUEUED"}));
    vi.stubGlobal("fetch", fake);
    const progress: number[] = [];
    expect(await uploadQuestionPhoto(file, percent=>progress.push(percent))).toBe("photo-1");
    expect(fake).toHaveBeenCalledTimes(2);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/photos/reservations");
    expect(fake.mock.calls[0][1]).toMatchObject({method:"POST",credentials:"include",
      cache:"no-store",headers:{"Content-Type":"application/json",Accept:"application/json"}});
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({mime:"image/jpeg",bytes:12});
    expect(fake.mock.calls[1][0]).toBe("/api/v1/questions/photos/photo-1/confirm");
    expect(fake.mock.calls[1][1]).toMatchObject({method:"POST",credentials:"include",cache:"no-store"});
    expect(direct).toHaveLength(1);
    expect(direct[0]).toMatchObject({method:"POST",url:"https://isolated-s3.example/questions/test",credentials:false});
    expect(direct[0]?.form?.get("key")).toBe("incoming/test");
    expect((direct[0]?.form?.get("file") as File).name).toBe("dog.jpg");
    expect((direct[0]?.form?.get("file") as File).size).toBe(12);
    expect(progress).toEqual([100]);
    expect(fake.mock.calls.map(([path])=>path)).not.toContain("/api/v1/questions/photos");
  });

  it("validates formats, zero-byte content, size, and five-file quota before fetch", async () => {
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    const valid = photo([1, 2, 3]);
    expect(() => validateQuestionFiles([valid], 4)).not.toThrow();
    expect(() => validateQuestionFiles([valid, valid], 4)).toThrow("не более 5");
    expect(() => validateQuestionFiles([], 0)).toThrow("не более 5");
    expect(() => validateQuestionFiles([photo([1], "bad.gif", "image/gif")], 0))
      .toThrow("JPG");
    expect(() => validateQuestionFiles([photo([], "blank.png", "image/png")], 0))
      .toThrow("10 МБ");
    expect(() => validateQuestionFiles([
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg", {
        type: "image/jpeg",
      }),
    ], 0)).toThrow("10 МБ");
    expect(fake).not.toHaveBeenCalled();
  });

  it("does not return an S3 URL or accept an invalid reservation photo ID", async () => {
    const file = photo([255, 216]);
    const direct = fakeDirectStorageUpload();
    const fake = vi.fn()
      .mockResolvedValueOnce(response({id:"../escape",upload:{method:"POST",
        url:"https://isolated-s3.example/private",fields:{key:"secret"}}},201))
      .mockResolvedValueOnce(response({id:"ok-1",upload:{method:"POST",
        url:"https://isolated-s3.example/questions/test",fields:{key:"ok"}}},201))
      .mockResolvedValueOnce(response({id:"ok-1",status:"PROCESSING"}));
    vi.stubGlobal("fetch",fake);
    await expect(uploadQuestionPhoto(file)).rejects.toThrow("Некорректное подтверждение");
    expect(direct).toHaveLength(0);
    await expect(uploadQuestionPhoto(file)).resolves.toBe("ok-1");
    expect(direct).toHaveLength(1);
    expect(fake.mock.calls[2][0]).toBe("/api/v1/questions/photos/ok-1/confirm");
  });

  it("only discards unused photos with verified server acknowledgement", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(response({ id: "different" }))
      .mockResolvedValueOnce(response({ id: "photo-1" }));
    vi.stubGlobal("fetch", fake);
    await expect(discardUnusedQuestionPhoto("../secret")).rejects.toThrow("Некорректная");
    expect(fake).not.toHaveBeenCalled();
    await expect(discardUnusedQuestionPhoto("photo-1")).rejects.toThrow("не подтвердил");
    await expect(discardUnusedQuestionPhoto("photo-1")).resolves.toBeUndefined();
    const [path, options] = fake.mock.calls[1] as [string, RequestInit];
    expect(path).toBe("/api/v1/questions/photos/photo-1");
    expect(options).toMatchObject({ method: "DELETE", cache: "no-store",
      credentials: "include" });
  });

  it("server failures propagate and never look like uploaded photos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(null, 413)));
    await expect(uploadQuestionPhoto(photo([1, 2, 3])))
      .rejects.toMatchObject({ status: 413 });
  });
});
