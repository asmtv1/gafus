// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { CURRENT_USER_QUERY_KEY } from "./shared/auth/useAuth";

const publicCourse = {
  id: "public-1",
  name: "Курс для гостей",
  type: "basic",
  shortDesc: "Можно посмотреть без аккаунта",
  duration: "5 дней",
  isPaid: false,
  isPrivate: false,
  hasAccess: true,
  isFavorite: false,
  userStatus: "NOT_STARTED",
  trainingLevel: "BEGINNER",
};

// Vite/Vitest may transform a cold React.lazy route *after* the first render.
// Wait for the actual API/UI condition without weakening protected-route assertions.
async function waitForLazyRoute(condition: () => boolean, label: string, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  }
  expect(condition(), label).toBe(true);
}

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Vite SPA guest flow", () => {
  it("global gallery integration does not show a false session-change warning on guest landing", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      paths.push(path);
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
      });
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache },
        <App showGalleryOptIn />,
      )));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
      expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
      expect(host.textContent).not.toContain("Сессия изменилась");
      expect(host.textContent).not.toContain("Личные данные временно скрыты");
      expect(paths.every(path => path === "/api/v1/auth/me" ||
        path === "/api/v1/auth/refresh" ||
        path === "/api/v1/public/platform-stats")).toBe(true);
    } finally {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
    }
  });

  it("guest deep-link to /pets never fetches protected data", async () => {
    window.history.replaceState(null, "", "/pets");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      paths.push(path);
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
      });
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      expect(window.location.pathname).toBe("/");
      expect(container.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
      expect(paths.slice(0,2)).toEqual(["/api/v1/auth/me", "/api/v1/auth/refresh"]);
      expect(paths.slice(2).every(path=>path==="/api/v1/public/platform-stats")).toBe(true);
      expect(paths).not.toContain("/api/v1/pets");
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      container.remove();
    }
  });

  it("guest direct question URL never requests an authenticated discussion", async () => {
    window.history.replaceState(null, "", "/questions/question-1");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      paths.push(path);
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
      });
    }));
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(window.location.pathname).toBe("/");
      expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
      expect(paths.slice(0,2)).toEqual(["/api/v1/auth/me", "/api/v1/auth/refresh"]);
      expect(paths.slice(2).every(path=>path==="/api/v1/public/platform-stats")).toBe(true);
      expect(paths.some(path => path.startsWith("/api/v1/questions"))).toBe(false);
    } finally {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
    }
  });

  it("unknown path renders a 404-style screen without fetching private API data", async () => {
    window.history.replaceState(null, "", "/admin-secret");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // A genuinely pending identity GET (not an undefined fetch stub that
    // rejects immediately) must guard an unknown private deep link.
    const fake = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fake);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      // Next also treats unknown non-public paths as private for guests.
      // This unresolved /auth/me request is not proof of a guest yet.
      expect(container.textContent).toContain("Проверяем сессию");
      expect(container.textContent).not.toContain("Страница не найдена");
      expect(fake).toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      container.remove();
    }
  });


  it("shows authenticated profile and personal course catalog from Hono DTOs", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      paths.push(path);
      const data = path === "/api/v1/user/profile"
        ? {
            id: "test-user",
            username: "tester",
            profile: { fullName: "Кинолог", city: "Казань", about: "Профиль" },
          }
        : path === "/api/v1/pets"
          ? [{
            id: "dog-1", name: "Бим", type: "DOG",
            breed: "Метис", showInProfile: true,
          }]
          : path === "/api/v1/articles"
            ? [{
              id: "article-1", slug: "text", title: "Материал о собаках",
              description: "Полезный текст", visibility: "PAID",
              hasAccess: false, likeCount: 2, authorUsername: "trainer",
            }]
            : [{ ...publicCourse, name: "Мой курс", isFavorite: true }];
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "test-user", username: "tester", role: "TRAINER",
    });
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      // Route-level React.lazy resolves asynchronously before it can issue GETs.
      // Assert the actual request and content, not the first render tick.
      await waitForLazyRoute(() => paths.includes("/api/v1/courses") &&
        Boolean(container.textContent?.includes("Мой курс")), "course catalog loaded");
      expect(paths).toContain("/api/v1/courses");
      expect(paths).not.toContain("/api/v1/public/courses");
      expect(container.textContent).toContain("Мой курс");
      const menuToggle = container.querySelector<HTMLButtonElement>(
        '[role="banner"] button[aria-label="Открыть меню"]');
      expect(menuToggle).not.toBeNull();
      expect(container.querySelector('[role="banner"] button')?.textContent).toContain("Назад");
      expect(container.querySelectorAll("[role=contentinfo]")).toHaveLength(1);
      expect(container.querySelectorAll("main.shell")).toHaveLength(1);
      expect(container.querySelectorAll("#main-content")).toHaveLength(1);
      expect(container.textContent).not.toContain("GAFUS Refactor");
      expect(container.textContent).not.toContain("локальном mock API");
      expect([...container.querySelectorAll<HTMLAnchorElement>(
        'nav[aria-label="Разделы"] a')]
        .map(link => link.getAttribute("href"))).toEqual(expect.arrayContaining([
          "/courses", "/profile", "/pets", "/articles", "/questions", "/moments",
        ]));
      expect(container.querySelector('nav[aria-label="Разделы"]')?.hasAttribute("hidden"))
        .toBe(true);
      expect(container.querySelector("[aria-label=Разделы] a[aria-current=page]")
        ?.getAttribute("href")).toBe("/courses");
      const select = async (label: string) => {
        await act(async () => { menuToggle?.click(); });
        expect(container.querySelector('nav[aria-label="Разделы"]')?.hasAttribute("hidden"))
          .toBe(false);
        const link = [...container.querySelectorAll<HTMLAnchorElement>(
          'nav[aria-label="Разделы"] a')].find(item => item.textContent?.trim() === label);
        expect(link, label).toBeDefined();
        await act(async () => {
          link?.dispatchEvent(new MouseEvent("click", {
            bubbles: true, cancelable: true, button: 0 }));
        });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      };
      await select("Профиль");
      await waitForLazyRoute(() => paths.includes("/api/v1/user/profile") &&
        Boolean(container.textContent?.includes("Кинолог")), "profile loaded");
      expect(paths).toContain("/api/v1/user/profile");
      expect(container.textContent).toContain("Кинолог");
      expect(container.textContent).toContain("Казань");
      await select("Питомцы");
      for(let attempt=0; attempt<20 && !paths.includes("/api/v1/pets"); attempt++) {
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      }
      expect(paths, JSON.stringify(paths)).toContain("/api/v1/pets");
      for(let attempt=0;attempt<8&&!container.textContent?.includes("Бим");attempt++){
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      }
      expect(container.textContent).toContain("Бим");
      await select("Статьи");
      for (let attempt=0; attempt<20 && !paths.includes("/api/v1/articles"); attempt++) {
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      }
      expect(paths).toContain("/api/v1/articles");
      for(let attempt=0;attempt<8&&
        !container.textContent?.includes("Материал о собаках");attempt++){
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      }
      expect(container.textContent).toContain("Материал о собаках");
      expect(container.querySelector("[aria-label=Разделы] a[aria-current=page]")
        ?.getAttribute("href")).toBe("/articles");
      expect(container.querySelector("a[href$=questions]")).not.toBeNull();
      await act(async () => {
        window.history.back();
        await new Promise(resolve => setTimeout(resolve, 40));
      });
      expect(window.location.pathname).toBe("/pets");
      expect(container.querySelector("[aria-label=Разделы] a[aria-current=page]")
        ?.getAttribute("href")).toBe("/pets");
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      container.remove();
    }
  });


  it("lazy question route loads only authenticated Hono questions data", async () => {
    window.history.replaceState(null, "", "/questions");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ success: true, data: {
        items: [{ id: "question-1", title: "Помощь со щенком", body: "Как учить?",
          category: "Поведение", status: "waiting", answerCount: 0,
          createdAt: "2026-10-16T00:00:00.000Z", author: { name: "Владелец" },
        }], nextPage: null, canPublish: true, blockReason: null,
      } }), { status: 200 });
    }));
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "user-1", username: "owner", role: "USER",
    });
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      // Suspense resolves the module first, then Query notifies observers.
      for (let attempt = 0; attempt < 60 && !host.textContent?.includes("Помощь со щенком");
        attempt++) {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      }
      // Authenticated global onboarding is a legitimate independent GET.
      expect(urls).toContain("/api/v1/user/onboarding-tour");
      expect(urls.filter(url=>url.startsWith("/api/v1/questions"))).toEqual([
        "/api/v1/questions?page=1&sort=new&mine=false",
      ]);
      expect(host.textContent).toContain("Помощь со щенком");
      expect(host.querySelector('a[href="/questions/new"]')).not.toBeNull();
      expect(host.querySelector('a[href="/questions/question-1"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
    }
  });

  it("requires login when course-day access expires after an authenticated catalog", async () => {
    window.history.replaceState(null, "", "/trainings/course-expired/day-1");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      requests.push(path);
      if (path === "/api/v1/auth/me") return new Response(JSON.stringify({
        success: true, data: { id: "user-1", username: "synthetic", role: "USER" },
      }), { status: 200 });
      return new Response(JSON.stringify({ success: false, error: "UNAUTHORIZED" }), {
        status: 401,
      });
    }));
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "user-1", username: "synthetic", role: "USER",
    });
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      for (let i = 0; i < 20 && !host.textContent?.includes("Сессия завершена"); i++) {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      }
      expect(requests).toContain("/api/v1/courses");
      expect(host.textContent).toContain("Сессия завершена. Войдите снова.");
      expect(host.querySelector('a[href="/login"]')).not.toBeNull();
      expect(host.textContent).not.toContain("Курс недоступен или не найден");
      expect(requests.some(path => path.startsWith("/api/v1/training/"))).toBe(false);
    } finally {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
    }
  });

  it("guest / renders only the original Next landing, without mounting any catalog", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      fetched.push(path);
      const stats = path === "/api/v1/public/platform-stats";
      return new Response(JSON.stringify(stats
        ? { success: true, data: { students: 47 } }
        : { success: false, error: "UNAUTHORIZED" }), {
        status: stats ? 200 : 401,
      });
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    try {
      await act(async () => {
        root.render(createElement(QueryClientProvider, { client: cache }, createElement(App)));
      });
      for (let attempt=0; attempt<20 && !container.querySelector('[data-ui-parity="legacy-landing"]'); attempt++) {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      }
      expect(fetched.slice(0,2)).toEqual([
        "/api/v1/auth/me", "/api/v1/auth/refresh",
      ]);
      expect(fetched.slice(2).every(path=>path==="/api/v1/public/platform-stats")).toBe(true);
      expect(fetched).not.toContain("/api/v1/public/courses");
      expect(fetched).not.toContain("/api/v1/courses");
      expect(container.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
      expect(container.querySelector(".course-grid")).toBeNull();
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelectorAll('.gafus-public-landing svg[class*="pathCardIcon"]')).toHaveLength(5);
      for(let i=0;i<20&&!container.textContent?.includes("С нами уже учатся");i++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      expect(container.textContent).toContain("С нами уже учатся");
      expect(container.textContent).not.toContain("Открытые курсы");
      expect(container.textContent).not.toContain("Курс для гостей");
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      container.remove();
    }
  });

  it("public / remains readable during transient auth outage, without a course query",async()=>{
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    const calls:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(path:string)=>{
      calls.push(path);
      const stats=path==="/api/v1/public/platform-stats";
      return new Response(JSON.stringify(stats?
        {success:true,data:{students:53}}:
        {success:false,error:"Temporary auth outage"}),{status:stats?200:503});
    }));
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);
    const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
    try{
      await act(async()=>root.render(createElement(
        QueryClientProvider,{client:cache},createElement(App),
      )));
      for(let i=0;i<35&&!host.querySelector('[data-ui-parity="legacy-landing"]');i++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
      expect(host.textContent).toContain("ГАФУС");
      expect(host.textContent).not.toContain("Открытые курсы");
      expect(calls.some(p=>p==="/api/v1/public/courses"||p==="/api/v1/courses"))
        .toBe(false);
      expect(window.location.pathname).toBe("/");
    }finally{await act(async()=>root.unmount());cache.clear();host.remove();}
  });

  it("/courses guest matches Next middleware: replace URL with public presentation",async()=>{
    window.history.replaceState(null,"","/courses");
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    const fetched:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(path:string)=>{
      fetched.push(path);
      const publicData=path==="/api/v1/public/courses";
      return new Response(JSON.stringify(publicData
        ? {success:true,data:[publicCourse]}
        : {success:false,error:"UNAUTHORIZED"}),{status:publicData?200:401});
    }));
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);
    const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
    try{
      await act(async()=>root.render(createElement(
        QueryClientProvider,{client:cache},createElement(App),
      )));
      for(let i=0;i<40&&!host.querySelector('[data-ui-parity="legacy-landing"]');i++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      expect(window.location.pathname).toBe("/");
      expect(host.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
      expect(host.textContent).not.toContain("Курс для гостей");
      expect(fetched).not.toContain("/api/v1/public/courses");
      expect(fetched).not.toContain("/api/v1/courses");
    }finally{await act(async()=>root.unmount());cache.clear();host.remove();}
  });

  it("VK authorization fails closed if start request is unauthorized",async()=>{
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    const fetched:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(path:string)=>{
      fetched.push(path);
      return new Response(JSON.stringify({success:false,error:"Unauthorized"}),{status:401});
    }));
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);
    const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
    try{
      await act(async()=>root.render(createElement(
        QueryClientProvider,{client:cache},createElement(App),
      )));
      for(let i=0;i<40&&!host.querySelector('[data-ui-parity="legacy-landing"]');i++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      const control=[...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(x=>x.textContent?.includes("Войти через VK"));
      expect(control).toBeDefined();
      await act(async()=>control?.click());
      // No OAuth redirect on unsuccessful start; never leave the app for
      // arbitrary untrusted endpoints. The UI reports a safe retry message.
      expect(host.textContent).toContain("Вход через VK временно недоступен");
      expect(host.querySelector('a[href="/login"]')).not.toBeNull();
      expect(fetched).toContain("/api/v1/auth/vk-web/start");
      expect(window.location.pathname).toBe("/");
    }finally{await act(async()=>root.unmount());cache.clear();host.remove();}
  });

  it("verified signed-in / redirects to /courses without ever mounting a home catalog", async () => {
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    const fetched:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(path:string)=>{
      fetched.push(path);
      const data=path==="/api/v1/auth/me"?
        {id:"owner-1",username:"owner",role:"USER"}:
        path==="/api/v1/courses"?[{...publicCourse,name:"Курс владельца"}]:null;
      return new Response(JSON.stringify({success:data!==null,data,
        ...(data===null?{error:"Unavailable"}:{})}),{status:data===null?401:200});
    }));
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);
    const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
    try{
      await act(async()=>root.render(createElement(
        QueryClientProvider,{client:cache},createElement(App),
      )));
      for(let i=0;i<40&&window.location.pathname!=="/courses";i++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
      expect(window.location.pathname).toBe("/courses");
      expect(host.querySelector('[data-ui-parity="legacy-landing"]')).toBeNull();
      expect(fetched).not.toContain("/api/v1/public/courses");
      expect(fetched).not.toContain("/api/v1/public/platform-stats");
      await waitForLazyRoute(() => fetched.includes("/api/v1/courses"),
        "redirected owner's course catalog requested");
      expect(fetched).toContain("/api/v1/courses");
    }finally{
      await act(async()=>root.unmount());cache.clear();host.remove();
    }
  });

  // Existing real App/router, authenticated Hono-shaped article GET consumer.
  // No artificial preview page, test-only endpoint, or server auth bypass.
  describe("ARTICLE_FULL_APP_CATALOG_DETAIL_BACK_20261024",()=>{
    const card=(id:string,slug:string,hasAccess:boolean)=>({
      id,slug,title:hasAccess?"Собака учится":"Платный материал",
      description:"Урок с кинологом",visibility:hasAccess?"PUBLIC":"PAID",
      hasAccess,likeCount:0,authorUsername:"trainer",ownerId:"SECRET_OWNER",
    });
    const response=(data:unknown,status=200)=>new Response(JSON.stringify({
      success:status===200,data,...(status===200?{}:{error:"SECRET_INTERNAL"}),
    }),{status});
    const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
    const click=async(host:HTMLDivElement,selector:string)=>{
      const link=host.querySelector<HTMLAnchorElement>(selector);
      expect(link).not.toBeNull();
      await act(async()=>link?.dispatchEvent(new MouseEvent("click",{
        bubbles:true,cancelable:true,button:0,
      })));
      for(let n=0;n<8;n++)await settle();
    };
    it("authenticated list -> locked detail -> browser Back -> readable public detail -> Back",async()=>{
      window.history.replaceState(null,"","/articles");
      (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
      const paths:string[]=[];
      vi.stubGlobal("fetch",vi.fn(async(path:string)=>{
        paths.push(path);
        if(path==="/api/v1/articles")return response([
          card("a1","учебный",true),card("a2","premium",false),
        ]);
        if(path==="/api/v1/articles/premium")return response({
          ...card("a2","premium",false),contentType:"HTML",content:null,
        });
        if(path==="/api/v1/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9")
          return response({...card("a1","учебный",true),contentType:"TEXT",content:"Учим собаку не подбирать"});
        return response(null,404);
      }));
      const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
      const cache=new QueryClient({defaultOptions:{queries:{
        retry:false,refetchOnWindowFocus:false,
      }}});
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",username:"trainer",role:"USER"});
      try{
        await act(async()=>root.render(createElement(
          QueryClientProvider,{client:cache},createElement(App),
        )));
        await waitForLazyRoute(() => Boolean(host.textContent?.includes("Платный материал")),
          "article catalog loaded");
        expect(host.querySelector('[aria-label="Статьи"]')).not.toBeNull();
        expect(host.querySelector('a[href="/articles/premium"]')).not.toBeNull();
        await click(host,'a[href="/articles/premium"]');
        await waitForLazyRoute(() => Boolean(host.textContent?.includes("Для чтения статьи нужна действующая подписка")),
          "paid article paywall loaded");
        expect(location.pathname).toBe("/articles/premium");
        expect(host.textContent).toContain("Для чтения статьи нужна действующая подписка");
        expect(host.querySelector(".article-body")).toBeNull();
        expect(host.innerHTML).not.toContain("SECRET_OWNER");
        await act(async()=>{history.back();await new Promise(resolve=>setTimeout(resolve,55));});
        await waitForLazyRoute(() => Boolean(host.textContent?.includes("Собака учится")),
          "article catalog returned after Back");
        expect(location.pathname).toBe("/articles");
        await click(host,'a[href="/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9"]');
        await waitForLazyRoute(() => Boolean(host.textContent?.includes("Учим собаку не подбирать")),
          "readable article loaded");
        expect(host.querySelector(".article-body")?.textContent).toContain("Учим собаку не подбирать");
        expect(host.innerHTML).not.toContain("SECRET_OWNER");
        await act(async()=>{history.back();await new Promise(resolve=>setTimeout(resolve,55));});
        expect(location.pathname).toBe("/articles");
        expect(host.textContent).not.toContain("Учим собаку не подбирать");
        expect(paths).toContain("/api/v1/articles");
        expect(paths).toContain("/api/v1/articles/premium");
        expect(paths).toContain("/api/v1/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9");
        expect(paths).toContain("/api/v1/user/onboarding-tour");
        expect(paths.every(path=>path.startsWith("/api/v1/articles")||
          path==="/api/v1/user/onboarding-tour"||
          path==="/api/v1/gafus/status")).toBe(true);
        expect(paths).not.toContain("/api/v1/public/articles");
      }finally{await act(async()=>root.unmount());cache.clear();host.remove();}
    });
    it("terminal private 404 never becomes fake entitlement, transient 503 needs explicit retry",async()=>{
      window.history.replaceState(null,"","/articles/private_missing");
      (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
      let status=404;const calls:string[]=[];
      vi.stubGlobal("fetch",vi.fn(async(path:string)=>{calls.push(path);
        return response(null,status);
      }));
      const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
      const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",username:"trainer",role:"USER"});
      try{
        await act(async()=>root.render(createElement(
          QueryClientProvider,{client:cache},createElement(App),
        )));
        await waitForLazyRoute(() => Boolean(host.textContent?.includes("Статья не найдена")),
          "terminal missing article displayed");
        expect(host.textContent).toContain("Статья не найдена");
        expect(host.querySelector(".article-body")).toBeNull();
        expect(host.querySelector('[aria-label="Статья"] button')).toBeNull();
        expect(host.innerHTML).not.toContain("SECRET_INTERNAL");
        status=503;
        await act(async()=>{window.history.replaceState(null,"","/articles/transient");
          window.dispatchEvent(new PopStateEvent("popstate"));});
        await waitForLazyRoute(() => Boolean(host.textContent?.includes("Не удалось открыть статью")),
          "transient article failure displayed");
        expect(host.textContent).toContain("Не удалось открыть статью");
        expect(host.querySelector(".article-body")).toBeNull();
        const before=calls.length;status=404;
        const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
          .find(button=>button.textContent?.trim()==="Повторить");
        expect(retry).toBeDefined();
        await act(async()=>retry?.click());
        await waitForLazyRoute(() => calls.length > before &&
          Boolean(host.textContent?.includes("Статья не найдена")), "article retry finished");
        expect(calls.length).toBeGreaterThan(before);
        expect(host.textContent).toContain("Статья не найдена");
        expect(host.innerHTML).not.toContain("SECRET_INTERNAL");
      }finally{await act(async()=>root.unmount());cache.clear();host.remove();}
    });
  });
});


