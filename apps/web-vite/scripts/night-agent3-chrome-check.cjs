/** Optional isolated Chrome CDP smoke, without Playwright service or production APIs.
 * Run against an existing, locally started Vite preview (port 48673).
 * Does not touch other Chrome profiles/processes. */
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");
const WebSocket = require("ws");

const origin = "http://127.0.0.1:48673";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(resolve(process.cwd(), ".agent3-chrome-"));
const port = 48674;
const sleep = ms => new Promise(done => setTimeout(done, ms));
const child = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--no-sandbox", "--disable-background-networking", "--disable-extensions",
  "--disable-sync", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

let socket;
let counter = 1;
const pending = new Map();
const sessions = new Set();
let failures = 0;
const onMessage = raw => {
  const message = JSON.parse(raw.toString());
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === "Fetch.requestPaused" && message.sessionId) {
    const url = message.params.request.url;
    const path = new URL(url).pathname;
    if (path.startsWith("/api/v1/")) {
      const isAuth = ["/api/v1/auth/me", "/api/v1/auth/refresh"].includes(path);
      const payload = isAuth
        ? { success: false, error: "Not authenticated" }
        : path === "/api/v1/public/platform-stats"
          ? { success: true, data: { students: 100 } }
          : { success: false, error: "Synthetic browser preview has no API" };
      const responseCode = isAuth ? 401 : path === "/api/v1/public/platform-stats" ? 200 : 404;
      void rpc("Fetch.fulfillRequest", {
        requestId: message.params.requestId, responseCode,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      }, message.sessionId).catch(err => process.stderr.write(String(err)));
    } else {
      void rpc("Fetch.continueRequest", { requestId: message.params.requestId },
        message.sessionId).catch(err => process.stderr.write(String(err)));
    }
  }
};
function rpc(method, params = {}, sessionId) {
  const id = counter++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function inspect(width, path) {
  const { targetId } = await rpc("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await rpc("Target.attachToTarget", { targetId, flatten: true });
  sessions.add(sessionId);
  await rpc("Page.enable", {}, sessionId);
  await rpc("Runtime.enable", {}, sessionId);
  await rpc("Fetch.enable", { patterns: [{ urlPattern: "*://127.0.0.1:48673/api/v1/*" }] }, sessionId);
  await rpc("Emulation.setDeviceMetricsOverride", {
    width, height: width < 500 ? 844 : 800, deviceScaleFactor: 1, mobile: width < 500,
  }, sessionId);
  await rpc("Page.navigate", { url: origin + path }, sessionId);
  let out;
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(200);
    const { result } = await rpc("Runtime.evaluate", {
      expression: `(() => ({path:location.pathname,ready:document.readyState,
        viewport:innerWidth, scroll:document.documentElement.scrollWidth,
        body:document.body?.innerText?.slice(0,100) ?? "",
        page:!!document.querySelector('[data-ui-parity="legacy-landing"]'),
        login:!!document.querySelector('#login-name'),
        register:!!document.querySelector('form'),
        reset:!!document.querySelector('input[type="email"]'),
        waiting:!!document.querySelector('[role="status"]'),
        js:performance.getEntriesByType("resource").filter(r=>r.name.endsWith(".js")).map(r=>r.name.split("/").pop())
      }))()`,
      returnByValue: true,
    }, sessionId);
    out = result.value;
    if (out && out.ready === "complete" &&
        (out.page || out.login || (path === "/passwordReset" && out.reset) ||
          (path === "/register" && out.register && !out.waiting))) break;
  }
  console.log(JSON.stringify({width,path,...out}));
  if (!out || out.viewport !== width || out.scroll > width + 2) failures++;
  if (path === "/" && !out?.page) failures++;
  if (path === "/login" && !out?.login) failures++;
  if (path === "/passwordReset" && !out?.reset) failures++;
  if (path === "/login") {
    // RouteLink must navigate inside the SPA; lazy registration UI then mounts.
    await rpc("Runtime.evaluate", {
      expression: `document.querySelector('a[href="/register"]')?.click()`,
    }, sessionId);
    let navigated = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(150);
      const { result } = await rpc("Runtime.evaluate", {
        expression: `({path:location.pathname,register:!!document.querySelector('input[type="email"]'),scroll:document.documentElement.scrollWidth,viewport:innerWidth})`,
        returnByValue: true,
      }, sessionId);
      navigated = result.value;
      if (navigated?.path === "/register" && navigated.register) break;
    }
    console.log(JSON.stringify({navigation: "login-to-register", width, ...navigated}));
    if (navigated?.path !== "/register" || !navigated.register ||
        navigated.scroll > navigated.viewport + 2) failures++;
  }
  await rpc("Target.closeTarget", { targetId });
}
async function main() {
  let url;
  for (let i = 0; i < 70; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      url = (await response.json()).webSocketDebuggerUrl; break;
    } catch { await sleep(150); }
  }
  if (!url) throw Error("Chrome CDP did not start");
  socket = new WebSocket(url);
  socket.on("message", onMessage);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  for (const path of ["/", "/login", "/register", "/passwordReset"]) {
    for (const width of [1280, 390]) await inspect(width, path);
  }
  console.log(`CHROME_DESKTOP_NARROW_RESULT failures=${failures}`);
}
main().catch(error => { failures++; console.error(error); }).finally(async () => {
  try { if (socket?.readyState === WebSocket.OPEN) await rpc("Browser.close"); } catch {}
  try { socket?.terminate(); } catch {}
  try { child.kill("SIGTERM"); } catch {}
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 15, retryDelay: 250 });
  process.exitCode = failures ? 1 : 0;
});
