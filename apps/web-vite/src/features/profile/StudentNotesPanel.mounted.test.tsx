// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentNotesPanel } from "./StudentNotesPanel";

const server = vi.hoisted(() => ({getStudentNotes:vi.fn()}));
vi.mock("./studentNotesApi", () => ({getStudentNotes:server.getStudentNotes}));
let host:HTMLDivElement,root:Root,query:QueryClient,owner:boolean;
async function render() {
  await act(async()=>root.render(<QueryClientProvider client={query}>
    <StudentNotesPanel ownerId="WEB1-owner" isCurrent={()=>owner} />
  </QueryClientProvider>));
}
const flush=()=>act(async()=>new Promise(ok=>setTimeout(ok,15)));
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  owner=true;server.getStudentNotes.mockReset();
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
});
afterEach(async()=>{
  await act(async()=>root.unmount());query.clear();host.remove();
});
describe("WEB1 retained Next source notes presentation and actor guard",()=>{
  it("uses original Next red centered error class and prefix without echoing private transport details",async()=>{
    server.getStudentNotes.mockRejectedValue(new Error("PRIVATE_WORK_SQL_CONNECTION_STRING"));
    await render();await flush();
    const alert=host.querySelector('[role="alert"]');
    const source=alert?.querySelector("p");
    expect(source?.className).toContain("error");
    expect(source?.textContent).toBe("Ошибка: Не удалось загрузить заметки тренера.");
    expect(host.textContent).not.toContain("PRIVATE_WORK_SQL_CONNECTION_STRING");
    expect(alert?.querySelector("button")?.textContent).toContain("Повторить загрузку");
    expect(server.getStudentNotes).toHaveBeenCalledTimes(1);
  });
  it("renders original 168px inline mascot while actual owner GET has not settled",async()=>{
    server.getStudentNotes.mockImplementation(()=>new Promise(()=>undefined));
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Загрузка заметок…");
    expect(host.querySelector<HTMLImageElement>('img[src="/images/loading-mascot-router-poster.webp"]')?.width).toBe(168);
    expect(host.querySelector<HTMLImageElement>('img[src="/images/loading-mascot-router.webp"]')?.height).toBe(168);
    expect(server.getStudentNotes).toHaveBeenCalledTimes(1);
  });
  it("shows source empty copy and its icon after registered owner GET",async()=>{
    server.getStudentNotes.mockResolvedValue([]);
    await render();await flush();
    expect(host.textContent).toContain("Пока нет заметок от кинолога");
    expect(host.textContent).not.toContain("Загрузка заметок…");
  });
  it("does not issue notes GET to an account that ceased to be current",async()=>{
    owner=false;
    await render();
    expect(server.getStudentNotes).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
  });
  it("matches original Next epoch equality when detecting edited note entries",async()=>{
    server.getStudentNotes.mockResolvedValue([{
      id:"same-instant-note",title:"Запись кинолога",trainerName:"Кинолог А",
      createdAt:"2026-10-25T00:00:00.000Z",entries:[{
        id:"same-instant-entry",content:"Без изменений",order:0,
        createdAt:"2026-10-25T00:30:00.000Z",
        updatedAt:"2026-10-25T03:30:00.000+03:00",
      }],
    }]);
    await render();await flush();
    expect(host.textContent).toContain("Без изменений");
    expect(host.textContent).not.toContain("Изменено:");
    expect(server.getStudentNotes).toHaveBeenCalledTimes(1);
  });
  it("preserves source Next truthy-title semantics, including whitespace-only titles",async()=>{
    // Retained Next StudentNotes.tsx tests `note.title` directly. `.trim()`
    // previously removed this source-authored heading and border, causing
    // a visible geometry difference for otherwise-valid server text.
    server.getStudentNotes.mockResolvedValue([{
      id:"source-title",title:"   ",tags:[],trainerName:"Кинолог А",
      createdAt:"2026-10-25T00:00:00.000Z",entries:[],
    }]);
    await render();await flush();
    const heading=host.querySelector("[data-note-id=\"source-title\"] h3");
    expect(heading?.textContent).toBe("   ");
    expect(heading?.className).toContain("noteTitle");
  });
  it("hides a late success immediately when actor switches",async()=>{
    let settle!:(value:unknown)=>void;
    server.getStudentNotes.mockImplementation(()=>new Promise(ok=>{settle=ok;}));
    await render();
    owner=false;await render();
    await act(async()=>settle([{id:"late-note",entries:[]}]));
    expect(host.textContent).toBe("");
  });
});