describe("QA030_EXISTING_APP_CREATE_ANSWER_DISCUSSION_VERTICAL", () => {
  it("questions list -> create with Core rights -> discussion -> answer ACK -> list", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, "", "/questions");
    const UUID = "550e8400-e29b-41d4-a716-446655440000";
    vi.stubGlobal("crypto", { randomUUID: () => UUID });
    let created = false;
    let answered = false;
    const title = "Как научить ждать?";
    const body = "Подскажите упражнения на выдержку";
    const answerText = "Начните с короткой выдержки";
    const author = { id: "actor-1", name: "Собачник", avatarUrl: null };
    const item = {
      id: "question-1", title, body, category: "Поведение", status: "waiting",
      answerCount: answered ? 1 : 0,
      createdAt: "2026-10-24T12:00:00Z", author,
    };
    const answer = {
      id: "answer-1", body: answerText, author,
      best: false, deleted: false, hidden: false, liked: false, hearts: 0,
      parentId: null, replyToName: null, replyCount: 0, canEdit: false,
      canDelete: false, photos: [],
    };
    const response = (data: unknown) => new Response(JSON.stringify({
      success: true, data, secret: "SERVER_PRIVATE_METADATA",
    }), { status: 200 });
    const calls: { path: string; method: string; body: unknown }[] = [];
    const network = vi.fn(async (path: string, options?: RequestInit) => {
      const method = options?.method ?? "GET";
      const payload = options?.body === undefined ? undefined : JSON.parse(String(options.body));
      calls.push({ path, method, body: payload });
      if (path === "/api/v1/questions?page=1&sort=new&mine=false" && method === "GET")
        return response({ items: created ? [item] : [], nextPage: null,
          canPublish: true, blockReason: null });
      if (path === "/api/v1/questions" && method === "POST") {
        created = true;
        return response({ id: "question-1" });
      }
      if (path === "/api/v1/questions/question-1?page=1" && method === "GET")
        return response({ ...item, closed: false, canReply: true,
          canManage: false, canEdit: false, blockReason: null,
          photos: [], tags: [], answers: answered ? [answer] : [], nextAnswerPage: null });
      if (path === "/api/v1/questions/question-1/answers" && method === "POST") {
        answered = true;
        return response({ id: "answer-1" });
      }
      throw new Error("UNEXPECTED_QUESTION_ENDPOINT:" + method + ":" + path);
    });
    vi.stubGlobal("fetch", network);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    } });
    cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "actor-1", username: "student", role: "USER",
    });
    const settle = async () => act(async () => {
      await new Promise(done => setTimeout(done, 28));
    });
    const visit = async (href: string) => {
      const link = host.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
      expect(link).not.toBeNull();
      await act(async () => link?.dispatchEvent(new MouseEvent("click", {
        bubbles: true, cancelable: true, button: 0,
      })));
      await settle();
    };
    const fill = async (selector: string, value: string, textarea = false) => {
      const target = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      expect(target).not.toBeNull();
      const proto = textarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(target, value);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    try {
      await act(async () => root.render(createElement(
        QueryClientProvider, { client: cache }, createElement(App),
      )));
      for (let n = 0; n < 10 && !host.textContent?.includes("Задать вопрос"); n++)
        await settle();
      await visit("/questions/new");
      for (let n = 0; n < 20 && !host.querySelector('[aria-label="Создать вопрос"]'); n++)
        await settle();
      expect(host.querySelector('[aria-label="Создать вопрос"]')).not.toBeNull();
      for (let n = 0; n < 20 && !host.querySelector("#question-title"); n++)await settle();
      await fill("#question-title", title);
      await fill("#question-body", body, true);
      await act(async () => host.querySelector('[aria-label="Создать вопрос"] form')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      for (let n = 0; n < 10 && window.location.pathname !== "/questions/question-1"; n++)
        await settle();
      expect(window.location.pathname).toBe("/questions/question-1");
      for (let n = 0; n < 60 && !host.querySelector('[aria-label="Обсуждение"]'); n++)
        await settle();
      expect(host.querySelector('[aria-label="Обсуждение"]')).not.toBeNull();
      for (let n = 0; n < 10 && !host.querySelector("#question-reply"); n++)await settle();
      await fill("#question-reply", answerText, true);
      await act(async () => host.querySelector('[aria-label="Обсуждение"] form')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      for (let n = 0; n < 12 && !host.textContent?.includes(answerText); n++)await settle();
      expect(host.textContent).toContain(answerText);
      expect(host.innerHTML).not.toContain("SERVER_PRIVATE_METADATA");
      expect(calls.filter(call => call.method === "POST")).toEqual([
        { path: "/api/v1/questions", method: "POST", body: {
          // QuestionCreate defaults to «Другое» unless user selects a category.
          title, body, category: "Другое", tags: [], photoIds: [], clientRequestId: UUID,
        } },
        { path: "/api/v1/questions/question-1/answers", method: "POST", body: {
          body: answerText, photoIds: [], clientRequestId: UUID,
        } },
      ]);
      await visit("/questions");
      expect(window.location.pathname).toBe("/questions");
      for (let n = 0; n < 10 && !host.textContent?.includes(title); n++)await settle();
      expect(host.querySelector('a[href="/questions/question-1"]')?.textContent)
        .toContain(title);
      expect(calls.some(call => call.path === "/api/v1/user/onboarding-tour" &&
        call.method === "GET")).toBe(true);
      expect(calls.every(call => call.path.startsWith("/api/v1/questions") ||
        call.path === "/api/v1/user/onboarding-tour")).toBe(true);
    } finally {
      await act(async () => root.unmount());
      cache.clear(); host.remove();
      window.history.replaceState(null, "", "/");
    }
  });
});
