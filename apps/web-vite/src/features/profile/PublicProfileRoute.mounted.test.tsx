// @vitest-environment jsdom
import { withRejectedRefreshCookie } from "../../test/rejectedRefreshCookie";
/** WEB040 existing profile + AG1 public GET exact App-route acceptance. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { PublicAuthorActivityRead } from "./PublicAuthorActivityRead";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { navigate } from "../../shared/router/location";
import activityLayout from "./WEB1PublicActivityLayout.module.css";
import heroStyles from "./WEB1PublicHero.module.css";
import activityCards from "./WEB1PublicActivityCards.module.css";
import publicPets from "./WEB1PublicPets.module.css";
import { isYouTubeWebsite } from "./NextSocialIcons";
import { readFileSync } from "node:fs";
const owner=(id:string)=>({id,username:id.toLowerCase(),email:"PRIVATE_OWNER_EMAIL",
 profile:{fullName:"Личный профиль "+id,city:"Казань",about:"PRIVATE_OWNER_BIO"}});
const publicUser=(username:string,more:Record<string,unknown>={})=>({username,role:"USER",
 profile:{fullName:"Публичный "+username,city:"Самара",about:"Публичное описание",
  birthDate:null,telegram:null,instagram:null,website:null,avatarUrl:null,
  PRIVATE_PASSWORD:"SECRET_PUBLIC_EXTRA"},
 pets:[{id:"pet-1",name:"Барсик",type:"DOG",breed:"Корги",birthDate:null,
  photoUrl:null,SECRET_VET:"PRIVATE_MEDICAL_RECORD"}],diplomas:[],
 SECRET_ROOT:"PRIVATE_EMAIL",...more});
const response=(data:unknown,status=200)=>new Response(JSON.stringify({
 success:status===200,data,...(status===200?{}:{error:"PRIVATE_DB_STACK"})}),{status});
const pending=<T,>()=>{let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
// Warm route chunks without modifying actual Suspense behavior or pending
// public GET response expectations elsewhere in this suite.
beforeAll(async()=>{await Promise.all([
  import("./ProfileOverview"),
  import("./PublicProfileView"),
  import("../../brand/PublicLanding"),
]);});
let root:Root,host:HTMLDivElement,cache:QueryClient,network:ReturnType<typeof vi.fn>;
const flush=async()=>act(async()=>{await new Promise(done=>setTimeout(done,35));});
// The public read screen is now an async JS chunk. Wait only for that module
// to mount: pending HTTP data must remain pending for P03's privacy checks.
async function settlePublicModule(){
 for(let i=0;i<45&&host.textContent?.includes("Загружаем публичный профиль…");i++){
  await flush();
 }
}
async function mount(path="/profile"){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}><App/></QueryClientProvider>));
 await flush();await settlePublicModule();
}
async function go(path:string){await act(async()=>{
 window.history.pushState(null,"",path);window.dispatchEvent(new PopStateEvent("popstate"));
});await flush();await settlePublicModule();}
// Exercise PublicAuthorActivityRead's original concurrent two-list security
// contracts independently of Next's mutually exclusive visitor radio UI.
async function mountConcurrentAuthorActivity(username="b"){
 window.history.replaceState(null,"",`/profile?username=${username}`);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
   <PublicAuthorActivityRead key={username} username={username}/>
 </QueryClientProvider>));
 await flush();
}
function strictReads(){for(const [url,request] of network.mock.calls){
 expect(request?.method).toBe("GET");expect(request?.body).toBeUndefined();
 expect(String(url)).toMatch(
  new RegExp(
    "^/api/v1/(?:user/profile(?:/public\\?username=[^&]+)?|notes/student|" +
    "auth/me|feed/status|user/onboarding-tour|public/platform-stats)$",
  ),
 );
}}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"a",role:"USER"});
 network=vi.fn(async(url:string)=>url==="/api/v1/user/profile"?response(owner("A")):
  url.startsWith("/api/v1/user/profile/public?username=")?
   response(publicUser(decodeURIComponent(url.split("=")[1]))):
  url==="/api/v1/user/onboarding-tour"?response({hasSeenV1:true}):response(null));
 vi.stubGlobal("fetch",withRejectedRefreshCookie(network));
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 window.history.replaceState(null,"","/");
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");});
describe("WEB040 owner /profile -> public ?username read-only",()=>{
 it("P01 owner deep-link to public-only GET then return to owner",async()=>{
  await mount();expect(host.textContent).toContain("Личный профиль A");
  // Retained Next Bio/ProfileSections does not render a synthetic owner
  // 'Посмотреть публичный профиль' link; public URLs remain accessible.
  expect(host.querySelector('a[href="/profile?username=a"]')).toBeNull();
  await go("/profile?username=b");
  expect(host.textContent).toContain("Публичный b");
  // Next source ProfileClient has no legacy extra back/title row once loaded.
  expect(host.querySelector('section[aria-label="Публичный профиль"] > p > a'))
    .toBeNull();
  expect(host.textContent).not.toContain("PRIVATE_");
  expect(host.textContent).toContain("Барсик");
  const paths=network.mock.calls.map(([url])=>url);
  expect(paths).toContain("/api/v1/user/profile/public?username=b");
  await act(async()=>navigate("/profile"));await flush();
  expect(host.textContent).toContain("Личный профиль A");strictReads();
 });
 it("P01b signed-in visitor of Lana sees only read-only public controls, not owner settings",async()=>{
  await mount("/profile?username=lana");
  expect(host.textContent).toContain("Публичный lana");
  expect(host.textContent).not.toContain("Написать сообщение");
  expect(host.querySelector('section[aria-label="Публичный профиль"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Публикации и вопросы @lana");
  expect(host.textContent).not.toContain("Показать публикации и вопросы");
  expect(host.querySelector('[data-profile-view="activity"]')).not.toBeNull();
  expect(host.querySelector('[data-profile-view="questions"]')).not.toBeNull();
  expect(host.querySelector('nav[aria-label="Настройки аккаунта"]')).toBeNull();
  // The app-wide sidebar still links to the signed-in viewer's own
  // reminders etc.; only Lana's profile section must not show edit links.
  for(const privatePath of ["/profile/editBio","/profile/change-email",
    "/profile/set-password","/profile/change-password","/profile/change-username"]){
    expect(host.querySelector(`a[href="${privatePath}"]`),privatePath).toBeNull();
  }
  expect(host.querySelector('input,textarea,[contenteditable="true"]')).toBeNull();
  expect(network.mock.calls.map(([path])=>path)).toContain(
    "/api/v1/user/profile/public?username=lana");
  expect(network.mock.calls.map(([path])=>path)).not.toContain("/api/v1/user/profile");
  await go("/profile");
  expect(host.textContent).toContain("Личный профиль A");
  expect(host.querySelector('nav[aria-label="Настройки аккаунта"]')).not.toBeNull();
  expect(host.querySelector('a[href="/profile/editBio"]')).not.toBeNull();
  expect(host.querySelector('a[href="/profile/change-email"]')).not.toBeNull();
 });
 it("P01c owner query string still renders visitor-safe public UI, not mutable forms",async()=>{
  await mount("/profile?username=a");
  expect(host.textContent).toContain("Публичный a");
  expect(host.querySelector('nav[aria-label="Настройки аккаунта"]')).toBeNull();
  expect(host.querySelector('a[href="/profile/editBio"]')).toBeNull();
  expect(host.querySelector('input,textarea,[contenteditable="true"]')).toBeNull();
  await go("/profile?username=lana&tab=questions");
  expect(host.textContent).toContain("Публичный lana");
  expect(host.querySelector('nav[aria-label="Настройки аккаунта"]')).toBeNull();
 });
 it("WEB1 public pets heading and both pet cards sit within one responsive surface",async()=>{
  const pets=[
    {id:"dog-1",name:"Патриарх",type:"DOG",breed:"Золотистый ретривер",
      birthDate:null,photoUrl:null},
    {id:"cat-2",name:"Пузенок",type:"CAT",breed:"Котенок",
      birthDate:null,photoUrl:null},
  ];
  network.mockImplementation(async(url:string)=>{
    if(url==="/api/v1/user/profile/public?username=admin")
      return response(publicUser("admin",{pets}));
    if(url==="/api/v1/user/onboarding-tour")return response({hasSeenV1:true});
    throw Error("UNEXPECTED_PUBLIC_GET:"+url);
  });
  await mount("/profile?username=admin");
  const section=host.querySelector<HTMLElement>('section[aria-label="Питомцы"]');
  expect(section?.classList.contains(publicPets.section)).toBe(true);
  expect(section?.querySelector(`h2.${publicPets.heading}`)?.textContent).toBe("Питомцы");
  const list=section?.querySelector(`ul.${publicPets.list}`);
  expect(list).not.toBeNull();
  const cards=list?.querySelectorAll(`li.${publicPets.card}`);
  expect(cards).toHaveLength(2);
  expect(cards?.[0].textContent).toContain("Патриарх");
  expect(cards?.[1].textContent).toContain("Пузенок");
  expect(section?.querySelector('img[alt="Питомец Пузенок"]')?.getAttribute("src"))
    .toBe("/images/pet-avatar-cat.png");
  expect(section?.querySelector('img[alt="Питомец Патриарх"]')?.getAttribute("src"))
    .toBe("/images/pet-avatar-dog.png");
  const rules=readFileSync("src/features/profile/WEB1PublicPets.module.css","utf8");
  expect(rules).toContain("box-shadow: 0 8px 24px");
  expect(rules).toContain("border-radius: 24px");
  expect(rules).toContain("background: var(--surface-muted");
  expect(rules).toContain("@media (max-width: 620px)");
  expect(network.mock.calls.every(([,init])=>init?.method==="GET")).toBe(true);
 });
 it("WEB1 visitor header uses a larger avatar and compact name without modifying owner Bio",async()=>{
  await mount("/profile?username=teamb");
  const publicView=host.querySelector('section[aria-label="Публичный профиль"]');
  const avatar=publicView?.querySelector<HTMLImageElement>("img.public-profile-avatar");
  const frame=avatar?.parentElement;
  const heading=publicView?.querySelector("[data-next-profile-identity] h1");
  expect(frame?.classList.contains(heroStyles.avatarFrame)).toBe(true);
  expect(avatar?.classList.contains(heroStyles.avatarImage)).toBe(true);
  expect(avatar?.getAttribute("width")).toBe("180");
  expect(heading?.classList.contains(heroStyles.name)).toBe(true);
  const rules=readFileSync("src/features/profile/WEB1PublicHero.module.css","utf8");
  expect(rules).toMatch(/width:\s*184px/);
  expect(rules).toMatch(/font-size:\s*clamp\(30px,\s*3\.6vw,\s*44px\)/);
  expect(rules).toContain("@media (max-width: 470px)");
  await go("/profile");
  expect(host.querySelector(`.${heroStyles.avatarFrame}`)).toBeNull();
  expect(host.querySelector(`.${heroStyles.name}`)).toBeNull();
 });
 it("WEB1 read-only author rows render real warm cards for both post and question",async()=>{
  const post={id:"post-card",author:{id:"OTHER",username:"teamb",name:"teamb",avatarUrl:null,role:null},
    status:"published",text:"Собака научилась ждать",attachments:[],reactions:[],
    createdAt:"2026-10-20T12:00:00.000Z",publishedAt:"2026-10-20T12:00:00.000Z",
    commentCount:3,viewCount:12,myReaction:null,bookmarked:false,hasPoll:false,canEdit:false};
  const question={id:"question-card",title:"Как научить ждать?",body:"Вопрос",category:"Поведение",
    status:"waiting",answerCount:2,createdAt:"2026-10-20T12:00:00.000Z",
    author:{id:"OTHER",username:"teamb",name:"teamb",avatarUrl:null}};
  network.mockImplementation(async(url:string)=>{
    if(url==="/api/v1/user/profile/public?username=teamb")return response(publicUser("teamb"));
    if(url==="/api/v1/feed/status")return response({enabled:true,smartEnabled:false});
    if(url==="/api/v1/feed/profiles/teamb/posts?pageSize=20")
      return response({items:[post],nextCursor:null});
    if(url==="/api/v1/questions?author=teamb&sort=new&page=1")
      return response({items:[question],nextPage:null});
    if(url==="/api/v1/user/onboarding-tour")return response({hasSeenV1:true});
    throw Error("UNEXPECTED_GET:"+url);
  });
  await mount("/profile?username=teamb");
  const postTab=host.querySelector<HTMLButtonElement>('[data-profile-view="activity"]');
  await act(async()=>postTab?.click());await flush();
  const postSection=host.querySelector('section[aria-label="Публикации @teamb"]');
  expect(postSection?.classList.contains(activityCards.panel)).toBe(true);
  const postCard=postSection?.querySelector("li");
  expect(postCard?.classList.contains(activityCards.card)).toBe(true);
  expect(postSection?.querySelector('a[href="/moments/post-card"]')?.textContent)
    .toContain("Собака научилась ждать");
  expect(postCard?.textContent).toContain("Комментарии: 3");
  expect(postCard?.textContent).toContain("Момент");
  const questionTab=host.querySelector<HTMLButtonElement>('[data-profile-view="questions"]');
  await act(async()=>questionTab?.click());await flush();
  const questionSection=host.querySelector('section[aria-label="Вопросы @teamb"]');
  expect(questionSection?.classList.contains(activityCards.panel)).toBe(true);
  const questionCard=questionSection?.querySelector("li");
  expect(questionCard?.classList.contains(activityCards.card)).toBe(true);
  expect(questionSection?.querySelector('a[href="/questions/question-card"]')?.textContent)
    .toContain("Как научить ждать?");
  expect(questionCard?.textContent).toContain("Ответы: 2");
  expect(questionCard?.textContent).toContain("Вопрос");
  expect(host.querySelector('a[href="/moments/post-card"]')).toBeNull();
  expect(network.mock.calls.every(([,request])=>request?.method==="GET")).toBe(true);
 });
 it("WEB1 public activity results stay centered under visitor tabs on both screens",async()=>{
  network.mockImplementation(async(url:string)=>{
    if(url==="/api/v1/user/profile/public?username=teamb")
      return response(publicUser("teamb"));
    if(url==="/api/v1/feed/status")return response({enabled:false,smartEnabled:false});
    if(url==="/api/v1/questions?author=teamb&sort=new&page=1")
      return response({items:[],nextPage:null});
    if(url==="/api/v1/user/onboarding-tour")return response({hasSeenV1:true});
    throw Error("UNEXPECTED_PUBLIC_PROFILE_READ:"+url);
  });
  await mount("/profile?username=teamb");
  expect(host.querySelector("#profile-activity")).toBeNull();
  const postsTab=host.querySelector<HTMLButtonElement>('[data-profile-view="activity"]');
  await act(async()=>postsTab?.click());await flush();
  const postsPanel=host.querySelector<HTMLElement>("#profile-activity");
  expect(postsPanel?.classList.contains(activityLayout.activityResult)).toBe(true);
  expect(postsPanel?.textContent).toContain("Публикации @teamb");
  expect(postsPanel?.textContent).toContain("Моменты сейчас недоступны.");
  expect(postsPanel?.textContent).not.toContain("Показать публикации и вопросы");
  const questionsTab=host.querySelector<HTMLButtonElement>('[data-profile-view="questions"]');
  await act(async()=>questionsTab?.click());await flush();
  const questionsPanel=host.querySelector<HTMLElement>("#profile-questions");
  expect(questionsPanel?.classList.contains(activityLayout.activityResult)).toBe(true);
  expect(questionsPanel?.textContent).toContain("Вопросы @teamb");
  expect(questionsPanel?.textContent).toContain("Вопросов пока нет.");
  expect(host.querySelector("#profile-activity")).toBeNull();
  expect(host.textContent).not.toContain("Публикации и вопросы @teamb");
 });
 it("P02 unauthenticated public-profile URL shows landing, never privately fetches",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
  await mount("/profile?username=b");
  expect(host.textContent).toContain("Начать заниматься");
  expect(host.querySelector('a[href="/login"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Публичный b");
  expect(network.mock.calls.map(([url])=>url)).not.toContain("/api/v1/user/profile");
  expect(network.mock.calls.map(([url])=>url))
    .not.toContain("/api/v1/user/profile/public?username=b");
  strictReads();
 });
 it("WEB1 source public Bio layout shows real public city, calculated age and about",async()=>{
  const birthday="2020-01-05T00:00:00.000Z";
  const profile=publicUser("bio-user");
  network.mockImplementation(async(url:string)=>url==="/api/v1/user/profile/public?username=bio-user"?
    response({...profile,profile:{...profile.profile,birthDate:birthday}}):response(null));
  // Signed-in visitor; guest feature routes are intentionally retired.
  await mount("/profile?username=bio-user");
  const bio=host.querySelector<HTMLElement>("[data-next-profile-identity]");
  expect(bio).not.toBeNull();
  expect(bio?.querySelector("h1")?.textContent).toBe("Публичный bio-user");
  expect(bio?.querySelector('[aria-label="Личные сведения"]')?.textContent)
    .toContain("Самара");
  expect(bio?.querySelector('[aria-label="Личные сведения"]')?.textContent)
    .toMatch(/Возраст\d+\s+(год|года|лет)/);
  expect(bio?.textContent).toContain("Публичное описание");
  expect(bio?.querySelector('img[alt="Аватар по умолчанию"]')?.getAttribute("src"))
    .toBe("/uploads/avatar.svg");
  expect(host.querySelectorAll("[data-next-profile-identity]")).toHaveLength(1);
  expect(host.innerHTML).not.toContain("SECRET_PUBLIC_EXTRA");
  expect(host.innerHTML).not.toContain("PRIVATE_MEDICAL_RECORD");
  strictReads();
 });
 it("WEB1 source PublicPets layout uses guarded cat fallback and real shared age",async()=>{
  const birthday="2024-01-01";
  const profile=publicUser("pets",{pets:[{
    id:"cat-1",name:"Кот Бублик",type:"CAT",breed:"",birthDate:birthday,
    photoUrl:"javascript:alert(1)",SECRET_VET:"PRIVATE_MEDICAL_RECORD",
  }]});
  network.mockImplementation(async(url:string)=>
    url==="/api/v1/user/profile/public?username=pets"?
      response(profile):response(null));
  // Signed-in visitor; guest feature routes are intentionally retired.
  await mount("/profile?username=pets");
  const section=host.querySelector<HTMLElement>('section[aria-label="Питомцы"]');
  expect(section).not.toBeNull();
  expect(section?.querySelector("h2")?.textContent).toBe("Питомцы");
  expect(section?.querySelector('img[alt="Питомец Кот Бублик"]')?.getAttribute("src"))
    .toBe("/images/pet-avatar-cat.png");
  expect(section?.textContent).toContain("Кошка");
  expect(section?.textContent).toContain("Порода не указана");
  const sourceAge=(await import("@gafus/core-client/utils/pet"))
    .formatPetAge(birthday);
  expect(sourceAge).not.toBeNull();
  expect(section?.textContent).toContain(sourceAge);
  expect(section?.textContent).not.toContain("PRIVATE_MEDICAL_RECORD");
  expect(host.innerHTML).not.toContain("javascript:alert");
  strictReads();
 });
 it("WEB1 signed-in visitor radios keep keyboard, query and hash-target semantics",async()=>{
  await mount("/profile?username=b");
  const group=host.querySelector('[role="radiogroup"][aria-label="Разделы профиля @b"]');
  expect(group).not.toBeNull();
  const activity=group?.querySelector<HTMLButtonElement>('[data-profile-view="activity"]');
  const questions=group?.querySelector<HTMLButtonElement>('[data-profile-view="questions"]');
  expect(activity?.getAttribute("aria-checked")).toBe("true");
  expect(activity?.tabIndex).toBe(0);
  expect(host.querySelector("#profile-activity")).toBeNull();
  expect(host.textContent).not.toContain("Публикации и вопросы @b");
  expect(host.textContent).not.toContain("Показать публикации и вопросы");
  await act(async()=>questions?.click());await flush();
  expect(window.location.search).toBe("?username=b&tab=questions");
  expect(host.querySelector('[data-profile-view="questions"]')?.getAttribute("aria-checked"))
    .toBe("true");
  expect(host.querySelector<HTMLButtonElement>('[data-profile-view="activity"]')?.tabIndex)
    .toBe(-1);
  expect(host.querySelector("#profile-questions")).not.toBeNull();
  expect(host.querySelector("#profile-activity")).toBeNull();
  // Suspense can replace the original public-profile node after the click;
  // dispatch the keyboard event to the currently mounted radio.
  const activeQuestions=host.querySelector<HTMLButtonElement>(
    '[data-profile-view="questions"]');
  await act(async()=>activeQuestions?.dispatchEvent(
    new KeyboardEvent("keydown",{key:"Home",bubbles:true,cancelable:true})));await flush();
  expect(window.location.search).toBe("?username=b");
  expect(host.querySelector('[data-profile-view="activity"]')?.getAttribute("aria-checked"))
    .toBe("true");
  expect(host.querySelector("#profile-activity")).not.toBeNull();
  // Public profile display remains GET-only; visitor keyboard navigation
  // must never synthesize owner session nor fire private mutation requests.
  expect(network.mock.calls.map(([url])=>url)).not.toContain("/api/v1/user/profile");
 });
 it("P03 pending public GET does not publish owner private fields",async()=>{
  const d=pending<Response>();
  network.mockImplementation((url:string)=>url.includes("/public?")?d.promise:
   Promise.resolve(response(owner("A"))));
  await mount("/profile?username=b");
  expect(host.textContent).toContain("Загружаем публичный профиль");
  expect(host.textContent).not.toContain("PRIVATE_OWNER_BIO");
  await act(async()=>d.resolve(response(publicUser("b"))));await flush();
  expect(host.textContent).toContain("Публичный b");strictReads();
 });
 it("P04 503 generic error and explicit GET retry, no private stack",async()=>{
  network.mockImplementation(async(url:string)=>url.includes("/public?")?
    response(null,503):response(owner("A")));
  await mount("/profile?username=b");
  expect(host.textContent).toContain("Не удалось загрузить публичный профиль");
  expect(host.textContent).not.toContain("PRIVATE_DB_STACK");
  network.mockImplementation(async(url:string)=>url.includes("/public?")?
    response(publicUser("b")):response(owner("A")));
  const button=[...host.querySelectorAll("button")].find(b=>b.textContent?.trim()==="Повторить");
  expect(button).toBeDefined();await act(async()=>button?.click());await flush();
  expect(host.textContent).toContain("Публичный b");strictReads();
 });
 it("P05 404 no retry, and 403 access denial",async()=>{
  for(const [status,label] of [[404,"Публичный профиль не найден"],[403,"Публичный профиль недоступен"]] as const){
   network.mockImplementation(async(url:string)=>url.includes("/public?")?
    response(null,status):response(owner("A")));
   await mount("/profile?username="+(status===404?"missing":"denied"));
   expect(host.textContent).toContain(label);
   expect(host.textContent).not.toContain("PRIVATE_DB_STACK");
   expect([...host.querySelectorAll("button")].some(b=>b.textContent?.trim()==="Повторить")).toBe(false);
  }strictReads();
 });
 it("P06 malformed 200 and duplicate username query fail closed",async()=>{
  network.mockImplementation(async(url:string)=>url.includes("/public?")?
   response(publicUser("wrong")):response(owner("A")));
  await mount("/profile?username=b");
  expect(host.textContent).toContain("Не удалось загрузить публичный профиль");
  expect(host.textContent).not.toContain("Публичный wrong");
  const before=network.mock.calls.length;
  await go("/profile?username=b&username=c");
  expect(host.textContent).toContain("Некорректный адрес публичного профиля");
  expect(network.mock.calls.length).toBe(before);
  expect(host.textContent).not.toContain("Личный профиль A");strictReads();
 });
 it("P07 A->B principal change retires A-owned private profile before B read",async()=>{
  const d=pending<Response>();
  network.mockImplementation((url:string)=>url==="/api/v1/user/profile"&&
    cache.getQueryData<{id:string}>(CURRENT_USER_QUERY_KEY)?.id==="B"?d.promise:
    Promise.resolve(response(owner("A"))));
  await mount();expect(host.textContent).toContain("Личный профиль A");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
   {id:"B",username:"b",role:"USER"}));await flush();
  expect(host.textContent).not.toContain("Личный профиль A");
  expect(host.textContent).not.toContain("PRIVATE_OWNER_BIO");
  await act(async()=>d.resolve(response(owner("B"))));await flush();
  expect(host.textContent).not.toContain("Личный профиль A");strictReads();
 });
 it("P08 server returns wrong owner ID: private fields never shown",async()=>{
  network.mockImplementation(async()=>response(owner("B")));
  await mount();expect(host.textContent).toContain("пользователь не совпадает");
  expect(host.textContent).not.toContain("Личный профиль B");strictReads();
 });
 it("WEB1 public contacts use locally stored real social logos and YouTube website mark",async()=>{
  const person={...publicUser("lana"),profile:{...publicUser("lana").profile,
    instagram:"doghandler_lana",telegram:"pt_lana",website:"https://www.youtube.com/@lana"}};
  network.mockImplementation(async(url:string)=>{
    if(url==="/api/v1/user/profile/public?username=lana")return response(person);
    if(url==="/api/v1/user/onboarding-tour")return response({hasSeenV1:true});
    throw Error("UNEXPECTED_BRAND_HTTP:"+url);
  });
  await mount("/profile?username=lana");
  const links=host.querySelector<HTMLElement>('nav[aria-label="Контакты специалиста"]');
  const instagram=links?.querySelector<HTMLAnchorElement>(
    'a[href="https://www.instagram.com/doghandler_lana/"]');
  const telegram=links?.querySelector<HTMLAnchorElement>(
    'a[href="https://t.me/pt_lana"]');
  const youtube=links?.querySelector<HTMLAnchorElement>(
    'a[href="https://www.youtube.com/@lana"]');
  expect(instagram?.querySelector('img[src="/images/social-brands/instagram.svg"]'))
    .not.toBeNull();
  expect(telegram?.querySelector('img[src="/images/social-brands/telegram.svg"]'))
    .not.toBeNull();
  expect(youtube?.querySelector('img[src="/images/social-brands/youtube.svg"]'))
    .not.toBeNull();
  expect(youtube?.textContent).toContain("Сайт");
  expect(youtube?.textContent).toContain("youtube.com");
  expect(links?.querySelectorAll("a > svg:last-child")).toHaveLength(3);
  for(const logo of ["instagram","telegram","youtube"]){
    const svg=readFileSync(`public/images/social-brands/${logo}.svg`,"utf8");
    expect(svg).toContain('<svg fill="#');
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/<script|onload=/i);
  }
  expect(network.mock.calls.every(([,init])=>init?.method==="GET")).toBe(true);
 });
 it("WEB1 ordinary site and deceptive YouTube hostname retain neutral globe",async()=>{
  const person={...publicUser("lana"),profile:{...publicUser("lana").profile,
    website:"https://youtube.com.evil.test/profile"}};
  network.mockImplementation(async(url:string)=>{
    if(url==="/api/v1/user/profile/public?username=lana")return response(person);
    if(url==="/api/v1/user/onboarding-tour")return response({hasSeenV1:true});
    throw Error("UNEXPECTED_BRAND_HTTP:"+url);
  });
  await mount("/profile?username=lana");
  const link=host.querySelector('a[href="https://youtube.com.evil.test/profile"]');
  expect(link).not.toBeNull();
  expect(link?.querySelector("svg")).not.toBeNull();
  expect(link?.querySelector('img[src="/images/social-brands/youtube.svg"]')).toBeNull();
 });
 it.each(["https://youtube.com/channel/a","https://m.youtube.com/c/a",
  "https://youtu.be/a"])("WEB1 recognizes verified YouTube website %s",url=>{
  expect(isYouTubeWebsite(url)).toBe(true);
 });
 it.each(["https://youtube.com.evil.test/","https://notyoutube.com/",
  "https://example.org/","javascript:alert(1)","garbage"])(
  "WEB1 does not impersonate YouTube on unrelated website %s",url=>{
  expect(isYouTubeWebsite(url)).toBe(false);
 });
 it("P09 trainer-only published courses, diploma, contacts and avatar from public DTO",async()=>{
  const trainer={...publicUser("trainer"),role:"TRAINER",
    profile:{...publicUser("trainer").profile,
      avatarUrl:"/uploads/avatar-test.png",telegram:"dog_trainer",
      instagram:"trainer_dog",website:"https://example.org/profile"},
    diplomas:[{id:"d1",title:"Кинология",issuedBy:"Школа",
      issuedAt:"2025-01-01T00:00:00.000Z",url:"https://example.org/diploma"}],
    courses:[{id:"public_course",name:"Мой открытый курс",type:"training",
      shortDesc:"Обучение",duration:"3 недели",logoImg:"",isPrivate:false,
      isPaid:true,avgRating:4.8,trainingLevel:"BEGINNER",updatedAt:"2026-01-01T00:00:00.000Z"},
      {id:"private_course",name:"Мой приватный курс",type:"training",
      shortDesc:"Закрытое обучение",duration:"5 недель",logoImg:"",isPrivate:true,
      isPaid:false,avgRating:null,trainingLevel:"EXPERT",updatedAt:"2026-01-02T00:00:00.000Z"}],
  };
  network.mockImplementation(async()=>response(trainer));
  // Signed-in visitor; guest feature routes are intentionally retired.
  await mount("/profile?username=trainer");
  expect(host.querySelector('img[alt="Аватар пользователя @trainer"]')?.getAttribute("src"))
    .toBe("/uploads/avatar-test.png");
  expect(host.querySelector('a[href="https://t.me/dog_trainer"]')).not.toBeNull();
  expect(host.querySelector('a[href="https://www.instagram.com/trainer_dog/"]')).not.toBeNull();
  expect(host.querySelector('a[href="https://example.org/profile"]')).not.toBeNull();
  const specialistLinks=host.querySelector('nav[aria-label="Контакты специалиста"]');
  // Each link retains the independent MUI external-arrow SVG as its last
  // direct child, even when the brand mark is a locally bundled SVG image.
  expect(specialistLinks?.querySelectorAll("a > svg:last-child")).toHaveLength(3);
  expect(specialistLinks?.textContent).not.toContain("↗");
  expect(host.querySelector('section[aria-label="Дипломы пользователя"]')).not.toBeNull();
  expect(host.querySelector('section[aria-label="Дипломы пользователя"] h2')?.textContent)
    .toBe("Дипломы");
  expect(host.querySelector('a[href="https://example.org/diploma"]')).not.toBeNull();
  expect(host.querySelector('a[href="/courses/public_course"]')).not.toBeNull();
  expect(host.querySelector('a[href="/courses/private_course"]')).toBeNull();
  const cards=host.querySelectorAll('section[aria-label="Курсы кинолога"] li');
  expect(cards).toHaveLength(2);
  expect(cards[0]?.querySelector('a[href="/courses/public_course"] h3')?.textContent)
    .toBe("Мой открытый курс");
  expect(cards[0]?.querySelector('img[alt="Мой открытый курс logo"]')
    ?.getAttribute("src")).toBe("/images/course-day-logo-source.png");
  expect(cards[1]?.querySelector("a")).toBeNull();
  expect(cards[1]?.querySelector('[aria-label="Приватный курс: Мой приватный курс"]'))
    .not.toBeNull();
  expect(cards[0]?.textContent).toContain("Длительность: 3 недели");
  expect(cards[0]?.textContent).toContain("Уровень: Начальный");
  expect(cards[0]?.textContent).toContain("Рейтинг: 4.8 ⭐");
  expect(host.textContent).toContain("Приватный");
  expect(host.textContent).toContain("По подписке");
  expect(host.innerHTML).not.toContain("SECRET_PUBLIC_EXTRA");
  expect(host.innerHTML).not.toContain("PRIVATE_");strictReads();
 });
 it("WEB1 source trainer card rejects executable image URL without granting private access",async()=>{
  const dangerous={...publicUser("specialist"),role:"TRAINER",courses:[{
    id:"visible_course",name:"Проверенный курс",type:"training",shortDesc:"Публично",
    duration:"4 занятия",logoImg:"javascript:alert(1)",isPrivate:false,
    isPaid:false,avgRating:null,trainingLevel:"INTERMEDIATE",
    updatedAt:"2026-01-01T00:00:00.000Z",
  },{
    id:"guarded_course",name:"Только с разрешением",type:"training",shortDesc:"",
    duration:"1 занятие",logoImg:"https://example.test/image.png",isPrivate:true,
    isPaid:false,avgRating:null,trainingLevel:"EXPERT",
    updatedAt:"2026-01-02T00:00:00.000Z",
  }]};
  network.mockImplementation(async()=>response(dangerous));
  // Signed-in visitor; guest feature routes are intentionally retired.
  await mount("/profile?username=specialist");
  const section=host.querySelector('section[aria-label="Курсы кинолога"]');
  expect(section?.querySelector('img[alt="Проверенный курс logo"]')?.getAttribute("src"))
    .toBe("/images/course-day-logo-source.png");
  expect(section?.querySelector('a[href="/courses/visible_course"]')).not.toBeNull();
  expect(section?.querySelector('a[href="/courses/guarded_course"]')).toBeNull();
  expect(section?.querySelector('img[alt="Только с разрешением logo"]')?.getAttribute("src"))
    .toBe("https://example.test/image.png");
  expect(host.innerHTML).not.toContain("javascript:alert");
  strictReads();
 });
 it("P10 USER never displays trainer courses, malformed published courses fail closed",async()=>{
  const invalid={...publicUser("ordinary"),courses:[{
    id:"../../admin",name:"Unsafe",type:"training",shortDesc:"",duration:"",
    logoImg:"",isPrivate:false,isPaid:false,avgRating:null,
    trainingLevel:"BEGINNER",updatedAt:"2026-01-01T00:00:00.000Z",
  }]};
  network.mockImplementation(async()=>response(invalid));
  await mount("/profile?username=ordinary");
  expect(host.textContent).toContain("Не удалось загрузить публичный профиль");
  expect(host.textContent).not.toContain("Unsafe");
  expect(host.querySelector('a[href*="admin"]')).toBeNull();strictReads();
 });
 it("P11 unsafe avatar/external URL are not linked or rendered",async()=>{
  const invalidLinks={...publicUser("safe"),
    profile:{...publicUser("safe").profile,
      avatarUrl:"javascript:alert(1)",telegram:"/unsafe",instagram:"unsafe/name",
      website:"javascript:alert(1)"},
    diplomas:[{id:"d1",title:"Подтверждённый диплом",issuedBy:null,
      issuedAt:"2026-01-01T00:00:00.000Z",url:"javascript:alert(1)"}],
  };
  network.mockImplementation(async()=>response(invalidLinks));
  await mount("/profile?username=safe");
  expect(host.textContent).toContain("Подтверждённый диплом");
  expect(host.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(host.querySelector('img[alt="Аватар пользователя @safe"]')).toBeNull();
  expect(host.querySelector('nav[aria-label="Контакты специалиста"]')).toBeNull();
  strictReads();
 });

 it("P12 authenticated public-author read follows BOTH registered GETs, pagination, then retires on actor change",async()=>{
  const sourcePost=(id:string,text:string)=>({
    id,author:{id:"PRIVATE_AUTHOR",username:"b",name:"Автор Б",avatarUrl:null,role:null},
    status:"published",text,attachments:[{id:"media-1",kind:"photo",status:"ready",
      fullUrl:"https://secret.media.example/signed-token"}],
    createdAt:"2026-10-20T12:00:00.000Z",publishedAt:"2026-10-20T12:00:00.000Z",
    reactions:[],commentCount:0,viewCount:4,myReaction:null,bookmarked:false,
    hasPoll:false,canEdit:false,PRIVATE_INTERNAL:"SECRET_POST_RECORD",
  });
  const sourceQuestion=(id:string,title:string,username="b")=>({
    id,title,body:"Сложности с поводком",category:"Поведение",status:"waiting",
    answerCount:1,createdAt:"2026-10-20T12:00:00.000Z",
    author:{id:"PRIVATE_AUTHOR",username,name:"Автор Б",avatarUrl:null},
    PRIVATE_INTERNAL:"SECRET_QUESTION_RECORD",
  });
  network.mockImplementation(async(url:string)=>{
    if(url==="/api/v1/user/profile/public?username=b")return response(publicUser("b"));
    if(url==="/api/v1/feed/status")return response({enabled:true,smartEnabled:false});
    if(url==="/api/v1/feed/profiles/b/posts?pageSize=20")return response({
      items:[sourcePost("post-1","Первый публичный момент")],nextCursor:"older-1"});
    if(url==="/api/v1/feed/profiles/b/posts?cursor=older-1&pageSize=20")return response({
      items:[sourcePost("post-2","Второй публичный момент")],nextCursor:null});
    if(url==="/api/v1/questions?author=b&sort=new&page=1")return response({
      items:[sourceQuestion("q-1","Первый вопрос автора")],nextPage:2,
      canPublish:true,blockReason:"PRIVATE_VIEWER_BLOCK_REASON"});
    if(url==="/api/v1/questions?author=b&sort=new&page=2")return response({
      items:[sourceQuestion("q-2","Второй вопрос автора")],nextPage:null,
      canPublish:true,blockReason:null});
    throw Error("UNEXPECTED_API_"+url);
  });
  await mount("/profile?username=b");
  expect(host.textContent).not.toContain("Публикации и вопросы @b");
  expect(host.textContent).not.toContain("Показать публикации и вопросы");
  expect(network.mock.calls.map(([url])=>url)).not.toContain("/api/v1/feed/status");
  const postsTab=host.querySelector<HTMLButtonElement>(
    '[role="radio"][data-profile-view="activity"]');
  expect(postsTab).not.toBeNull();
  await act(async()=>postsTab?.click());await flush();
  expect(host.textContent).not.toContain("Публикации и вопросы @b");
  expect(host.textContent).not.toContain("Показать публикации и вопросы");
  expect(host.textContent).toContain("Первый публичный момент");
  expect(host.textContent).not.toContain("Первый вопрос автора");
  expect(host.querySelector('a[href="/moments/post-1"]')).not.toBeNull();
  expect(host.querySelector('a[href="/questions/q-1"]')).toBeNull();
  expect(network.mock.calls.map(([url])=>url)).not.toContain(
    "/api/v1/questions?author=b&sort=new&page=1");
  const more=[...host.querySelectorAll("button")].find(b=>
    b.textContent==="Показать ещё публикации");
  expect(more).not.toBeUndefined();
  await act(async()=>more?.click());await flush();
  expect(host.textContent).toContain("Второй публичный момент");
  const questionRadio=host.querySelector<HTMLButtonElement>(
    '[role="radio"][data-profile-view="questions"]');
  expect(questionRadio).not.toBeNull();
  await act(async()=>questionRadio?.click());await flush();
  expect(window.location.search).toContain("tab=questions");
  expect(host.textContent).not.toContain("Первый публичный момент");
  expect(host.textContent).toContain("Первый вопрос автора");
  expect(host.querySelector('a[href="/questions/q-1"]')).not.toBeNull();
  const moreQuestions=[...host.querySelectorAll("button")].find(b=>
    b.textContent==="Показать ещё вопросы");
  expect(moreQuestions).not.toBeUndefined();
  await act(async()=>moreQuestions?.click());await flush();
  expect(host.textContent).toContain("Второй вопрос автора");
  expect(host.innerHTML).not.toMatch(/SECRET_|PRIVATE_|secret\.media/);
  expect(host.querySelector('img[src*="secret.media"],video,iframe,source')).toBeNull();
  for(const [url,request] of network.mock.calls){
    expect(request?.method).toBe("GET");expect(request?.body).toBeUndefined();
    // The source Next onboarding provider legitimately requests the current
    // authenticated owner's own status. It must be GET-only and never read B.
    if(url==="/api/v1/user/onboarding-tour")continue;
    expect(String(url)).toMatch(/^\/api\/v1\/(?:user\/profile\/public\?|feed\/|questions\?)/);
  }
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"B",username:"b",role:"USER"}));await flush();
  expect(host.textContent).not.toContain("Показать публикации и вопросы");
  expect(host.textContent).not.toContain("Первый публичный момент");
  expect(host.textContent).not.toContain("Первый вопрос автора");
 });


 it.each(["posts","questions"] as const)(
  "AG2-PROFILE020 P13 next-page failure, same-cursor retry, dedup (%s)",async(kind)=>{
  const fail=pending<Response>();const retry=pending<Response>();
  const calls={posts:0,questions:0,firstPosts:0,firstQuestions:0};
  const post=(id:string,text:string)=>({
    id,author:{id:"PRIVATE_AUTHOR",username:"b",name:"Автор Б",avatarUrl:null,role:null},
    status:"published",text,attachments:[],reactions:[],
    createdAt:"2026-10-20T12:00:00.000Z",publishedAt:"2026-10-20T12:00:00.000Z",
    commentCount:0,viewCount:4,myReaction:null,bookmarked:false,hasPoll:false,canEdit:false,
  });
  const question=(id:string,title:string)=>({
    id,title,body:"Совет по воспитанию",category:"Поведение",status:"waiting",
    answerCount:1,createdAt:"2026-10-20T12:00:00.000Z",
    author:{id:"PRIVATE_AUTHOR",username:"b",name:"Автор Б",avatarUrl:null},
  });
  const firstPost=post("post-1","Первый публичный момент");
  const secondPost=post("post-2","Второй публичный момент");
  const firstQuestion=question("q-1","Первый вопрос автора");
  const secondQuestion=question("q-2","Второй вопрос автора");
  network.mockImplementation((url:string)=>{
    if(url==="/api/v1/user/profile/public?username=b")return Promise.resolve(response(publicUser("b")));
    if(url==="/api/v1/feed/status")return Promise.resolve(response({enabled:true,smartEnabled:false}));
    if(url==="/api/v1/feed/profiles/b/posts?pageSize=20"){
      calls.firstPosts++;return Promise.resolve(response({items:[firstPost],nextCursor:"older-1"}));
    }
    if(url==="/api/v1/questions?author=b&sort=new&page=1"){
      calls.firstQuestions++;return Promise.resolve(response({items:[firstQuestion],nextPage:2}));
    }
    if(url==="/api/v1/feed/profiles/b/posts?cursor=older-1&pageSize=20"){
      calls.posts++;return calls.posts===1?fail.promise:retry.promise;
    }
    if(url==="/api/v1/questions?author=b&sort=new&page=2"){
      calls.questions++;return calls.questions===1?fail.promise:retry.promise;
    }
    throw Error("UNEXPECTED_GET:"+url);
  });
  await mount(kind==="posts"?"/profile?username=b":
    "/profile?username=b&tab=questions");
  expect(host.textContent).not.toContain("Показать публикации и вопросы");
  const tab=host.querySelector<HTMLButtonElement>(
    `[role="radio"][data-profile-view="${kind==="posts"?"activity":"questions"}"]`);
  expect(tab).not.toBeNull();
  await act(async()=>tab?.click());await flush();
  const section=host.querySelector<HTMLElement>(
    `section[aria-label="${kind==="posts"?"Публикации":"Вопросы"} @b"]`)!;
  const moreText=kind==="posts"?"Показать ещё публикации":"Показать ещё вопросы";
  const button=[...section.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent===moreText);
  expect(button).toBeDefined();
  await act(async()=>{button?.click();button?.click();});await flush();
  expect(calls[kind]).toBe(1);
  const loading=[...section.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.disabled&&b.textContent?.trim()==="Загружаем…");
  expect(loading).toBeDefined();
  await act(async()=>fail.resolve(response(null,503)));await flush();
  expect(section.textContent).toContain(kind==="posts"?"Первый публичный момент":"Первый вопрос автора");
  expect(section.textContent).toContain("Не удалось загрузить следующую страницу");
  const retryButton=[...section.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent?.trim()===(kind==="posts"?"Повторить страницу публикаций":"Повторить страницу вопросов"));
  expect(retryButton).toBeDefined();
  await act(async()=>{retryButton?.click();retryButton?.click();});await flush();
  expect(calls[kind]).toBe(2);
  expect(calls.firstPosts).toBe(kind==="posts"?1:0);
  expect(calls.firstQuestions).toBe(kind==="questions"?1:0);
  await act(async()=>retry.resolve(response(kind==="posts"?
    {items:[firstPost,secondPost],nextCursor:null}:
    {items:[firstQuestion,secondQuestion],nextPage:null})));await flush();
  const items=[...section.querySelectorAll("li")];
  expect(items).toHaveLength(2);
  expect(items[0].textContent).toContain(kind==="posts"?"Первый публичный момент":"Первый вопрос автора");
  expect(items[1].textContent).toContain(kind==="posts"?"Второй публичный момент":"Второй вопрос автора");
  for(const [url,request] of network.mock.calls){
    expect(request?.method).toBe("GET");expect(String(url)).toMatch(/^\/api\/v1\//);
  }
 });

 it("AG2-PROFILE020 P14 independent author switching cannot leak old page flights",async()=>{
  const oldPost=pending<Response>();const oldQuestion=pending<Response>();
  const newPost=pending<Response>();const newQuestion=pending<Response>();
  const calls={bPosts:0,bQuestions:0,cPosts:0,cQuestions:0};
  const post=(name:string,id:string)=>({
    id,author:{id:"PRIVATE_AUTHOR",username:name,name:"Автор",avatarUrl:null,role:null},
    status:"published",text:`Публикация ${name} ${id}`,attachments:[],reactions:[],
    createdAt:"2026-10-20T12:00:00.000Z",publishedAt:"2026-10-20T12:00:00.000Z",
    commentCount:0,viewCount:1,myReaction:null,bookmarked:false,hasPoll:false,canEdit:false,
  });
  const question=(name:string,id:string)=>({
    id,title:`Вопрос ${name} ${id}`,body:"Поводок",category:"Поведение",status:"waiting",
    answerCount:0,createdAt:"2026-10-20T12:00:00.000Z",
    author:{id:"PRIVATE_AUTHOR",username:name,name:"Автор",avatarUrl:null},
  });
  network.mockImplementation((url:string)=>{
    if(url==="/api/v1/feed/status")
      return Promise.resolve(response({enabled:true,smartEnabled:false}));
    for(const name of ["b","c"]){
      if(url===`/api/v1/feed/profiles/${name}/posts?pageSize=20`)
        return Promise.resolve(response({items:[post(name,`${name}-p1`)],nextCursor:"older-1"}));
      if(url===`/api/v1/questions?author=${name}&sort=new&page=1`)
        return Promise.resolve(response({items:[question(name,`${name}-q1`)],nextPage:2}));
      if(url===`/api/v1/feed/profiles/${name}/posts?cursor=older-1&pageSize=20`){
        if(name==="b")calls.bPosts++;else calls.cPosts++;
        return name==="b"?oldPost.promise:newPost.promise;
      }
      if(url===`/api/v1/questions?author=${name}&sort=new&page=2`){
        if(name==="b")calls.bQuestions++;else calls.cQuestions++;
        return name==="b"?oldQuestion.promise:newQuestion.promise;
      }
    }
    throw Error("UNEXPECTED_GET:"+url);
  });
  const renderAuthor=async(username:string)=>{
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <PublicAuthorActivityRead username={username}/>
    </QueryClientProvider>));await flush();
  };
  const more=async(label:string)=>{
    const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent===label);
    expect(b).toBeDefined();await act(async()=>b?.click());
  };
  await renderAuthor("b");
  await more("Показать публикации и вопросы");await flush();
  await act(async()=>{
    [...host.querySelectorAll<HTMLButtonElement>("button")]
      .filter(b=>["Показать ещё публикации","Показать ещё вопросы"]
        .includes(b.textContent??""))
      .forEach(button=>button.click());
  });await flush();
  expect(calls.bPosts).toBe(1);expect(calls.bQuestions).toBe(1);
  await renderAuthor("c");
  expect(host.textContent).toContain("Публикация c c-p1");
  expect(host.textContent).toContain("Вопрос c c-q1");
  await act(async()=>{
    [...host.querySelectorAll<HTMLButtonElement>("button")]
      .filter(b=>["Показать ещё публикации","Показать ещё вопросы"]
        .includes(b.textContent??""))
      .forEach(button=>button.click());
  });await flush();
  expect(calls.cPosts).toBe(1);expect(calls.cQuestions).toBe(1);
  await act(async()=>{
    oldPost.resolve(response({items:[post("b","b-p2")],nextCursor:null}));
    oldQuestion.resolve(response({items:[question("b","b-q2")],nextPage:null}));
  });await flush();
  expect(host.textContent).not.toMatch(/Публикация b|Вопрос b/);
  const stillBusy=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .filter(b=>b.textContent==="Загружаем…"&&b.disabled);
  expect(stillBusy).toHaveLength(2);
  await act(async()=>{
    newPost.resolve(response({items:[post("c","c-p2")],nextCursor:null}));
    newQuestion.resolve(response({items:[question("c","c-q2")],nextPage:null}));
  });await flush();
  expect(host.textContent).toContain("Публикация c c-p2");
  expect(host.textContent).toContain("Вопрос c c-q2");
  expect(calls.cPosts).toBe(1);expect(calls.cQuestions).toBe(1);
 });

 it.each(["posts","questions"] as const)(
  "AG2-PROFILE020 P15 unauthorized next-page is fail-closed, not a retry (%s)",async(kind)=>{
  const post=(id:string)=>({
    id,author:{id:"PRIVATE_AUTHOR",username:"b",name:"Автор",avatarUrl:null,role:null},
    status:"published",text:"Текст "+id,attachments:[],reactions:[],
    createdAt:"2026-10-20T12:00:00.000Z",publishedAt:"2026-10-20T12:00:00.000Z",
    commentCount:0,viewCount:0,myReaction:null,bookmarked:false,hasPoll:false,canEdit:false,
  });
  const question=(id:string)=>({
    id,title:"Тема "+id,body:"Поводок",category:"Поведение",status:"waiting",
    answerCount:0,createdAt:"2026-10-20T12:00:00.000Z",
    author:{id:"PRIVATE_AUTHOR",username:"b",name:"Автор",avatarUrl:null},
  });
  let nextCalls=0;
  network.mockImplementation(async(url:string)=>{
    if(url==="/api/v1/user/profile/public?username=b")return response(publicUser("b"));
    if(url==="/api/v1/feed/status")return response({enabled:true,smartEnabled:false});
    if(url==="/api/v1/feed/profiles/b/posts?pageSize=20")
      return response({items:[post("p1")],nextCursor:"older-1"});
    if(url==="/api/v1/questions?author=b&sort=new&page=1")
      return response({items:[question("q1")],nextPage:2});
    if(url==="/api/v1/feed/profiles/b/posts?cursor=older-1&pageSize=20"){
      nextCalls++;return response(null,kind==="posts"?401:503);
    }
    if(url==="/api/v1/questions?author=b&sort=new&page=2"){
      nextCalls++;return response(null,kind==="questions"?401:503);
    }
    throw Error("UNEXPECTED_GET:"+url);
  });
  await mountConcurrentAuthorActivity("b");
  const reveal=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent==="Показать публикации и вопросы");
  await act(async()=>reveal?.click());await flush();
  const section=host.querySelector<HTMLElement>(
    `section[aria-label="${kind==="posts"?"Публикации":"Вопросы"} @b"]`)!;
  const button=[...section.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent===(kind==="posts"?"Показать ещё публикации":"Показать ещё вопросы"));
  await act(async()=>button?.click());await flush();
  expect(section.textContent).toContain("Сессия завершена. Войдите снова.");
  expect(section.querySelector("ul")).toBeNull();
  expect(section.querySelectorAll("button")).toHaveLength(0);
  expect(nextCalls).toBe(1);
 });

 it.each([
  ["posts",403,"Нет доступа к публикациям автора."],
  ["posts",404,"Публикации автора недоступны."],
  ["questions",403,"Нет доступа к вопросам автора."],
  ["questions",404,"Вопросы автора недоступны."],
 ] as const)(
  "AG2-PROFILE020 P17 author %s next-page HTTP%s closes only denied list",async(kind,code,message)=>{
  const post={id:"p1",author:{id:"PRIVATE_AUTHOR",username:"b",name:"Автор",avatarUrl:null,role:null},
    status:"published",text:"PRIVATE_FIRST_POST",attachments:[],reactions:[],
    createdAt:"2026-10-20T12:00:00.000Z",publishedAt:"2026-10-20T12:00:00.000Z",
    commentCount:0,viewCount:0,myReaction:null,bookmarked:false,hasPoll:false,canEdit:false};
  const question={id:"q1",title:"PRIVATE_FIRST_QUESTION",body:"Описание",category:"Поведение",
    status:"waiting",answerCount:0,createdAt:"2026-10-20T12:00:00.000Z",
    author:{id:"PRIVATE_AUTHOR",username:"b",name:"Автор",avatarUrl:null}};
  const calls={postFirst:0,questionFirst:0,postNext:0,questionNext:0};
  network.mockImplementation(async(url:string,init?:RequestInit)=>{
    if(init?.method&&init.method!=="GET")throw Error("READ_ONLY_TEST");
    if(url==="/api/v1/user/profile/public?username=b")return response(publicUser("b"));
    if(url==="/api/v1/feed/status")return response({enabled:true,smartEnabled:false});
    if(url==="/api/v1/feed/profiles/b/posts?pageSize=20"){
      calls.postFirst++;return response({items:[post],nextCursor:"older-1"});
    }
    if(url==="/api/v1/questions?author=b&sort=new&page=1"){
      calls.questionFirst++;return response({items:[question],nextPage:2});
    }
    if(url==="/api/v1/feed/profiles/b/posts?cursor=older-1&pageSize=20"){
      calls.postNext++;return response(null,kind==="posts"?code:503);
    }
    if(url==="/api/v1/questions?author=b&sort=new&page=2"){
      calls.questionNext++;return response(null,kind==="questions"?code:503);
    }
    throw Error("UNEXPECTED_GET:"+url);
  });
  await mountConcurrentAuthorActivity("b");
  const reveal=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent==="Показать публикации и вопросы");
  await act(async()=>reveal?.click());await flush();
  const denied=host.querySelector<HTMLElement>(
    `section[aria-label="${kind==="posts"?"Публикации":"Вопросы"} @b"]`)!;
  const other=host.querySelector<HTMLElement>(
    `section[aria-label="${kind==="posts"?"Вопросы":"Публикации"} @b"]`)!;
  expect(denied.textContent).toContain(kind==="posts"?"PRIVATE_FIRST_POST":"PRIVATE_FIRST_QUESTION");
  expect(other.textContent).toContain(kind==="posts"?"PRIVATE_FIRST_QUESTION":"PRIVATE_FIRST_POST");
  const more=[...denied.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent===(kind==="posts"?"Показать ещё публикации":"Показать ещё вопросы"));
  expect(more).toBeDefined();
  await act(async()=>more?.click());await flush();
  expect(denied.querySelector('[role="alert"]')?.textContent).toBe(message);
  expect(denied.querySelector("ul")).toBeNull();
  expect(denied.querySelector("li a")).toBeNull();
  expect(denied.textContent).not.toContain(kind==="posts"?"PRIVATE_FIRST_POST":"PRIVATE_FIRST_QUESTION");
  expect(denied.textContent).not.toContain("PRIVATE_DB_STACK");
  expect(denied.textContent).not.toContain("Сессия завершена");
  expect(denied.textContent).not.toContain("Нет доступных публикаций");
  expect(denied.textContent).not.toContain("Вопросов пока нет");
  expect(denied.querySelectorAll("button")).toHaveLength(0);
  expect(other.textContent).toContain(kind==="posts"?"PRIVATE_FIRST_QUESTION":"PRIVATE_FIRST_POST");
  expect(other.querySelector("li a")).not.toBeNull();
  expect([...other.querySelectorAll<HTMLButtonElement>("button")]
    .some(b=>b.textContent===(kind==="posts"?"Показать ещё вопросы":"Показать ещё публикации")))
    .toBe(true);
  expect(calls).toEqual({postFirst:1,questionFirst:1,
    postNext:kind==="posts"?1:0,questionNext:kind==="questions"?1:0});
  for(const [url,request] of network.mock.calls){
    expect(request?.method).toBe("GET");expect(String(url)).toMatch(/^\/api\/v1\//);
  }
 });

 it("AG2-PROFILE020 P16 old actor page completion cannot block new actor's profile",async()=>{
  const oldPost=pending<Response>();const oldQuestion=pending<Response>();
  const newPost=pending<Response>();const newQuestion=pending<Response>();
  const calls={aPost:0,aQuestion:0,bPost:0,bQuestion:0};
  const post=(username:string,id:string)=>({
    id,author:{id:"PRIVATE_AUTHOR",username,name:"Автор",avatarUrl:null,role:null},
    status:"published",text:`Текст ${username} ${id}`,attachments:[],reactions:[],
    createdAt:"2026-10-20T12:00:00.000Z",publishedAt:"2026-10-20T12:00:00.000Z",
    commentCount:0,viewCount:0,myReaction:null,bookmarked:false,hasPoll:false,canEdit:false,
  });
  const question=(username:string,id:string)=>({
    id,title:`Вопрос ${username} ${id}`,body:"Поводок",category:"Поведение",
    status:"waiting",answerCount:0,createdAt:"2026-10-20T12:00:00.000Z",
    author:{id:"PRIVATE_AUTHOR",username,name:"Автор",avatarUrl:null},
  });
  network.mockImplementation((url:string)=>{
    for(const name of ["b","c"]){
      if(url===`/api/v1/user/profile/public?username=${name}`)
        return Promise.resolve(response(publicUser(name)));
      if(url===`/api/v1/feed/profiles/${name}/posts?pageSize=20`)
        return Promise.resolve(response({items:[post(name,`${name}-p1`)],nextCursor:"older-1"}));
      if(url===`/api/v1/questions?author=${name}&sort=new&page=1`)
        return Promise.resolve(response({items:[question(name,`${name}-q1`)],nextPage:2}));
      if(url===`/api/v1/feed/profiles/${name}/posts?cursor=older-1&pageSize=20`){
        calls[name==="b"?"aPost":"bPost"]++;
        return name==="b"?oldPost.promise:newPost.promise;
      }
      if(url===`/api/v1/questions?author=${name}&sort=new&page=2`){
        calls[name==="b"?"aQuestion":"bQuestion"]++;
        return name==="b"?oldQuestion.promise:newQuestion.promise;
      }
    }
    if(url==="/api/v1/feed/status")
      return Promise.resolve(response({enabled:true,smartEnabled:false}));
    throw Error("UNEXPECTED_GET:"+url);
  });
  const openActivity=async()=>{
    const reveal=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b=>b.textContent==="Показать публикации и вопросы");
    expect(reveal).toBeDefined();
    await act(async()=>reveal?.click());await flush();
  };
  const loadBoth=async()=>{
    const more=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .filter(b=>b.textContent==="Показать ещё публикации"||
        b.textContent==="Показать ещё вопросы");
    expect(more).toHaveLength(2);
    await act(async()=>{more.forEach(button=>button.click());});await flush();
  };
  await mountConcurrentAuthorActivity("b");await openActivity();await loadBoth();
  expect(calls.aPost).toBe(1);expect(calls.aQuestion).toBe(1);
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"B",username:"b",role:"USER"}));await flush();
  expect(host.textContent).not.toContain("Текст b b-p1");
  expect(host.textContent).not.toContain("Вопрос b b-q1");
  await mountConcurrentAuthorActivity("c");
  await openActivity();await loadBoth();
  expect(calls.bPost).toBe(1);expect(calls.bQuestion).toBe(1);
  await act(async()=>{
    oldPost.resolve(response({items:[post("b","b-p2")],nextCursor:null}));
    oldQuestion.resolve(response({items:[question("b","b-q2")],nextPage:null}));
  });await flush();
  expect(host.textContent).not.toContain("Текст b b-p2");
  expect(host.textContent).not.toContain("Вопрос b b-q2");
  expect([...host.querySelectorAll<HTMLButtonElement>("button")]
    .filter(b=>b.disabled&&b.textContent==="Загружаем…")).toHaveLength(2);
  await act(async()=>{
    newPost.resolve(response({items:[post("c","c-p2")],nextCursor:null}));
    newQuestion.resolve(response({items:[question("c","c-q2")],nextPage:null}));
  });await flush();
  expect(host.textContent).toContain("Текст c c-p2");
  expect(host.textContent).toContain("Вопрос c c-q2");
  expect(calls.bPost).toBe(1);expect(calls.bQuestion).toBe(1);
 });

 it("AG2-PERF01 real App deferred article list, locked detail, return navigation",async()=>{
  const card={id:"article_1",slug:"guide_one",title:"Статья про прогулки",
    description:"Открытая карточка",visibility:"PAID",hasAccess:false,
    likeCount:0,authorUsername:"trainer"};
  network.mockImplementation(async(url:string,request?:RequestInit)=>{
    if(url==="/api/v1/articles/guide_one/view" && request?.method==="POST")
      return response(null);
    if(url==="/api/v1/articles")return response([card]);
    if(url==="/api/v1/articles/guide_one")return response({
      ...card,contentType:"TEXT",content:null});
    throw Error("UNEXPECTED_READ_"+url);
  });
  const show=async(text:string)=>{
    for(let i=0;i<40&&!host.textContent?.includes(text);i++)await flush();
    expect(host.textContent).toContain(text);
  };
  await mount("/articles");
  await show("Статья про прогулки");
  expect(host.querySelector('a[href="/articles/guide_one"]')).not.toBeNull();
  expect(host.innerHTML).not.toContain("PRIVATE_");
  const open=host.querySelector<HTMLAnchorElement>('a[href="/articles/guide_one"]');
  await act(async()=>open?.dispatchEvent(new MouseEvent("click",{
    bubbles:true,cancelable:true,button:0,
  })));
  expect(window.location.pathname).toBe("/articles/guide_one");
  await show("Для чтения статьи нужна действующая подписка");
  expect(host.textContent).not.toContain("PRIVATE_");
  const back=host.querySelector<HTMLAnchorElement>('a[href="/articles"]');
  expect(back).not.toBeNull();
  await act(async()=>back?.dispatchEvent(new MouseEvent("click",{
    bubbles:true,cancelable:true,button:0,
  })));
  expect(window.location.pathname).toBe("/articles");
  await show("Статья про прогулки");
  // Registered Hono view count is a dedicated POST AFTER confirmed detail
  // GET. It is not a read and must not be retried on a missing ACK.
  const seen=network.mock.calls.map(([url,request])=>({url,method:request?.method}));
  expect(seen.filter(call=>call.url==="/api/v1/articles/guide_one/view"))
    .toEqual([{url:"/api/v1/articles/guide_one/view",method:"POST"}]);
  for(const [url,request] of network.mock.calls){
    if(url==="/api/v1/articles/guide_one/view")continue;
    // App bootstrap can read its own wallet status before article navigation;
    // permit this precise read-only endpoint, not arbitrary cross-module GETs.
    if(url==="/api/v1/user/onboarding-tour" || url==="/api/v1/gafus/status"){
      expect(request?.method).toBe("GET");expect(request?.body).toBeUndefined();
      continue;
    }
    expect(url).toMatch(/^\/api\/v1\/articles(?:\/guide_one)?$/);
    expect(request?.method).toBe("GET");
    expect(request?.body).toBeUndefined();
  }
 });

});
