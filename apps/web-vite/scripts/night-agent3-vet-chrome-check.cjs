/** Vet owner-only synthetic Chrome CDP smoke, without backend/prod API.
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
let acceptDialog = false;
const dialogMessages = [];
const onMessage = raw => {
  const message = JSON.parse(raw.toString());
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === "Page.javascriptDialogOpening" && message.sessionId) {
    dialogMessages.push(message.params.message);
    void rpc("Page.handleJavaScriptDialog", {accept: acceptDialog}, message.sessionId)
      .catch(error => process.stderr.write(String(error)));
    return;
  }
  if (message.method === "Fetch.requestPaused" && message.sessionId) {
    const url = message.params.request.url;
    const path = new URL(url).pathname;
    if (path.startsWith("/api/v1/")) {
      const visit = {
        id: "visit1", petId: "pet1", visitedOn: "2026-01-02",
        specialty: "Терапевт", doctorName: "Врач", clinic: "Клиника",
        diagnosis: "PRIVATE_DIAGNOSIS", conclusion: "PRIVATE_CONCLUSION", notes: "PRIVATE_NOTE",
        attachments: [{ id: "doc1", name: "medical-test.pdf", mimeType: "application/pdf",
          sizeBytes: 148, hasPreview: false, previewProcessing: false }],
      };
      let status = 200;
      let data = null;
      if (path === "/api/v1/auth/me") {
        data = { id: "owner1", username: "owner", role: "USER" };
      } else if (path === "/api/v1/pets/pet1") {
        data = { id: "pet1", name: "Пушок", type: "DOG", breed: "Метис",
          showInProfile: true, birthDate: "2020-02-05T00:00:00.000Z",
          weightKg: 12.5, heightCm: 45, notes: "", neckGirthCm: null,
          muzzleGirthCm: null, bellyGirthCm: null };
      } else if (path === "/api/v1/pets/pet1/vet-visits") {
        data = [visit];
      } else if (path === "/api/v1/pets/pet1/vet-visits/visit1") {
        data = visit;
      } else {
        status = 404;
      }
      // No writes and no actual private medical data; fixtures are labeled synthetic.
      if (message.params.request.method !== "GET") { status = 405; data = null; }
      const payload = status === 200
        ? { success: true, data }
        : { success: false, error: "Synthetic read-only fixture" };
      const responseCode = status;
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
async function inspect(width) {
  const path = "/pets/pet1/vet-visits";
  const { targetId } = await rpc("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await rpc("Target.attachToTarget", { targetId, flatten: true });
  await rpc("Page.enable", {}, sessionId);
  await rpc("Runtime.enable", {}, sessionId);
  await rpc("Fetch.enable", { patterns: [{urlPattern: "*://127.0.0.1:48673/api/v1/*"}] }, sessionId);
  await rpc("Emulation.setDeviceMetricsOverride", {
    width, height: width < 500 ? 844 : 800, deviceScaleFactor: 1, mobile: width < 500,
  }, sessionId);
  const evalJs = async expression =>
    (await rpc("Runtime.evaluate", {expression, returnByValue: true}, sessionId)).result.value;
  const snapshot = () => evalJs(`(() => ({
    location: location.pathname + location.search,
    scroll: document.documentElement.scrollWidth, viewport: innerWidth,
    hasSummary: [...document.querySelectorAll('summary')].some(el => el.textContent.includes('Терапевт')),
    doc: document.body?.innerText.includes('medical-test.pdf'),
    privateNote: document.body?.innerText.includes('PRIVATE_DIAGNOSIS'),
    attachmentLinks: document.querySelectorAll('a[aria-label="Открыть medical-test.pdf"]').length,
    documentDelete: [...document.querySelectorAll('button')].some(el => el.textContent.includes('Удалить вложение')),
    editing: Boolean(document.querySelector('form[aria-label="Форма посещения врача"]')),
    visibleButtons: [...document.querySelectorAll('button')].filter(el => el.getClientRects().length).map(el=>el.textContent.trim()).slice(0,18),
  }))()`);
  await rpc("Page.navigate", {url: origin+path}, sessionId);
  let before = null;
  for (let i=0;i<35;i++){
    await sleep(180);before=await snapshot();if(before?.hasSummary) break;
  }
  console.log(JSON.stringify({width,stage:"list",...before}));
  if(!before?.hasSummary || before.scroll>width+2 || before.privateNote) failures++;
  await evalJs(`document.querySelector('summary')?.click()`);
  let expanded = null;
  for(let i=0;i<30;i++){
    await sleep(150);expanded=await snapshot();
    if(expanded?.privateNote&&expanded?.attachmentLinks)break;
  }
  console.log(JSON.stringify({width,stage:"details",...expanded}));
  if(!expanded?.doc || !expanded?.privateNote || !expanded?.attachmentLinks ||
     !expanded?.documentDelete || expanded.scroll>width+2) failures++;
  dialogMessages.length=0;
  acceptDialog=false;
  await evalJs(`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Удалить вложение')?.click()`);
  await sleep(160);
  const attachmentCancelled = await snapshot();
  console.log(JSON.stringify({width,stage:"delete-document-rejected",...attachmentCancelled,dialogs:[...dialogMessages]}));
  if(!attachmentCancelled.doc || !dialogMessages.some(p=>p.includes("Удалить вложение")))failures++;
  await evalJs(`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Удалить запись')?.click()`);
  await sleep(160);
  const removeCancelled = await snapshot();
  console.log(JSON.stringify({width,stage:"delete-visit-rejected",...removeCancelled,dialogs:[...dialogMessages]}));
  if(!removeCancelled.privateNote || !dialogMessages.some(p=>p.includes("Удалить посещение")))failures++;
  await evalJs(`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Изменить')?.click()`);
  let editing = null;
  for(let i=0;i<20;i++){
    await sleep(120);editing=await snapshot();if(editing?.editing)break;
  }
  console.log(JSON.stringify({width,stage:"edit",...editing}));
  if(!editing?.editing || editing.scroll>width+2)failures++;
  await evalJs(`document.querySelector('a[href="/pets"]')?.click()`);
  await sleep(160);
  const guarded=await snapshot();
  console.log(JSON.stringify({width,stage:"navigation-guard",...guarded,dialogs:[...dialogMessages]}));
  if(guarded.location!=="/pets/pet1/vet-visits?visitId=visit1" || !guarded.editing ||
     !dialogMessages.some(p=>p.includes("Закрыть форму")))failures++;
  acceptDialog=true;
  await evalJs(`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Отмена')?.click()`);
  await sleep(220);
  let cancelled=await snapshot();
  console.log(JSON.stringify({width,stage:"cancel",...cancelled,dialogs:[...dialogMessages]}));
  if(cancelled?.editing || !dialogMessages.some(p=>p.includes("Отменить несохранённые изменения")) ||
     cancelled.scroll>width+2)failures++;
  await evalJs(`document.querySelector('a[href="/pets"]')?.click()`);
  await sleep(170);
  const navigated=await snapshot();
  console.log(JSON.stringify({width,stage:"navigate",...navigated}));
  if(navigated?.location!=="/pets")failures++;
  await rpc("Target.closeTarget", {targetId});
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
  for (const width of [1280, 390]) await inspect(width);
  console.log(`CHROME_SYNTHETIC_VET_DESKTOP_NARROW_RESULT failures=${failures}`);
}
main().catch(error => { failures++; console.error(error); }).finally(async () => {
  try { if (socket?.readyState === WebSocket.OPEN) await rpc("Browser.close"); } catch {}
  try { socket?.terminate(); } catch {}
  try { child.kill("SIGTERM"); } catch {}
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 15, retryDelay: 250 });
  process.exitCode = failures ? 1 : 0;
});
