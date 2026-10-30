// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { PetVetVisitsConnected } from "./PetVetVisitsConnected";

const date = "2026-01-02";
type Doc = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  hasPreview: boolean;
  previewProcessing: boolean;
};
const visit = (id = "visit1") => ({
  id,
  petId: "pet1",
  visitedOn: date,
  specialty: "Терапевт",
  doctorName: "Врач",
  clinic: "Клиника",
  diagnosis: "PRIVATE_DIAGNOSIS",
  conclusion: "PRIVATE_CONCLUSION",
  notes: "PRIVATE_NOTE",
  attachments: [] as Doc[],
  secret: "SECRET_S3_KEY",
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status < 300, data, error: "RAW_PRIVATE_SERVER_ERROR" }), {
    status,
  });
const pause = async () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 16));
  });
let host: HTMLElement, root: Root, cache: QueryClient, fetcher: ReturnType<typeof vi.fn>;
let stored: ReturnType<typeof visit>[];
const owner = { id: "owner1", username: "owner", role: "USER" };
const base = "/api/v1/pets/pet1/vet-visits";
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/pets/pet1/vet-visits");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, owner);
  stored = [visit()];
  fetcher = vi.fn(async (path: string, opts: RequestInit) => {
    if (path === base && opts.method === "GET") return response(stored);
    if (path === base && opts.method === "POST") {
      const payload = JSON.parse(String(opts.body));
      const created = { ...visit("fresh"), ...payload };
      stored.push(created);
      return response(created, 201);
    }
    if (path.endsWith("/attachments") && opts.method === "POST") {
      const id = path.slice(base.length + 1).split("/")[0];
      const row = stored.find((v) => v.id === id);
      const body = opts.body as FormData;
      const file = body.get("file");
      if (!row || !(file instanceof File)) throw Error("INVALID_TEST_MULTIPART");
      const attachment: Doc = {
        id: "doc-1",
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        hasPreview: false,
        previewProcessing: false,
      };
      row.attachments.push(attachment);
      return response(attachment, 201);
    }
    if (path.includes("/attachments/") && opts.method === "DELETE") {
      const [id, , fileId] = path.slice(base.length + 1).split("/");
      const row = stored.find((v) => v.id === id);
      if (!row) throw Error("INVALID_TEST_VET_DOC_OWNER");
      row.attachments = row.attachments.filter((doc) => doc.id !== fileId);
      return response(null);
    }
    if (path.startsWith(base + "/")) {
      const id = path.slice(base.length + 1);
      if (opts.method === "GET")
        return response(
          stored.find((v) => v.id === id),
          200,
        );
      if (opts.method === "PUT") {
        const payload = JSON.parse(String(opts.body));
        stored = stored.map((v) => (v.id === id ? { ...v, ...payload } : v));
        return response(stored.find((v) => v.id === id));
      }
      if (opts.method === "DELETE") {
        stored = stored.filter((v) => v.id !== id);
        return response(null);
      }
    }
    throw Error("UNEXPECTED_NETWORK");
  });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
