import { gzipSync } from "node:zlib";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { accept } = vi.hoisted(() => ({ accept: vi.fn() }));

vi.mock("@gafus/core/services/cynologistChat", () => ({ acceptChatWebhook: accept }));
vi.mock("@gafus/chat-server", () => ({
  dispatchChatRequest: vi.fn(),
  chatHttpError: (e: unknown) => ({
    body: { success: false },
    status: (e as { status?: number }).status ?? 500,
  }),
}));

import { streamChatWebhookRoutes } from "./cynologist-chat";

const app = new Hono();
app.route("/api/v1/stream-chat/webhook", streamChatWebhookRoutes);

beforeEach(() => {
  vi.resetAllMocks();
  accept.mockResolvedValue(undefined);
});

describe("Stream Chat webhook byte preservation", () => {
  it("forwards gzip bytes and signature without UTF-8 text corruption", async () => {
    const raw = gzipSync(Buffer.from(JSON.stringify({ type: "message.new", test: "🐶" })));
    const response = await app.request(new Request("http://localhost/api/v1/stream-chat/webhook", {
      method: "POST",
      body: raw,
      headers: { "x-signature": "signed", "content-encoding": "gzip" },
    }));

    expect(response.status).toBe(200);
    expect(accept).toHaveBeenCalledOnce();
    const [body, signature] = accept.mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.equals(raw)).toBe(true);
    expect(signature).toBe("signed");
  });

  it("rejects oversized requests before invoking the verifier", async () => {
    const response = await app.request(new Request("http://localhost/api/v1/stream-chat/webhook", {
      method: "POST",
      body: Buffer.alloc(65_537),
    }));

    expect(response.status).toBe(413);
    expect(accept).not.toHaveBeenCalled();
  });
});
