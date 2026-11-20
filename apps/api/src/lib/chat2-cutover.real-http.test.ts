import { describe, expect, it } from "vitest";
import { app } from "../app.js";

// Chat 1.0 has no compatibility endpoints. Unknown routes must not reach Stream.
describe("Chat 1.0 removal", () => {
  for (const [method, path] of [
    ["GET", "/api/v1/cynologist-chat"],
    ["POST", "/api/v1/cynologist-chat/messages"],
    ["GET", "/api/v1/community-chat"],
    ["POST", "/api/v1/community-chat/rooms"],
    ["POST", "/api/v1/stream-chat/webhook"],
    ["POST", "/api/v1/stream-chat/webhook/event"],
  ] as const) {
    it(`${method} ${path} is not mounted`, async () => {
      const response = await app.request(`http://local.test${path}`, { method });
      expect(response.status).toBe(404);
    });
  }
});
