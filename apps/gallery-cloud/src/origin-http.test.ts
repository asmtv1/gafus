import { describe, expect, it, vi } from "vitest";
import { createOriginHttpServer } from "./origin-http.js";

describe("Container origin HTTP transport", () => {
  it("forwards raw path, signature query, headers and binary content without relaxing cache policy", async () => {
    const handle = vi.fn(async () => ({
      statusCode: 200,
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" },
      body: Buffer.from([0, 255, 7]).toString("base64"),
      isBase64Encoded: true,
    }));
    const server = createOriginHttpServer(handle);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("NO_PORT");
      const base = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${base}/albums/u/a/photos/p/full.webp?md5=abc&expires=123`, {
        headers: { "X-Gallery-Origin-Secret": "test" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255, 7]);
      expect(handle).toHaveBeenCalledWith(
        expect.objectContaining({
          httpMethod: "GET",
          path: "/albums/u/a/photos/p/full.webp",
          queryStringParameters: { md5: "abc", expires: "123" },
        }),
      );
      const denied = await fetch(`${base}/albums/u/a/photos/p/full.webp`, { method: "POST" });
      expect(denied.status).toBe(405);
      expect(handle).toHaveBeenCalledTimes(1);
      const head = await fetch(`${base}/albums/u/a/photos/p/full.webp`, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
