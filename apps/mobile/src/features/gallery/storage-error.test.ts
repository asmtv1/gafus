import { describe, expect, it } from "vitest";
import { galleryUploadRejected } from "./storage-error";

describe("safe gallery storage POST diagnostics", () => {
  it("shows the HTTP status and S3 code but not sensitive XML data", async () => {
    const response = {
      status: 403,
      text: async () => "<Error><Code>SignatureDoesNotMatch</Code><StringToSign>SECRET_VALUE</StringToSign><Message>signed details</Message></Error>",
    };
    const result = await galleryUploadRejected(response);
    expect(result.message).toContain("HTTP 403, SignatureDoesNotMatch");
    expect(result.message).not.toContain("SECRET_VALUE");
    expect(result.message).not.toContain("signed details");
  });

  it("does not display arbitrary response contents", async () => {
    const response = { status: 400, text: async () => "<html>private URL: https://example.test/?signature=abc</html>" };
    const result = await galleryUploadRejected(response);
    expect(result.message).toContain("HTTP 400");
    expect(result.message).not.toContain("signature=abc");
  });

  it("preserves status if reading the error body fails", async () => {
    const response = { status: 503, text: async (): Promise<string> => { throw new Error("bad response"); } };
    const result = await galleryUploadRejected(response);
    expect(result.message).toContain("HTTP 503");
  });
});