async function mount(selectedId: string | null = null) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <PetVetVisitsConnected
          ownerId="owner1"
          petId="pet1"
          petName="Пушок"
          selectedId={selectedId}
          badDeepLink={false}
          onSelect={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  );
  await pause();
}
async function click(text: string) {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent?.includes(text));
  expect(b, text).toBeDefined();
  await act(async () => b?.click());
  await pause();
}
async function fill(selector: string, value: string) {
  const target = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  expect(target, selector).not.toBeNull();
  const proto =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(target, value);
    target?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const writes = () => fetcher.mock.calls.filter(([, r]) => r.method !== "GET");
function VetNextInlineHistoryHarness(){
  const [selectedId,setSelectedId]=useState<string|null>(null);
  return <PetVetVisitsConnected ownerId="owner1" petId="pet1" petName="Пушок"
    selectedId={selectedId} badDeepLink={false} onSelect={setSelectedId}/>;
}

describe("ordinary Hono owner veterinary visits — connected Web", () => {
  it("live list renders own summary, does not expose clinical details/keys before exact detail GET", async () => {
    await mount();
    expect(host.textContent).toContain("Терапевт");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(host.innerHTML).not.toContain("SECRET_S3_KEY");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([base]);
    expect(writes()).toHaveLength(0);
  });
  it("matches Core required vet visit fields and explains star markers", async () => {
    stored = [];
    await mount();
    await click("Добавить первую запись");
    const form = host.querySelector<HTMLFormElement>(
      'form[aria-label="Форма посещения врача"]',
    );
    expect(form).not.toBeNull();
    const required = [...form!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input[required], textarea[required]",
    )];
    expect(required).toHaveLength(2);
    expect(required[0].type).toBe("date");
    expect(required[1].getAttribute("maxlength")).toBe("200");
    const labels = [...form!.querySelectorAll("label")];
    const requiredLabels = labels.filter((label) =>
      label.querySelector("input[required], textarea[required]"),
    );
    expect(requiredLabels.map((label) => label.textContent?.trim())).toEqual([
      "Дата приёма *",
      "Специальность врача *",
    ]);
    expect(labels.filter((label) => label.querySelector("span[aria-hidden='true']")))
      .toHaveLength(2);
    expect(form!.textContent).toContain("поля, обязательные для заполнения");
    for (const label of labels.filter((item) => !requiredLabels.includes(item))) {
      expect(label.querySelector("input[required], textarea[required]")).toBeNull();
      expect(label.querySelector("span[aria-hidden='true']")).toBeNull();
    }
    expect(writes()).toHaveLength(0);
  });
  it("restores the original Next title and empty-visit state without a write", async () => {
    stored = [];
    await mount();
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelector("h1")?.textContent).toBe("Посещения врача");
    expect(host.textContent).toContain("Пушок");
    expect(host.textContent).toContain("Здесь будет история посещений");
    expect(host.textContent).toContain("Сохраните дату приёма");
    expect(host.querySelector("[aria-label='Питомец: Пушок']")).not.toBeNull();
    expect(host.querySelectorAll("button").length).toBe(1);
    expect(writes()).toHaveLength(0);
    await click("Добавить первую запись");
    expect(host.querySelector<HTMLFormElement>('form[aria-label="Форма посещения врача"]'))
      .not.toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("shows local image/PDF preview immediately; remove and cancel revoke blobs without upload", async () => {
    stored = [];
    const nativeCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const nativeRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const createObjectURL = vi.fn(() => "blob:vet-preview-1");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true, writable: true, value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true, writable: true, value: revokeObjectURL,
    });
    try {
      await mount();
      await click("Добавить первую запись");
      const picker = host.querySelector<HTMLInputElement>('input[aria-label="Выбрать вложения"]')!;
      expect(picker.hidden).toBe(true);
      Object.defineProperty(picker, "files", { configurable: true, value: [
        new File(["img"], "scan.png", {type:"image/png"}),
        new File(["pdf"], "medcard.pdf", {type:"application/pdf"}),
      ]});
      await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(host.querySelector<HTMLImageElement>('img[alt="Предпросмотр: scan.png"]')
        ?.getAttribute("src")).toBe("blob:vet-preview-1");
      expect(host.textContent).toContain("medcard.pdf");
      expect(host.textContent).toContain("PDF");
      expect(host.textContent).toContain("2 из 5 файлов");
      expect(writes()).toHaveLength(0);
      const remove = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Убрать файл scan.png"]',
      );
      await act(async () => remove?.click());
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:vet-preview-1");
      expect(host.querySelector('img[alt="Предпросмотр: scan.png"]')).toBeNull();
      expect(host.textContent).toContain("1 из 5 файлов");
      await click("Отмена");
      expect(host.querySelector('[aria-label="Выбранные вложения"]')).toBeNull();
      expect(writes()).toHaveLength(0);
    } finally {
      if (nativeCreate) Object.defineProperty(URL, "createObjectURL", nativeCreate);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (nativeRevoke) Object.defineProperty(URL, "revokeObjectURL", nativeRevoke);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });
  it("uploads selected image only on save and revokes its local preview after ACK", async () => {
    stored = [];
    const nativeCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const nativeRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true, writable: true, value: () => "blob:vet-pending-upload",
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true, writable: true, value: revokeObjectURL,
    });
    try {
      await mount();
      await click("Добавить первую запись");
      const picker = host.querySelector<HTMLInputElement>('input[aria-label="Выбрать вложения"]')!;
      Object.defineProperty(picker, "files", { configurable: true, value: [
        new File(["data"], "clinic.jpg", {type:"image/jpeg"}),
      ]});
      await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
      expect(host.querySelector('img[alt="Предпросмотр: clinic.jpg"]')).not.toBeNull();
      expect(writes()).toHaveLength(0);
      await fill('input[type="date"]', date);
      await fill('input[maxlength="200"]', "Хирург");
      await act(async () => host.querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      await pause();
      expect(writes().map(([url]) => url)).toEqual([base, base + "/fresh/attachments"]);
      expect((writes()[1][1].body as FormData).get("file")).toMatchObject({
        name: "clinic.jpg", type: "image/jpeg",
      });
      expect(host.textContent).toContain("Запись подтверждена");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:vet-pending-upload");
    } finally {
      if (nativeCreate) Object.defineProperty(URL, "createObjectURL", nativeCreate);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (nativeRevoke) Object.defineProperty(URL, "revokeObjectURL", nativeRevoke);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });
  it("original Next attachment grid shows ready PDF preview and processing placeholder",async()=>{
    stored=[{...visit(),attachments:[
      {id:"readyPDF",name:"Заверенный паспорт.pdf",mimeType:"application/pdf",
        sizeBytes:2080,hasPreview:true,previewProcessing:false},
      {id:"processing",name:"Снимок.png",mimeType:"image/png",
        sizeBytes:2080,hasPreview:false,previewProcessing:true},
    ]}];
    await mount("visit1");
    const attachments=host.querySelector('[aria-label="Вложения посещения"]');
    expect(attachments).not.toBeNull();
    expect(attachments?.textContent).toContain("Вложения · 2");
    expect(attachments?.querySelector('img[alt="Заверенный паспорт.pdf"]'))
      .not.toBeNull();
    expect(attachments?.querySelector('img[alt="Снимок.png"]'))
      .toBeNull();
    expect(attachments?.textContent).toContain("Обрабатываем…");
    expect(attachments?.querySelectorAll('a[rel="noopener noreferrer"]')).toHaveLength(2);
    expect(host.innerHTML).not.toContain("SECRET_S3_KEY");
    expect(writes()).toHaveLength(0);
  });
  it("original Next omits attachments block for visits without documents",async()=>{
    await mount("visit1");
    expect(host.querySelector('[aria-label="Вложения посещения"]')).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("retained Next details summary toggles one owner-verified visit inline",async()=>{
    stored=[visit(),visit("visit2")];
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <VetNextInlineHistoryHarness/>
    </QueryClientProvider>));
    await pause();
    expect(host.querySelectorAll("details")).toHaveLength(2);
    expect(host.querySelectorAll("details[open]")).toHaveLength(0);
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(fetcher.mock.calls.map(([url])=>url)).toEqual([base]);
    const summary=host.querySelector("details summary");
    expect(summary).not.toBeNull();
    await act(async()=>summary?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    expect(host.querySelectorAll("details[open]")).toHaveLength(1);
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
    expect(fetcher.mock.calls.map(([url])=>url)).toEqual([base,base+"/visit1"]);
    await act(async()=>summary?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    expect(host.querySelectorAll("details[open]")).toHaveLength(0);
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(writes()).toHaveLength(0);
    expect(host.innerHTML).not.toContain("SECRET_S3_KEY");
  });
  it("Next allows two independently expanded visits and private reads remain per visit",async()=>{
    stored=[visit(),{...visit("visit2"),diagnosis:"PRIVATE_DIAGNOSIS_B",
      notes:"PRIVATE_MEDICAL_B"}];
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <VetNextInlineHistoryHarness/>
    </QueryClientProvider>));
    await pause();
    const summaries=[...host.querySelectorAll("details summary")];
    expect(summaries).toHaveLength(2);
    await act(async()=>summaries[0]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    expect(host.querySelectorAll("details[open]")).toHaveLength(1);
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
    expect(host.textContent).not.toContain("PRIVATE_MEDICAL_B");
    await act(async()=>summaries[1]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    expect(host.querySelectorAll("details[open]")).toHaveLength(2);
    expect(host.textContent).toContain("PRIVATE_MEDICAL_B");
    expect(fetcher.mock.calls.map(([url])=>url)).toEqual([
      base,base+"/visit1",base+"/visit2",
    ]);
    await act(async()=>summaries[0]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    expect(host.querySelectorAll("details[open]")).toHaveLength(1);
    expect(host.querySelector("details[open]")?.textContent).toContain("PRIVATE_MEDICAL_B");
    expect(host.textContent).not.toContain("PRIVATE_NOTE");
    expect(writes()).toHaveLength(0);
    expect(host.innerHTML).not.toContain("SECRET_S3_KEY");
  });
  it("deleting one extra open visit leaves the other owner-verified visit expanded",async()=>{
    stored=[visit(),{...visit("visit2"),diagnosis:"SECOND_DELETE_DIAGNOSIS"}];
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <VetNextInlineHistoryHarness/>
    </QueryClientProvider>));
    await pause();
    const summaries=[...host.querySelectorAll("details summary")];
    for(const summary of summaries){
      await act(async()=>summary.dispatchEvent(new MouseEvent("click",{
        bubbles:true,cancelable:true,
      })));
      await pause();
    }
    expect(host.querySelectorAll("details[open]")).toHaveLength(2);
    const secondCard=host.querySelectorAll("details")[1];
    const removeButton=[...secondCard.querySelectorAll("button")].find(button=>
      button.textContent?.trim()==="Удалить запись");
    expect(removeButton).toBeDefined();
    await act(async()=>removeButton?.click());
    await pause();
    expect(stored.map(item=>item.id)).toEqual(["visit1"]);
    expect(host.querySelectorAll("details[open]")).toHaveLength(1);
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
    expect(host.textContent).not.toContain("SECOND_DELETE_DIAGNOSIS");
    expect(writes().map(([url,req])=>[url,req.method])).toEqual([
      [base+"/visit2","DELETE"],
    ]);
  });
  it("late second-visit Hono GET after closing its independent card stays private",async()=>{
    const second={...visit("visit2"),diagnosis:"LATE_PRIVATE_SECOND_VISIT",
      notes:"PRIVATE_SECOND_OWNER_NOTE"};
    stored=[visit(),second];
    let finish!:(value:Response)=>void;
    const pending=new Promise<Response>(resolve=>{finish=resolve;});
    const original=fetcher.getMockImplementation() as
      ((path:string,options:RequestInit)=>Promise<Response>)|undefined;
    if(!original)throw Error("MISSING_VET_TEST_GET");
    fetcher.mockImplementation((path:string,options:RequestInit)=>
      path===base+"/visit2"&&options.method==="GET"?pending:original(path,options));
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <VetNextInlineHistoryHarness/>
    </QueryClientProvider>));
    await pause();
    const summaries=[...host.querySelectorAll("details summary")];
    await act(async()=>summaries[0]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    await act(async()=>summaries[1]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    expect(host.querySelectorAll("details[open]")).toHaveLength(2);
    expect(host.textContent).not.toContain("LATE_PRIVATE_SECOND_VISIT");
    await act(async()=>summaries[1]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    await act(async()=>finish(response(second)));
    await pause();
    expect(host.querySelectorAll("details[open]")).toHaveLength(1);
    expect(host.textContent).not.toContain("LATE_PRIVATE_SECOND_VISIT");
    expect(host.innerHTML).not.toContain("SECRET_S3_KEY");
    expect(writes()).toHaveLength(0);
  });
  it("late second-visit Hono GET after A→B→A does not revive private notes",async()=>{
    const second={...visit("visit2"),diagnosis:"ROTATED_PRIVATE_SECOND_VISIT"};
    stored=[visit(),second];
    let finish!:(value:Response)=>void;
    const pending=new Promise<Response>(resolve=>{finish=resolve;});
    const original=fetcher.getMockImplementation() as
      ((path:string,options:RequestInit)=>Promise<Response>)|undefined;
    if(!original)throw Error("MISSING_VET_TEST_GET");
    fetcher.mockImplementation((path:string,options:RequestInit)=>
      path===base+"/visit2"&&options.method==="GET"?pending:original(path,options));
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <VetNextInlineHistoryHarness/>
    </QueryClientProvider>));
    await pause();
    const summaries=[...host.querySelectorAll("details summary")];
    await act(async()=>summaries[0]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    await act(async()=>summaries[1]?.dispatchEvent(new MouseEvent("click",{
      bubbles:true,cancelable:true,
    })));
    await pause();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"owner_B",username:"other",role:"USER"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,owner));
    await act(async()=>finish(response(second)));
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("ROTATED_PRIVATE_SECOND_VISIT");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(writes()).toHaveLength(0);
  });
  it("direct visit demands a separate exact owner detail GET", async () => {
    await mount("visit1");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([base, base + "/visit1"]);
    // The independent detail read may settle after the first list GET.
    // Wait only for the authorized diagnosis, not for an unverified placeholder.
    for(let attempt=0;attempt<20&&!host.textContent?.includes("PRIVATE_DIAGNOSIS");attempt++)
      await pause();
    expect(host.textContent).toContain("PRIVATE_DIAGNOSIS");
    expect(host.textContent).toContain("PRIVATE_CONCLUSION");
    expect(host.innerHTML).not.toContain("SECRET_S3_KEY");
  });
  it("create confirms only after POST201, exact GET and refreshed list", async () => {
    stored = [];
    await mount();
    await click("Добавить первую запись");
    await fill('input[type="date"]', date);
    await fill('input[maxlength="200"]', "Хирург");
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await pause();
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).toBe(base);
    expect(writes()[0][1].method).toBe("POST");
    expect(JSON.parse(String(writes()[0][1].body)).specialty).toBe("Хирург");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      base,
      base,
      base + "/fresh",
      base + "/fresh",
      base,
    ]);
    expect(host.textContent).toContain("Запись подтверждена");
    expect(host.textContent).toContain("Хирург");
  });
  it("create with one PDF sends exactly one multipart POST and verifies fresh detail", async () => {
    stored = [];
    await mount();
    await click("Добавить первую запись");
    await fill('input[type="date"]', date);
    await fill('input[maxlength="200"]', "Хирург");
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const doc = new File(["medical"], "medical.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { configurable: true, value: [doc] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await pause();
    expect(writes()).toHaveLength(2);
    expect(writes()[0][0]).toBe(base);
    expect(writes()[1][0]).toBe(base + "/fresh/attachments");
    expect(writes()[1][1].body).toBeInstanceOf(FormData);
    expect(writes()[1][1].headers).toMatchObject({ "X-Gafus-Auth-Transport": "cookie" });
    expect(stored[0].attachments).toHaveLength(1);
    expect(host.textContent).toContain("Запись подтверждена");
  });
  it("attachment POST loses ACK after record commit: no second create/upload", async () => {
    stored = [];
    const natural = fetcher.getMockImplementation() as (
      path: string,
      opts: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation(async (path: string, opts: RequestInit) => {
      if (path === base + "/fresh/attachments" && opts.method === "POST")
        throw new TypeError("CONNECTION_LOST_AFTER_UPLOAD");
      return natural(path, opts);
    });
    await mount();
    await click("Добавить первую запись");
    await fill('input[type="date"]', date);
    await fill('input[maxlength="200"]', "Хирург");
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["medical"], "medical.pdf", { type: "application/pdf" })],
    });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await pause();
    expect(host.textContent).toContain("Повтор заблокирован");
    expect(writes()).toHaveLength(2);
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(writes()).toHaveLength(2);
  });
  it("owner can delete an existing document exactly once with readback", async () => {
    stored[0].attachments = [
      {
        id: "doc-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 50,
        hasPreview: false,
        previewProcessing: false,
      },
    ];
    await mount("visit1");
    await click("Удалить вложение");
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).toBe(base + "/visit1/attachments/doc-1");
    expect(writes()[0][1].method).toBe("DELETE");
    expect(stored[0].attachments).toHaveLength(0);
    expect(host.textContent).toContain("Вложение удалено");
  });
  it("unknown POST503 never retries and fails closed to second action", async () => {
    stored = [];
    fetcher
      .mockImplementationOnce(async () => response([]))
      .mockImplementationOnce(async () => response(null, 503));
    await mount();
    await click("Добавить первую запись");
    await fill('input[type="date"]', date);
    await fill('input[maxlength="200"]', "Хирург");
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await pause();
    expect(host.textContent).toContain("Повтор заблокирован");
    expect(writes()).toHaveLength(1);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(writes()).toHaveLength(1);
  });
  it("foreign owner denial never reveals private detail or sends POST", async () => {
    fetcher.mockImplementation(async () => response(null, 404));
    await mount("visit1");
    expect(host.textContent).not.toContain("PRIVATE_DIAGNOSIS");
    expect(host.textContent).toContain("Не удалось получить историю");
    expect(writes()).toHaveLength(0);
  });
  it("Next visit editor guards accidental SPA navigation and tab close",async()=>{
    stored=[];
    await mount();
    await click("Добавить первую запись");
    const confirm=vi.mocked(window.confirm);
    confirm.mockReturnValue(false);
    const anchor=document.createElement("a");anchor.href="/courses";
    document.body.append(anchor);
    try {
      const outbound=new MouseEvent("click",{bubbles:true,cancelable:true});
      await act(async()=>anchor.dispatchEvent(outbound));
      expect(outbound.defaultPrevented).toBe(true);
      expect(confirm).toHaveBeenCalledWith(
        "Закрыть форму? Несохранённые изменения будут потеряны");
      const before=new Event("beforeunload",{cancelable:true});
      await act(async()=>window.dispatchEvent(before));
      expect(before.defaultPrevented).toBe(true);
      confirm.mockReturnValue(true);
      await click("Отмена");
      const confirmations=confirm.mock.calls.length;
      // Block jsdom's unimplemented native navigation in the test only.
      anchor.addEventListener("click",event=>event.preventDefault(),{once:true});
      const after=new MouseEvent("click",{bubbles:true,cancelable:true});
      await act(async()=>anchor.dispatchEvent(after));
      expect(confirm).toHaveBeenCalledTimes(confirmations);
      expect(fetcher.mock.calls.every(([,init])=>init.method==="GET")).toBe(true);
    }finally{anchor.remove();}
  });
  it("A to B to A retires old editor and blocks late mutation", async () => {
    await mount();
    await click("Добавить запись");
    await act(async () => {
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "other", role: "USER" });
      cache.setQueryData(CURRENT_USER_QUERY_KEY, owner);
    });
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.querySelector("form")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("delete once, fresh original GET must confirm absence", async () => {
    await mount("visit1");
    await click("Удалить запись");
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).toBe(base + "/visit1");
    expect(writes()[0][1].method).toBe("DELETE");
    expect(host.textContent).toContain("Запись удалена");
  });
});
