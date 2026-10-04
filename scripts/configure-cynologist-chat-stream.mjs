/** Run with server environment already loaded. Defaults to an inspection; --apply configures only this dedicated type/role. */
import { execFileSync } from "node:child_process";
const community = process.argv.includes("--community");
const type = community ? "gafus_community" : "gafus_cynologist",
  role = "gafus_chat_reader";
function api(args, request, jq) {
  const full = ["api", ...args];
  if (request) full.push("--request", JSON.stringify(request));
  if (jq) full.push("--jq", jq);
  try {
    return JSON.parse(
      execFileSync("getstream", full, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      }),
    );
  } catch {
    throw new Error(`Stream configuration operation failed: ${args.join(" ")}`);
  }
}
const app = api(
  ["GetApp"],
  null,
  "{auth_disabled: .app.disable_auth_checks, permissions_disabled: .app.disable_permissions_checks, grants: .app.grants}",
);
if (app.auth_disabled || app.permissions_disabled)
  throw new Error("Enable authentication and permissions checks first");
const roles = api(["ListRoles"], null, ".roles | map(.name)");
const types = api(["chat", "ListChannelTypes"], null, ".channel_types | keys");
if (!process.argv.includes("--apply")) {
  console.log(
    JSON.stringify({
      authChecks: true,
      permissionsChecks: true,
      roleExists: roles.includes(role),
      channelTypeExists: types.includes(type),
    }),
  );
} else {
  if (!roles.includes(role)) api(["CreateRole"], { name: role });
  api(["UpdateApp"], { grants: { ...app.grants, [role]: [] } });
  const config = {
    automod: "disabled",
    automod_behavior: "flag",
    max_message_length: 7000,
    connect_events: true,
    read_events: true,
    typing_events: true,
    custom_events: !community,
    replies: false,
    // Quotes and reactions are written through the GAFUS server, not reader tokens.
    quotes: true,
    reactions: true,
    polls: false,
    commands: [],
    push_notifications: false,
    uploads: true,
    url_enrichment: false,
    grants: {
      [role]: community ? ["read-channel", "read-channel-members", "send-event"] : [],
      channel_member: ["read-channel", "read-channel-members", "send-event"],
      user: [],
      guest: [],
      anonymous: [],
      channel_moderator: [],
    },
  };
  if (types.includes(type)) api(["chat", "UpdateChannelType", "--name", type], config);
  else api(["chat", "CreateChannelType"], { name: type, ...config });
  console.log("Chat type and reader role configured; client writes are disabled.");
}
