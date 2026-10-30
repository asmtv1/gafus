import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testProvider = vi.hoisted(() => ({
  getChannelType: vi.fn(),
  getAppSettings: vi.fn(),
}));
vi.mock("stream-chat", () => ({ StreamChat: { getInstance: () => testProvider } }));

import { verifyChatPermissions } from "./stream";

const member = ["read-channel", "read-channel-members"];
const type = (community = false) => ({
  grants: { channel_member: [...member], gafus_chat_reader: community ? [...member] : [] },
  connect_events: true, read_events: true,
});
const app = () => ({ app: { disable_auth_checks: false,
  disable_permissions_checks: false, grants: { gafus_chat_reader: [] } } });

beforeEach(() => {
  vi.stubEnv("STREAM_API_KEY", "synthetic_test_only");
  vi.stubEnv("STREAM_API_SECRET", "synthetic_secret_only");
  testProvider.getChannelType.mockImplementation(async (name: string) =>
    type(name === "gafus_community"));
  testProvider.getAppSettings.mockResolvedValue(app());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("development Stream provider permission preflight", () => {
  it("accepts strictly read-only member grants for private and community chat", async () => {
    await expect(verifyChatPermissions()).resolves.toBeUndefined();
    await expect(verifyChatPermissions("gafus_community")).resolves.toBeUndefined();
  });
  it.each(["gafus_cynologist", "gafus_community"])(
    "%s rejects provider-added schedule-message rather than silently enabling write bypass",
    async (name) => {
      testProvider.getChannelType.mockResolvedValue({
        ...type(name === "gafus_community"),
        grants: { ...type(name === "gafus_community").grants,
          channel_member: [...member, "schedule-message"] },
      });
      await expect(verifyChatPermissions(name)).rejects.toMatchObject({
        code: "CHAT_PERMISSIONS_UNSAFE", status: 503,
      });
    },
  );
  it("rejects global authentication bypass", async () => {
    testProvider.getAppSettings.mockResolvedValue({
      app: { ...app().app, disable_auth_checks: true },
    });
    await expect(verifyChatPermissions()).rejects.toMatchObject({
      code: "CHAT_PERMISSIONS_UNSAFE", status: 503,
    });
  });
  it("rejects community reader tokens with moderation or message creation grants", async () => {
    testProvider.getChannelType.mockResolvedValue({
      ...type(true),
      grants: { ...type(true).grants,
        gafus_chat_reader: [...member, "create-message"] },
    });
    await expect(verifyChatPermissions("gafus_community")).rejects.toMatchObject({
      code: "CHAT_PERMISSIONS_UNSAFE", status: 503,
    });
  });
});
