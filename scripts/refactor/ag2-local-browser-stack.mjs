// One bounded, supervised local Vite + Playwright job. No DB/Hono/provider startup.
import { spawn, execFileSync } from "node:child_process";
import { lstatSync, statSync } from "node:fs";
import { connect } from "node:net";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const SAFE_ENV = {
  PATH: "/opt/homebrew/bin:/usr/bin:/bin",
  HOME: ROOT,
  TMPDIR: ROOT + "/.local-browser-mcp/.cache/tmp/",
  COREPACK_ENABLE_NETWORK: "0",
};
function fail(reason) { throw new Error("LOCAL_BROWSER_STACK_DENIED:" + reason); }
const branch = execFileSync("/usr/bin/git", ["-C", ROOT, "branch", "--show-current"], {
  encoding: "utf8",
}).trim();
const root = execFileSync("/usr/bin/git", ["-C", ROOT, "rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
if (root !== ROOT || branch !== "vite" || process.cwd() !== ROOT) fail("git_or_cwd");
for (const relative of [
  ".", "apps", "apps/web-vite", "scripts", "scripts/refactor",
  "scripts/refactor/ag2-local-web-hono-run.sh",
  ".local-browser-mcp", ".local-browser-mcp/start.sh",
  ".local-browser-mcp/restricted-proxy.mjs", ".local-browser-mcp/start-tunnel.sh",
  ".local-browser-mcp/.cache",
]) {
  if (lstatSync(ROOT + "/" + relative).isSymbolicLink()) fail("symlink");
}
const occupied = port => new Promise(resolve => {
  const socket = connect({ host: "127.0.0.1", port });
  socket.setTimeout(1300, () => { socket.destroy(); resolve(true); });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => { socket.destroy(); resolve(false); });
});
async function waitForPort(port) {
  for (let i = 0; i < 75; i++) {
    if (await occupied(port)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  fail("child_port_unavailable");
}
function tunnelReadyToStart() {
  for (const suffix of ["id", "key"]) {
    const path = ROOT + "/.local-browser-mcp/.cache/tunnel." + suffix;
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0 ||
        (info.mode & 0o777) !== 0o600) fail("private_tunnel_config_invalid");
  }
}
async function honoHealthy() {
  for (const path of ["health", "ready"]) {
    const res = await fetch("http://127.0.0.1:3001/" + path, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.status !== 200) fail("hono_unready");
  }
}
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  // Fail closed even when no child keeps the event loop alive. An unref'd
  // shutdown timer alone otherwise exits 0 after a refused port preflight.
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 3500).unref();
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
async function main() {
  if (await occupied(5173)) fail("web_port_occupied");
  if (await occupied(8931)) fail("playwright_port_occupied");
  // The connected Secure MCP Tunnel expects 8940, not the raw browser 8931.
  // Never hijack an existing proxy or tunnel; fail closed on an occupied port.
  if (await occupied(8940)) fail("playwright_safe_proxy_port_occupied");
  await honoHealthy();
  tunnelReadyToStart();
  const web = spawn("/bin/zsh", ["scripts/refactor/ag2-local-web-hono-run.sh", "--run"], {
    cwd: ROOT, env: SAFE_ENV, stdio: "ignore",
  });
  children.push(web);
  web.once("error", () => stop(2));
  web.once("exit", (code, signal) => {
    if (!stopping) {
      console.error("LOCAL_WEB_EXIT code=" + String(code) + " signal=" + String(signal));
      stop(2);
    }
  });
  await waitForPort(5173);
  const pw = spawn("/bin/bash", [".local-browser-mcp/start.sh", "shared"], {
    cwd: ROOT, env: SAFE_ENV, stdio: "ignore",
  });
  children.push(pw);
  pw.once("error", () => stop(3));
  pw.once("exit", (code, signal) => {
    if (!stopping) {
      console.error("LOCAL_PLAYWRIGHT_EXIT code=" + String(code) + " signal=" + String(signal));
      stop(3);
    }
  });
  await waitForPort(8931);
  const safeProxy = spawn("/opt/homebrew/bin/node",
    [".local-browser-mcp/restricted-proxy.mjs", "shared"], {
      cwd: ROOT, env: SAFE_ENV, stdio: "ignore",
    });
  children.push(safeProxy);
  safeProxy.once("error", () => stop(4));
  safeProxy.once("exit", (code, signal) => {
    if (!stopping) {
      console.error("LOCAL_PLAYWRIGHT_PROXY_EXIT code=" + String(code) +
        " signal=" + String(signal));
      stop(4);
    }
  });
  await waitForPort(8940);
  // The ChatGPT connector is routed through the outbound Secure MCP Tunnel,
  // not the local raw or safe proxy alone. Supervise the already configured
  // project-only tunnel in this SAME bounded job. Never print child output:
  // the tunnel reads its mode-600 key internally and can log private IDs.
  const tunnel = spawn("/bin/bash", [".local-browser-mcp/start-tunnel.sh"], {
    cwd: ROOT, env: SAFE_ENV, stdio: "ignore",
  });
  children.push(tunnel);
  tunnel.once("error", () => stop(5));
  tunnel.once("exit", (code, signal) => {
    if (!stopping) {
      console.error("LOCAL_TUNNEL_EXIT code=" + String(code) + " signal=" + String(signal));
      stop(5);
    }
  });
  await new Promise(resolve => setTimeout(resolve, 2200));
  if (tunnel.exitCode !== null || tunnel.signalCode !== null) fail("tunnel_child_unavailable");
  console.log("LOCAL_BROWSER_STACK_READY web=http://127.0.0.1:5173 api=http://127.0.0.1:3001 playwright_raw=127.0.0.1:8931 safe_proxy=127.0.0.1:8940");
  console.log("TUNNEL_CHILD_RUNNING_NO_SECRET_OUTPUT (remote connector still requires actual browser test)");
  console.log("CLIENT_MODE=local-hono NO_CREDS NO_FOREIGN_PROCESSES");
}
main().catch(error => {
  console.error(String(error?.message ?? "LOCAL_BROWSER_STACK_FAILED"));
  stop(1);
});
