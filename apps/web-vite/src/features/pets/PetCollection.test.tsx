// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PetCollection } from "./PetCollection";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

afterEach(() => vi.unstubAllGlobals());

async function show(response: Response, verifiedOwner = true) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (verifiedOwner) cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"u1",username:"owner",role:"USER"});
  else cache.setQueryData(["pets","mine","u1"],[{
    id:"private_old_pet",name:"PRIVATE_STALE_NAME",type:"DOG",breed:"Метис",
    showInProfile:true,notes:"PRIVATE_STALE_MEDICAL",
  }]);
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache },
    createElement(PetCollection, { userId: "u1" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  return {
    container, cache,
    cleanup: async () => {
      await act(async () => root.unmount());
      cache.clear(); container.remove();
    },
  };
}

describe("pets list UI", () => {
  it("renders owned pets and respects visibility without showing notes", async () => {
    const result = await show(new Response(JSON.stringify({
      success: true,
      data: [{
        id: "pet-1", name: "Рекс", type: "DOG", breed: "Лабрадор",
        showInProfile: false, notes: "VETERINARY_PRIVATE",
        _count: { preventionEntries: 2, documents: 3 },
      }],
    }), { status: 200 }));
    try {
      expect(result.container.textContent).toContain("Рекс");
      // Source Next uses the collapsed footer for private section summaries,
      // not a duplicate visibility label. Its owner switch is tested separately.
      expect(result.container.textContent).toContain("Процедуры · 2");
      expect(result.container.textContent).toContain("Документы · 3");
      expect(result.container.textContent).not.toContain("VETERINARY_PRIVATE");
      expect(JSON.stringify(result.cache.getQueryData(["pets", "mine", "u1"])))
        .not.toContain("VETERINARY_PRIVATE");
    } finally { await result.cleanup(); }
  });

  it("denies absent verified auth before GET or stale cached owner render", async () => {
    const response=new Response(JSON.stringify({success:true,data:[]}),{status:200});
    const result=await show(response,false);
    try {
      expect(result.container.querySelector('[role="alert"]')?.textContent)
        .toContain("Сессия изменилась");
      expect(result.container.textContent).not.toContain("PRIVATE_STALE_NAME");
      expect(result.container.textContent).not.toContain("PRIVATE_STALE_MEDICAL");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally { await result.cleanup(); }
  });
  it("does not show an empty state on backend 500", async () => {
    const result = await show(new Response(JSON.stringify({
      success: false, error: "unavailable",
    }), { status: 500 }));
    try {
      expect(result.container.querySelector('[role="alert"]')).toBeTruthy();
      expect(result.container.textContent).not.toContain("Питомцы пока не добавлены");
    } finally { await result.cleanup(); }
  });
});
