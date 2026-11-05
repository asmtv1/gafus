import { afterEach, describe, expect, it, vi } from "vitest";
import { Chat2S3UploadError, postChat2FileToS3 } from "./s3Upload";

const asset = { uri: "file:///actual-photo.jpg", name: "photo.jpg", mime: "image/jpeg" };
const fields = { key: "chat2/safe-object", "Content-Type": "image/jpeg" };
const ok = { ok: true, status: 204 };
function failure(status: number, xml: string) {
  return { ok: false, status, text: async () => xml };
}
const guard = () => true;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Chat2 native direct S3 POST", () => {
  it("uploads to the scoped signed URL, keeping file part last", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok);
    vi.stubGlobal("fetch", fetcher);
    await postChat2FileToS3("https://s3.cloud.ru/chat2-bucket", fields, asset, guard);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, options] = fetcher.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({
      method: "POST", redirect: "error", body: expect.any(FormData),
    }));
    const data = options.body as unknown as {
      entries: () => IterableIterator<[string, unknown]>;
    };
    expect(Array.from(data.entries()).map(([key]) => key))
      .toEqual(["key", "Content-Type", "file"]);
  });

  it("retries transient 503 with a new multipart body, without a new reservation", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(failure(503, "<Error><Code>SlowDown</Code></Error>"))
      .mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", fetcher);
    await postChat2FileToS3("https://s3.cloud.ru/chat2-bucket", fields, asset, guard);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].body).not.toBe(fetcher.mock.calls[1][1].body);
  });

  it("does not retry a signed-policy 403 and never reveals S3 secrets", async () => {
    const fetcher = vi.fn().mockResolvedValue(failure(403,
      "<Error><Code>SignatureDoesNotMatch</Code><StringToSign>SECRET</StringToSign></Error>"));
    vi.stubGlobal("fetch", fetcher);
    await expect(postChat2FileToS3("https://s3.cloud.ru/chat2-bucket", fields, asset, guard))
      .rejects.toMatchObject({
        status: 403,
        s3Code: "SignatureDoesNotMatch",
        message: expect.not.stringContaining("SECRET"),
      });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("surfaces S3 file-size policy rejection without retry", async () => {
    const fetcher = vi.fn().mockResolvedValue(failure(400,
      "<Error><Code>EntityTooSmall</Code><Message>private details</Message></Error>"));
    vi.stubGlobal("fetch", fetcher);
    await expect(postChat2FileToS3("https://s3.cloud.ru/chat2-bucket", fields, asset, guard))
      .rejects.toMatchObject({ status: 400, s3Code: "EntityTooSmall" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops retrying and shows a sanitized status after three 5xx failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(failure(503, "<Error><Code>ServiceUnavailable</Code></Error>"));
    vi.stubGlobal("fetch", fetcher);
    await expect(postChat2FileToS3("https://s3.cloud.ru/chat2-bucket", fields, asset, guard))
      .rejects.toBeInstanceOf(Chat2S3UploadError);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retries an interrupted connection, but never an invalid session", async () => {
    let active = true;
    const fetcher = vi.fn().mockImplementationOnce(async () => {
      active = false;
      throw new TypeError("Network request failed");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(postChat2FileToS3("https://s3.cloud.ru/chat2-bucket", fields, asset, () => active))
      .rejects.toThrow("Сессия изменилась");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
