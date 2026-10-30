/**
 * Read-only WEB-5 Stream DEV check. Never invokes any provider mutation.
 * Use only the documented development app (ID 1730620) and test env file.
 * No secret values or user/message/channel content is logged.
 */
import { createRequire } from "node:module";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
if (process.cwd() !== root) throw new Error("UNSAFE_WORKING_DIRECTORY");
const envFile = resolve(root, ".env.stream-chat-test");
if (lstatSync(envFile).isSymbolicLink()) throw new Error("UNSAFE_ENV_SYMLINK");
const require = createRequire(resolve(root, "packages/core/package.json"));
if (!require.resolve("stream-chat").endsWith("/dist/cjs/index.node.js")) {
  throw new Error("STREAM_NODE_EXPORT_NOT_SELECTED");
}
process.loadEnvFile(envFile);
const apiKey = process.env.STREAM_API_KEY;
const apiSecret = process.env.STREAM_API_SECRET;
if (!apiKey || !apiSecret) throw new Error("TEST_PROVIDER_CREDENTIALS_MISSING");
const { StreamChat } = require("stream-chat");
const server = StreamChat.getInstance(apiKey, apiSecret);
const permittedGrants = new Set([
  "read-channel", "read-channel-members", "send-event", "send-typing-event",
]);
try {
  const app = await server.getAppSettings();
  if (String(app.app?.id) !== "1730620") throw new Error("NOT_THE_DOCUMENTED_DEV_APP");
  const authSafe = !app.app?.disable_auth_checks && !app.app?.disable_permissions_checks &&
    (app.app?.grants?.gafus_chat_reader ?? []).length === 0;
  console.log(`DEV_APP_AUTH=${authSafe ? "PASS" : "FAIL"}`);
  let channelSafe = true;
  for (const [name, community] of [["gafus_cynologist", false], ["gafus_community", true]]) {
    const channelType = await server.getChannelType(name);
    const member = channelType.grants?.channel_member ?? [];
    const role = channelType.grants?.gafus_chat_reader ?? [];
    const safe = member.includes("read-channel") && member.every((grant) => permittedGrants.has(grant)) &&
      (community ? role.includes("read-channel") && role.every((grant) => permittedGrants.has(grant)) : role.length === 0) &&
      channelType.connect_events === true && channelType.read_events === true &&
      channelType.reactions === true && channelType.quotes === true && channelType.uploads === true;
    if (!safe) channelSafe = false;
    console.log(`${name.toUpperCase()}_READER_GRANTS=${safe ? "PASS" : "FAIL"}`);
    console.log(`${name.toUpperCase()}_SCHEDULE_MESSAGE=${member.includes("schedule-message") ? "FORBIDDEN_GRANT" : "ABSENT"}`);
  }
  if (!authSafe || !channelSafe) process.exitCode = 2;
} catch (error) {
  // Do not stringify the remote error: it can contain credential-bearing URLs.
  console.log(`DEV_STREAM_PREFLIGHT=UNAVAILABLE (${error instanceof Error ? error.name : "unknown"})`);
  process.exitCode = 3;
}
