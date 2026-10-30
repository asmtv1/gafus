// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetDocuments } from "./PetDocuments";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { uploadPetDocument } from "./petDocumentsApi";

const doc = (overrides: Record<string, unknown> = {}) => ({
  id: "doc_01", petId: "pet_01", ownerId: "owner_A", name: "Паспорт.pdf",
  mimeType: "application/pdf", sizeBytes: 100, createdAt: "2026-10-20T12:00:00.000Z",
  updatedAt: "2026-10-20T12:00:00.000Z", url: "SECRET_STORAGE_LOCATION",
  ...overrides,
});
const payload = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status >= 200 && status < 300, data,
}), { status, headers: { "content-type": "application/json" } });
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let current: boolean;
let items: Record<string, unknown>[];
let fetcher: ReturnType<typeof vi.fn>;
let rejectUpload = false;
async function tick() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
async function mount(inCard = false) {
  await act(async () => root.render(<QueryClientProvider client={client}>
    <PetDocuments ownerId="owner_A" petId="pet_01"
      isCurrent={() => current} inCard={inCard} />
  </QueryClientProvider>));
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button"),
    ...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .find(node => node.textContent?.trim() === label);
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
  await tick();
}
function attachFile(file: File) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, "files", { configurable: true, value: { item: () => file } });
  return act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  current = true;
  items = [doc()];
  rejectUpload = false;
  fetcher = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/pets/pet_01/documents" && options.method === "GET")
      return payload(items);
    if (path === "/api/v1/pets/pet_01/documents" && options.method === "POST") {
      expect(options.body).toBeInstanceOf(FormData);
      if (rejectUpload) throw Error("UNCERTAIN_POST_ACK");
      const picked = (options.body as FormData).get("file") as File;
      const created = doc({ id: "doc_02", name: picked.name });
      items.push(created);
      return payload(created, 201);
    }
    if (path === "/api/v1/pets/pet_01/documents/doc_01" && options.method === "PUT") {
      expect(options.body).toBe(JSON.stringify({ name: "Новая справка.pdf" }));
      const renamed = doc({ name: "Новая справка.pdf" });
      items = [renamed];
      return payload(renamed);
    }
    if (path === "/api/v1/pets/pet_01/documents/doc_01" && options.method === "DELETE") {
      items = [];
      return payload(undefined);
    }
    if (path === "/api/v1/pets/pet_01/documents/doc_01/download" && options.method === "GET")
      return payload({ documentId: "doc_01", downloadUrl: "https://storage.example.test/signed?sig=private" });
    if (path === "/api/v1/pets/pet_01/documents/doc_02/download" && options.method === "GET")
      return payload({ documentId: "doc_02", downloadUrl: "https://storage.example.test/photo?sig=private" });
    throw Error(`UNEXPECTED_REQUEST_${options.method}_${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); host.remove(); vi.unstubAllGlobals();
});

describe("Next-parity owner pet documents Vite actions", () => {
  it("expanded Next document rows use shared compact olive/red glyph actions",async()=>{
    items=[doc(),doc({id:"doc_02",name:"Справка.png",mimeType:"image/png",
      createdAt:"2026-10-19T12:00:00.000Z"})];
    await mount(true);await tick();
    const add=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="+ Добавить документ");
    expect(add?.getAttribute("data-gafus-shared-button")).toBe("primary");
    await tick();
    const image=host.querySelector<HTMLImageElement>(
      '.pet-documents-list img[referrerpolicy="no-referrer"]');
    expect(image?.getAttribute("src")).toContain("storage.example.test/photo");
    expect(JSON.stringify(client.getQueryData(["pets","documents","owner_A","pet_01"])))
      .not.toContain("storage.example.test");
    const rows=host.querySelectorAll<HTMLLIElement>(".pet-documents-list > li");
    expect(rows).toHaveLength(2);
    for(const row of rows){
      expect(row.querySelectorAll("button > svg")).toHaveLength(3);
      expect(row.querySelectorAll('[data-gafus-shared-button="primary"]')).toHaveLength(1);
      expect(row.querySelectorAll('[data-gafus-shared-button="secondary"]')).toHaveLength(1);
      expect(row.textContent).not.toContain("Открыть или скачать");
      expect(row.textContent).not.toContain("Переименовать");
      expect(row.textContent).not.toContain("Удалить");
      expect(row.querySelector("button[aria-label^='Открыть документ']")).not.toBeNull();
    }
    const rename=rows[0]?.querySelector<HTMLButtonElement>(
      "button[aria-label^='Переименовать документ']");
    await act(async()=>rename?.click());await tick();
    expect(rows[0]?.querySelector('input[maxlength="250"]')).not.toBeNull();
    await click("Отмена");
    expect(fetcher.mock.calls.every(([,options])=>options.method==="GET")).toBe(true);
  });
  it("reads only on action, strips raw storage URL, resolves short-lived owner download", async () => {
    await mount();
    expect(fetcher).not.toHaveBeenCalled();
    await click("Документы питомца");
    expect(host.textContent).toContain("Паспорт.pdf");
    expect(host.innerHTML).not.toContain("SECRET_STORAGE_LOCATION");
    expect(JSON.stringify(client.getQueryData(["pets", "documents", "owner_A", "pet_01"])))
      .not.toContain("SECRET_STORAGE_LOCATION");
    await click("Открыть или скачать");
    const link = host.querySelector<HTMLAnchorElement>('a[target="_blank"]');
    expect(link?.getAttribute("href")).toContain("storage.example.test/signed");
    expect(link?.rel).toContain("noreferrer");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/pets/pet_01/documents/doc_01/download",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("Next-style in-page signed PDF preview, fullscreen, Escape, no URL in query cache",async()=>{
    await mount();await click("Документы питомца");
    await click("Открыть или скачать");
    const dialog=document.body.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toContain("Паспорт.pdf");
    expect(dialog?.querySelector('iframe[title="Паспорт.pdf"]')).not.toBeNull();
    expect(dialog?.querySelector("button")?.textContent).toBeDefined();
    expect(document.activeElement?.textContent).toContain("Закрыть просмотр");
    expect(JSON.stringify(client.getQueryData(["pets","documents","owner_A","pet_01"])))
      .not.toContain("storage.example.test");
    await click("Развернуть на весь экран");
    expect(document.body.textContent).toContain("Свернуть с полного экрана");
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.innerHTML).not.toContain("storage.example.test");
    expect(fetcher.mock.calls.every(([,options])=>options.method==="GET")).toBe(true);
  });
  it("Next document viewer navigates to another exact signed GET without mutations",async()=>{
    items=[doc(),doc({id:"doc_02",name:"Справка.png",mimeType:"image/png",
      createdAt:"2026-10-19T12:00:00.000Z"})];
    await mount();await click("Документы питомца");
    await click("Открыть или скачать");
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    await click("Следующий документ");
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("aria-label"))
      .toContain("Справка.png");
    expect(document.body.querySelector('[role="dialog"] img[alt="Справка.png"]')).not.toBeNull();
    expect(fetcher.mock.calls.map(([url])=>url)).toEqual([
      "/api/v1/pets/pet_01/documents",
      "/api/v1/pets/pet_01/documents/doc_01/download",
      "/api/v1/pets/pet_01/documents/doc_02/download",
    ]);
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true})));
    await tick();
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("aria-label"))
      .toContain("Паспорт.pdf");
    expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith("/download")))
      .toHaveLength(3);
    await click("Скрыть документы");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.innerHTML).not.toContain("storage.example.test");
  });
  it("Next document dialog traps Tab/Shift+Tab and restores its opening trigger",async()=>{
    await mount();await click("Документы питомца");
    const trigger=host.querySelector<HTMLButtonElement>(".pet-documents-list button");
    expect(trigger?.textContent?.trim()).toBe("Открыть или скачать");
    await click("Открыть или скачать");
    expect(document.activeElement?.textContent).toContain("Закрыть просмотр");
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Tab",bubbles:true,cancelable:true,
    })));
    expect(document.activeElement?.textContent).toContain("Поделиться");
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Tab",shiftKey:true,bubbles:true,cancelable:true,
    })));
    expect(document.activeElement?.textContent).toContain("Закрыть просмотр");
    await click("Поделиться");
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Tab",bubbles:true,cancelable:true,
    })));
    expect(document.body.querySelector('[role="dialog"]')?.contains(document.activeElement))
      .toBe(true);
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Escape",bubbles:true,cancelable:true,
    })));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.innerHTML).not.toContain("storage.example.test");
    expect(fetcher.mock.calls.every(([,options])=>options.method==="GET")).toBe(true);
  });
  it("original Next share panel reveals signed link only after explicit click",async()=>{
    await mount();await click("Документы питомца");
    await click("Открыть или скачать");
    expect(document.body.querySelector('[aria-label="Ссылка на документ"]')).toBeNull();
    await click("Поделиться");
    const input=document.body.querySelector<HTMLInputElement>(
      '[aria-label="Ссылка на документ"]');
    expect(input?.readOnly).toBe(true);
    expect(input?.value).toContain("storage.example.test/signed");
    expect(JSON.stringify(client.getQueryData(["pets","documents","owner_A","pet_01"])))
      .not.toContain("storage.example.test");
    await click("Поделиться");
    expect(document.body.querySelector('[aria-label="Ссылка на документ"]')).toBeNull();
    await click("Закрыть просмотр");
    expect(document.body.innerHTML).not.toContain("storage.example.test");
    expect(fetcher.mock.calls.every(([,options])=>options.method==="GET")).toBe(true);
  });
  it("share copies only after user action and clears link on document switch",async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);
    const old=Object.getOwnPropertyDescriptor(navigator,"clipboard");
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
    try {
      items=[doc(),doc({id:"doc_02",name:"Справка.png",mimeType:"image/png",
        createdAt:"2026-10-19T12:00:00.000Z"})];
      await mount();await click("Документы питомца");
      await click("Открыть или скачать");
      await click("Поделиться");
      expect(writeText).not.toHaveBeenCalled();
      await click("Скопировать");
      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        "https://storage.example.test/signed?sig=private");
      expect(document.body.textContent).toContain("Скопировано");
      await click("Следующий документ");
      expect(document.body.querySelector('[aria-label="Ссылка на документ"]')).toBeNull();
      expect(document.body.textContent).not.toContain("Скопировано");
      expect(JSON.stringify(client.getQueryData(["pets","documents","owner_A","pet_01"])))
        .not.toContain("storage.example.test");
    } finally {
      if(old)Object.defineProperty(navigator,"clipboard",old);
      else Reflect.deleteProperty(navigator,"clipboard");
    }
  });
  it("late clipboard acknowledgement cannot mark a reopened share panel copied",async()=>{
    let complete!:(value:void)=>void;
    const pending=new Promise<void>(resolve=>{complete=resolve;});
    const writeText=vi.fn().mockReturnValue(pending);
    const old=Object.getOwnPropertyDescriptor(navigator,"clipboard");
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
    try {
      await mount();await click("Документы питомца");
      await click("Открыть или скачать");
      await click("Поделиться");await click("Скопировать");
      expect(writeText).toHaveBeenCalledTimes(1);
      await click("Поделиться");await click("Поделиться");
      await act(async()=>complete());
      expect(document.body.textContent).not.toContain("Скопировано");
      expect(document.body.querySelector('[aria-label="Ссылка на документ"]'))
        .not.toBeNull();
      expect(JSON.stringify(client.getQueryData(["pets","documents","owner_A","pet_01"])))
        .not.toContain("storage.example.test");
    } finally {
      if(old)Object.defineProperty(navigator,"clipboard",old);
      else Reflect.deleteProperty(navigator,"clipboard");
    }
  });
  it("share reports missing clipboard without falsely claiming success",async()=>{
    const old=Object.getOwnPropertyDescriptor(navigator,"clipboard");
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:undefined});
    try {
      await mount();await click("Документы питомца");
      await click("Открыть или скачать");
      await click("Поделиться");await click("Скопировать");
      expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent)
        .toContain("Не удалось скопировать ссылку");
      expect(document.body.textContent).not.toContain("Скопировано");
    } finally {
      if(old)Object.defineProperty(navigator,"clipboard",old);
      else Reflect.deleteProperty(navigator,"clipboard");
    }
  });
  it("late signed URL GET cannot reopen a viewer after owner closes the section",async()=>{
    let resolveDownload!:(value:Response)=>void;
    const pending=new Promise<Response>(resolve=>{resolveDownload=resolve;});
    const old=fetcher.getMockImplementation() as
      ((path:string,options:RequestInit)=>Promise<Response>)|undefined;
    if (!old) throw Error("MISSING_DOCUMENT_TEST_FETCHER");
    fetcher.mockImplementation((path:string,options:RequestInit)=>
      path.endsWith("/doc_01/download")?pending:old(path,options));
    await mount();await click("Документы питомца");
    await click("Открыть или скачать");
    await click("Скрыть документы");
    await act(async()=>resolveDownload(payload({documentId:"doc_01",
      downloadUrl:"https://storage.example.test/signed?sig=LATE_PRIVATE"})));
    await tick();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(host.innerHTML).not.toContain("LATE_PRIVATE");
    expect(JSON.stringify(client.getQueryData(["pets","documents","owner_A","pet_01"])))
      .not.toContain("LATE_PRIVATE");
    expect(fetcher.mock.calls.filter(([_,req])=>req.method!=="GET")).toHaveLength(0);
  });
  it("POST multipart → confirmed list, no locally invented success", async () => {
    items = [];
    client.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_A", username: "owner", role: "USER" });
    client.setQueryData(["pets", "mine", "owner_A"], [{
      id: "pet_01", name: "Рекс", type: "DOG", breed: "Метис",
      showInProfile: true, documentCount: 0, preventionCount: 2,
    }]);
    await mount();
    await click("Документы питомца");
    expect(host.textContent).toContain("Документов пока нет");
    await attachFile(new File(["pdf"], "Справка.pdf", { type: "application/pdf" }));
    await click("Загрузить документ");
    expect(host.textContent).toContain("Справка.pdf");
    expect(host.textContent).toContain("Документ загружен");
    expect(client.getQueryData<{documentCount:number}[]>(
      ["pets","mine","owner_A"])?.[0]?.documentCount).toBe(1);
    expect(fetcher.mock.calls.map(([_, options]) => options.method)).toEqual([
      "GET", "POST", "GET",
    ]);
  });

  it("Next expanded card accepts a custom document name in a single multipart POST",async()=>{
    items=[];
    await mount(true);
    await tick();
    expect(host.textContent).toContain("+ Добавить документ");
    expect(host.textContent).not.toContain("Загрузить документ");
    await attachFile(new File(["pdf"],"Карта.pdf",{type:"application/pdf"}));
    await tick();
    const name=host.querySelector<HTMLInputElement>('input[maxlength="250"]');
    expect(name).not.toBeNull();
    expect(name?.value).toBe("Карта");
    await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
      setter?.call(name,"Новая справка");
      name?.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await click("Сохранить");
    const write=fetcher.mock.calls.filter(([,req])=>req.method==="POST");
    expect(write).toHaveLength(1);
    const file=(write[0]?.[1]?.body as FormData).get("file") as File;
    expect(file.name).toBe("Новая справка.pdf");
    expect(host.textContent).toContain("Новая справка.pdf");
    expect(host.textContent).toContain("Документ загружен");
    expect(fetcher.mock.calls.filter(([,req])=>req.method==="PUT")).toHaveLength(0);
  });

  it("invalid pending document filename is denied before any HTTP write",async()=>{
    items=[];
    await mount(true);
    await attachFile(new File(["pdf"],"Карта.pdf",{type:"application/pdf"}));
    await tick();
    const name=host.querySelector<HTMLInputElement>('input[maxlength="250"]');
    await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
      setter?.call(name,"../../private");
      name?.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await click("Сохранить");
    expect(host.textContent).toContain("Название документа");
    expect(fetcher.mock.calls.filter(([,req])=>req.method!=="GET")).toHaveLength(0);
    await click("Отмена");
    expect(host.querySelector('input[maxlength="250"]')).toBeNull();
    expect(fetcher.mock.calls.filter(([,req])=>req.method!=="GET")).toHaveLength(0);
  });

  it("lost multipart POST ACK blocks duplicate upload until deliberate owner GET review", async () => {
    items = [];
    rejectUpload = true;
    await mount(); await click("Документы питомца");
    await attachFile(new File(["file-content"], "Карта.pdf", { type: "application/pdf" }));
    await click("Загрузить документ");
    expect(host.textContent).toContain("Результат последней загрузки неизвестен");
    const submit = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent?.trim() === "Загрузить документ");
    expect(submit?.disabled).toBe(true);
    expect(fetcher.mock.calls.filter(([_, options]) => options.method === "POST"))
      .toHaveLength(1);
    await click("Проверить список перед новой отправкой");
    expect(host.textContent).toContain("Список документов перечитан");
    expect(submit?.disabled).toBe(false);
    expect(fetcher.mock.calls.filter(([_, options]) => options.method === "POST"))
      .toHaveLength(1);
    expect(fetcher.mock.calls.filter(([_, options]) => options.method === "GET"))
      .toHaveLength(3);
  });

  it("rename, owner readback, confirmed delete and no stale list", async () => {
    await mount(); await click("Документы питомца");
    await click("Переименовать");
    const input = host.querySelector<HTMLInputElement>('input[maxlength="250"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Новая справка.pdf");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Сохранить");
    expect(host.textContent).toContain("Новая справка.pdf");
    expect(host.textContent).toContain("Документ переименован");
    await click("Удалить");
    expect(host.querySelector('[aria-label="Подтверждение удаления документа"]'))
      .not.toBeNull();
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "DELETE")).toHaveLength(0);
    await click("Да, удалить документ");
    expect(host.textContent).toContain("Документов пока нет");
    expect(host.textContent).toContain("Документ удалён");
    expect(fetcher.mock.calls.map(([_, options]) => options.method)).toEqual([
      "GET", "PUT", "GET", "DELETE", "GET",
    ]);
  });

  it("cancelling inline document deletion sends no DELETE and preserves owner list", async () => {
    await mount(); await click("Документы питомца");
    await click("Удалить");
    expect(host.querySelector('[aria-label="Подтверждение удаления документа"]'))
      .not.toBeNull();
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "DELETE")).toHaveLength(0);
    await click("Не удалять");
    expect(host.querySelector('[aria-label="Подтверждение удаления документа"]')).toBeNull();
    expect(host.textContent).toContain("Паспорт.pdf");
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "DELETE")).toHaveLength(0);
  });
  it("denies other owner document even on HTTP200 without rendering private metadata", async () => {
    items = [doc({ ownerId: "owner_B", name: "Секретный документ.pdf" })];
    await mount(); await click("Документы питомца");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Секретный документ.pdf");
    expect(host.innerHTML).not.toContain("SECRET_STORAGE_LOCATION");
  });

  it("invalid MIME is refused client-side before POST", async () => {
    await expect(uploadPetDocument("pet_01", "owner_A",
      new File(["text"], "unsafe.txt", { type: "text/plain" }))).rejects.toThrow("PDF");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
