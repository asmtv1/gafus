import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ image: vi.fn(), file: vi.fn(), channel: vi.fn() }));
vi.mock("../cynologistChat/stream", () => ({ streamServer: () => ({ channel: mock.channel }) }));
import { deleteAccountStreamFiles } from "./stream";
const value = JSON.stringify({
  url: "https://us.stream-io-cdn.com/image.jpg?Expires=123",
  kind: "image",
  channelType: "gafus_community",
  channelId: "general",
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.channel.mockReturnValue({ deleteImage: mock.image, deleteFile: mock.file });
});
afterEach(() => vi.unstubAllGlobals());
it("deletes via the saved channel and verifies that the old CDN URL is gone", async () => {
  const head = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", head);
  await deleteAccountStreamFiles([value]);
  expect(mock.channel).toHaveBeenCalledWith("gafus_community", "general");
  expect(mock.image).toHaveBeenCalledOnce();
  expect(head.mock.calls[0][0]).toBe(JSON.parse(value).url);
});
it.each([200, 403, 500])(
  "does not mistake CDN status %s for confirmed deletion",
  async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(deleteAccountStreamFiles([value])).rejects.toThrow("CLEANUP_STREAM_NOT_CONFIRMED");
  },
);
it("does not mistake a provider permission failure for a missing file", async () => {
  mock.image.mockRejectedValue({ response: { status: 403 } });
  const head = vi.fn();
  vi.stubGlobal("fetch", head);
  await expect(deleteAccountStreamFiles([value])).rejects.toBeDefined();
  expect(head).not.toHaveBeenCalled();
});
it("rejects foreign URLs before any provider request", async () => {
  await expect(
    deleteAccountStreamFiles([value.replace("us.stream-io-cdn.com", "attacker.example")]),
  ).rejects.toThrow("CLEANUP_UNSAFE_STREAM_FILE");
  expect(mock.channel).not.toHaveBeenCalled();
});
