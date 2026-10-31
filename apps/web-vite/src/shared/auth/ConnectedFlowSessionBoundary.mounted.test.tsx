// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "./useAuth";
import {navigate} from "../router/location";
import type {AlbumSummary,AlbumPhoto,GalleryPage}
  from "../../features/gallery/galleryApi";
import type {Catalog,SlotsView,BookingsPage,SlotRange}
  from "../../features/consultations/consultationReadApi";
import type {TrainingDaysOverview,TrainingDaySummary}
  from "../../features/training/trainingDaysApi";
import type {TrainingDayDetail} from "../../features/training/trainingDayApi";
import type {DailyToday,DailyDay} from "../../features/daily-course/dailyCourseApi";
const user=(id="A",username="ownerA")=>({id,username,role:"USER" as const});
const page=<T,>(items:T[]):GalleryPage<T>=>({
 items,nextCursor:null,isOwner:true,enabled:true,usedSlots:1,limit:200});
const album:AlbumSummary={id:"album_01",ownerId:"A",ownerUsername:"ownerA",
 name:"Альбом PRIVATE_A",description:"PRIVATE_ALBUM_DESC",
 isVisible:false,canEdit:true,photoCount:1,coverThumbUrl:null,
 urlsExpireAt:null};
const photo:AlbumPhoto={id:"photo_01",albumId:"album_01",
 caption:"PRIVATE_PHOTO_A",status:"ready",width:100,height:100,
 thumbUrl:null,fullUrl:null,urlsExpireAt:null};
const trainer={id:"cy_01",userId:"trainer1",username:"trainer_a",
 name:"Кинолог Анна",about:"PRIVATE_TRAINER_A",slotDurationMin:45};
const eligibility={canBook:true,reason:null,nextBookingAt:null,message:null} as const;
const catalog=():Catalog=>({items:[trainer],eligibility});
const slot={id:"slot_01",startAtUtc:"2026-10-19T08:00:00.000Z",
 endAtUtc:"2026-10-19T08:45:00.000Z",status:"FREE" as const};
const first:TrainingDaySummary={
 trainingDayId:"day_01",dayOnCourseId:"link_01",courseId:"course_01",
 title:"PRIVATE_TRAINING_A",type:"practice",userStatus:"IN_PROGRESS",
 estimatedDuration:10,theoryMinutes:5,equipment:"Поводок",isLocked:false};
const trainingDays=():TrainingDaysOverview=>({
 courseId:"course_01",courseDescription:"План",
 courseEquipment:"Поводок",courseTrainingLevel:"BEGINNER",
 requiresPersonalization:false,days:[first]});
const trainingDay=():TrainingDayDetail=>({
 trainingDayId:"day_01",dayOnCourseId:"link_01",courseId:"course_01",
 title:"PRIVATE_TRAINING_A",type:"practice",description:"Практика",
 userStatus:"IN_PROGRESS",steps:[{id:"step_01",title:"PRIVATE_STEP_A",
 description:"Прогулка",type:"PRACTICE",status:"IN_PROGRESS",
 order:0,durationSec:60,locked:false,videoUrl:null,imageUrls:[]}]});
const today:DailyToday={mskDate:"2026-10-18",scheduleId:"schedule_01",
 userStatus:"IN_PROGRESS",day:{id:"bundle_01",title:"PRIVATE_DAILY_A",
 description:"Курс дня",type:"training",estimatedDuration:10,
 theoryMinutes:5,stepsCount:1},stepsSummary:{total:1,completed:0}};
const daily:DailyDay={scheduleId:"schedule_01",mskDate:"2026-10-18",
 trainingDayId:"bundle_01",bundleId:"bundle_01",
 title:"PRIVATE_DAILY_A",description:"Задание дня",type:"training",
 userStatus:"IN_PROGRESS",
 steps:[{id:"step_daily",title:"PRIVATE_DAILY_STEP_A",
 description:"Прогулка",type:"PRACTICE",status:"IN_PROGRESS",
 order:0,durationSec:90,locked:false,videoUrl:null,imageUrls:[]}]};
const hold=<T,>()=>{let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};};
let node:HTMLDivElement,root:Root,cache:QueryClient;
let fetcher:ReturnType<typeof vi.fn<(path:string,options:RequestInit)=>Promise<Response>>>;
let getAlbum:ReturnType<typeof vi.fn<
 (id:string,owner:string,name:string)=>Promise<AlbumSummary>>>;
let listAlbums:ReturnType<typeof vi.fn<
 (id:string,name:string,cursor:string|null)=>Promise<GalleryPage<AlbumSummary>>>>;
let getPhotos:ReturnType<typeof vi.fn<
 (id:string,cursor:string|null)=>Promise<GalleryPage<AlbumPhoto>>>>;
let trainers:ReturnType<typeof vi.fn<()=>Promise<Catalog>>>;
let slots:ReturnType<typeof vi.fn<(id:string,range:SlotRange)=>Promise<SlotsView>>>;
let mine:ReturnType<typeof vi.fn<
 (username:string,cursor:string|null)=>Promise<BookingsPage>>>;
let days:ReturnType<typeof vi.fn<(type:string)=>Promise<TrainingDaysOverview>>>;
let day:ReturnType<typeof vi.fn<
 (type:string,value:TrainingDaySummary)=>Promise<TrainingDayDetail>>>;
let loadToday:ReturnType<typeof vi.fn<()=>Promise<DailyToday>>>;
let loadDaily:ReturnType<typeof vi.fn<(today:DailyToday)=>Promise<DailyDay>>>;
let authMe:ReturnType<typeof vi.fn<()=>Promise<Response>>>;
let refresh:ReturnType<typeof vi.fn<()=>Promise<Response>>>;
let logout:ReturnType<typeof vi.fn<()=>Promise<Response>>>;
let login:ReturnType<typeof vi.fn<()=>Promise<Response>>>;
// Warm only modules exercised by this synthetic App test; production stays lazy.
beforeAll(async()=>{await Promise.all([
 import("../../features/profile/ProfileOverview"),
 import("../../features/courses/CourseCatalog"),
 import("../../features/training/TrainingIndexOptInHarness"),
 import("../../features/consultations/ConsultationsLivePage"),
]);});
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(done=>setTimeout(done,100));});
}};
const json=(data:unknown,status=200)=>new Response(JSON.stringify({
 success:status<400,data,...(status>=400?{error:"AUTH_STATUS"}:{}),
}),{status});
async function mount(path="/profile",actor:userType|null=user(),cold=false){
 window.history.replaceState(null,"",path);
 if(!cold)cache.setQueryData(CURRENT_USER_QUERY_KEY,actor);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showGalleryOptIn
    galleryAlbumLoader={listAlbums} galleryDetailLoader={getAlbum}
    galleryPhotoLoader={getPhotos}
    showTrainingFlowOptIn trainingDaysLoader={days}
    trainingDayLoader={day} dailyTodayLoader={loadToday}
    dailyDayLoader={loadDaily}
    showConsultationsFlowOptIn consultationsLoaders={{
      specialists:trainers,slots,mine,
    }}/>
 </QueryClientProvider>));await tick();
}
type userType=ReturnType<typeof user>;
async function go(path:string){
 await act(async()=>navigate(path as Parameters<typeof navigate>[0]));
 await tick();
}
async function click(label:string){
 if(label==="Выйти"){
  // Legacy GAFUS navigation keeps logout behind the burger menu.
  const burger=node.querySelector<HTMLButtonElement>('button[aria-label="Открыть меню"]');
  expect(burger).not.toBeNull();
  await act(async()=>burger?.click());await tick();
  label="Выход";
 }
 const b=[...node.querySelectorAll<HTMLButtonElement>("button")]
  .find(x=>label==="Выход" ? x.textContent?.trim().endsWith(label) : x.textContent?.trim()===label);
 expect(b,label).toBeDefined();
 await act(async()=>b?.click());await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{
  retry:false,refetchOnWindowFocus:false}}});
 listAlbums=vi.fn(async()=>page([album]));
 getAlbum=vi.fn(async()=>album);
 getPhotos=vi.fn(async()=>page([photo]));
 trainers=vi.fn(async()=>catalog());
 slots=vi.fn(async(_id:string,_range:SlotRange):Promise<SlotsView>=>({
  items:[slot],eligibility,
 }));
 mine=vi.fn(async(_name:string,_cursor:string|null):Promise<BookingsPage>=>({
  items:[],nextCursor:null,
 }));
 days=vi.fn(async()=>trainingDays());
 day=vi.fn(async()=>trainingDay());
 loadToday=vi.fn(async()=>today);
 loadDaily=vi.fn(async()=>daily);
 authMe=vi.fn(async()=>json(user()));
 refresh=vi.fn(async()=>json(null));
 logout=vi.fn(async()=>json(null));
 login=vi.fn(async()=>json({user:user()}));
 fetcher=vi.fn(async(url:string,opts:RequestInit)=>{
  if(url==="/api/v1/auth/me")return authMe();
  if(url==="/api/v1/auth/refresh"&&opts.method==="POST")return refresh();
  if(url==="/api/v1/auth/logout"&&opts.method==="POST")return logout();
  if(url==="/api/v1/auth/login"&&opts.method==="POST")return login();
  if(opts.method!=="GET")throw Error("OTHER_MUTATION_FORBIDDEN "+url);
  if(url==="/api/v1/user/profile")return json({id:"A",username:"ownerA",
   profile:{fullName:"PROFILE_PRIVATE_A",city:"Самара",about:""},
   email:"SECRET_EMAIL_A"});
  if(url==="/api/v1/pets")return json([
   {id:"pet_01",name:"PET_PRIVATE_A",type:"DOG",breed:"Корги",showInProfile:false},
  ]);
  if(url==="/api/v1/pets/pet_01")return json({
   id:"pet_01",name:"PET_PRIVATE_A",type:"DOG",
   breed:"Корги",showInProfile:false,birthDate:null,
   weightKg:null,heightCm:null,notes:"SECRET_PET_MEDICAL",
  });
  if(url==="/api/v1/courses")return json([{
   id:"course_01",name:"Курс",type:"IMPULSE_CONTROL",
   shortDesc:"",duration:"14 дней",isPaid:false,isPrivate:false,
   hasAccess:true,isFavorite:false,userStatus:"IN_PROGRESS",
   trainingLevel:"BEGINNER",
  }]);
  throw Error("UNEXPECTED_API "+url);
 });
 vi.stubGlobal("fetch",fetcher);
 node=document.createElement("div");document.body.append(node);root=createRoot(node);
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();node.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");
});
describe("AG2 cross-flow auth boundary actual App",()=>{
 it("X00 genuine cold browser /me hydration permits signed daily deep-link without false session change",async()=>{
  // No pre-seeded auth cache, unlike every earlier mounted flow test: real
  // Chromium starts with /me PENDING and later resolves an authenticated user.
  await mount("/courses",null,true);
  expect(fetcher.mock.calls.some(([path])=>path==="/api/v1/auth/me")).toBe(true);
  await go("/daily-course/schedule_01");
  expect(node.textContent).not.toContain("Сессия изменилась. Откройте приложение заново.");
  expect(loadToday).toHaveBeenCalled();
  await go("/consultations");
  expect(node.textContent).not.toContain("Сессия изменилась. Откройте приложение заново.");
  expect(trainers).toHaveBeenCalled();
 });
 it("X01 same owner refresh without identity change preserves authorized browsing",async()=>{
  await mount("/profile");
  await go("/profile/albums/album_01");
  expect(node.textContent).toContain("PRIVATE_ALBUM_DESC");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user()));
  await tick();
  await go("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("PRIVATE_TRAINER_A");
  await go("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).toContain("PRIVATE_STEP_A");
 });
 it("X02 A->B->A across /login unmount cannot reopen gallery, consultations, training",async()=>{
  await mount("/profile/albums/album_01");
  expect(node.textContent).toContain("PRIVATE_ALBUM_DESC");
  await go("/login");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user("B","ownerB")));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,user()));
  await go("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("PRIVATE_TRAINER_A");
  await go("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).not.toContain("PRIVATE_STEP_A");
  await go("/profile/albums/album_01");
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
  expect(trainers).not.toHaveBeenCalled();
  expect(day).not.toHaveBeenCalled();
 });
 it("X03 same id new sessionRevision after route hop closes all flows",async()=>{
  await mount("/profile");
  await go("/pets");
  // The real pet GET may finish after the history transition under the full
  // parallel Vitest suite; require verified old-owner data before retiring it.
  for(let i=0;i<12&&!node.textContent?.includes("PET_PRIVATE_A");i++)await tick();
  expect(node.textContent).toContain("PET_PRIVATE_A");
  await go("/login");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   ...user(),sessionRevision:"new_session",
  }));
  await go("/consultations");
  expect(node.textContent).toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("Кинолог Анна");
 });
 it("X04 pending /auth/me refresh must hide old profile & unrelated private lists",async()=>{
  await mount("/profile/albums/album_01");
  const d=hold<Response>();
  authMe.mockReturnValueOnce(d.promise);
  const pending=cache.invalidateQueries({queryKey:CURRENT_USER_QUERY_KEY});
  await tick();
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
  expect(node.textContent).toContain("Личные данные временно скрыты");
  await act(async()=>d.resolve(json(user())));await pending;await tick();
  // The gallery is a separately lazy-loaded authenticated route. Wait for
  // its fresh verified GET after /auth/me resumes; do not accept stale DOM.
  for(let attempt=0;attempt<20&&!node.textContent?.includes("PRIVATE_ALBUM_DESC");attempt++)
    await tick();
  expect(node.textContent).toContain("PRIVATE_ALBUM_DESC");
 });
 it("X05 refresh 401 and repeat 401 => logout and private cache removed",async()=>{
  await mount("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("PRIVATE_TRAINER_A");
  cache.setQueryData(["gallery","album","A","ownerA","album_01"],{
   private:"SECRET_SIGNED_MEDIA_URL"});
  authMe.mockResolvedValueOnce(json(null,401));
  refresh.mockResolvedValueOnce(json(null,401));
  await act(async()=>{await cache.invalidateQueries({
   queryKey:CURRENT_USER_QUERY_KEY,
  });});await tick();
  expect(node.textContent).not.toContain("PRIVATE_TRAINER_A");
  expect(cache.getQueryData(["gallery","album","A","ownerA","album_01"]))
   .toBeUndefined();
  expect(refresh).toHaveBeenCalledTimes(1);
 });
 it("X06 ambiguous refresh 503 hides private but is NOT treated as successful logout",async()=>{
  await mount("/profile/albums/album_01");
  authMe.mockResolvedValueOnce(json(null,401));
  refresh.mockResolvedValueOnce(json(null,503));
  await act(async()=>{await cache.invalidateQueries({
   queryKey:CURRENT_USER_QUERY_KEY,
  });});await tick();
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
  expect(node.textContent).toContain("Личные данные скрыты");
  expect(logout).not.toHaveBeenCalled();
 });
 it("X07 logout pending hides private immediately; ACK leaves cache empty",async()=>{
  await mount("/profile");
  cache.setQueryData(["consultations","my","A","ownerA"],{
   secret:"SECRET_PRIVATE_BOOKING_A"});
  const d=hold<Response>();
  logout.mockReturnValueOnce(d.promise);
  await click("Выйти");
  expect(node.textContent).not.toContain("PROFILE_PRIVATE_A");
  expect(node.textContent).toContain("Личные данные скрыты");
  await act(async()=>d.resolve(json(null)));await tick();
  expect(cache.getQueryData(["consultations","my","A","ownerA"]))
   .toBeUndefined();
  expect(node.textContent).not.toContain("PROFILE_PRIVATE_A");
 });
 it("X13 ambiguous logout 503 remains fail-closed (not ACK)",async()=>{
  await mount("/profile/albums/album_01");
  logout.mockResolvedValueOnce(json(null,503));
  await click("Выйти");
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
  expect(node.textContent).toContain("Личные данные скрыты");
  expect(logout).toHaveBeenCalledTimes(1);
 });
 it("X08 private gallery/training remain guarded; live consultations need API",async()=>{
  window.history.replaceState(null,"","/profile/albums/album_01");
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <App/>
  </QueryClientProvider>));await tick();
  expect(node.textContent).toContain("Не удалось загрузить фотоальбомы");
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
  expect(listAlbums).not.toHaveBeenCalled();
  await go("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).toContain("Не удалось загрузить дни тренировок");
  expect(node.textContent).not.toContain("PRIVATE_STEP_A");
  expect(days).not.toHaveBeenCalled();
  await go("/consultations/trainer1");
  // Live Hono consultation view may render the actual catalog or a safe
  // server-unavailable state; neither can render private synthetic fixtures.
  expect(node.textContent).toMatch(/Консультации с кинологом|Каталог кинологов/);
  expect(node.textContent).not.toContain("Страница не найдена");
  expect(node.textContent).not.toContain("PRIVATE_STEP_A");
  expect(trainers).not.toHaveBeenCalled();
 });
 it("X09 guest cannot load cross-flow deep links",async()=>{
  authMe.mockResolvedValueOnce(json(null,401));
  refresh.mockResolvedValueOnce(json(null,401));
  await mount("/consultations/mine",null);
  expect(mine).not.toHaveBeenCalled();
  await go("/profile/albums/album_01");
  expect(getAlbum).not.toHaveBeenCalled();
  await go("/trainings/IMPULSE_CONTROL/link_01");
  expect(day).not.toHaveBeenCalled();
  expect(node.textContent).toMatch(/Войти|Требуется авторизация/);
 });
 it("X11 real AuthPanel login mutation from guest can open opt-in profile",async()=>{
  await mount("/login",null);
  expect(node.textContent).toContain("Войти");
  const name=node.querySelector<HTMLInputElement>("#login-name");
  const password=node.querySelector<HTMLInputElement>("#login-password");
  await act(async()=>{
    for(const [field,value] of
      ([[name,"ownerA"],[password,"fixture_only"]] as const)){
      if(!field)throw Error("MISSING_LOGIN_FIELD");
      const set=Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,"value")?.set;
      set?.call(field,value);
      field.dispatchEvent(new Event("input",{bubbles:true}));
    }
    node.querySelector("form")?.dispatchEvent(
      new Event("submit",{bubbles:true,cancelable:true}));
  });await tick();
  await go("/profile");
  expect(node.textContent).toContain("PROFILE_PRIVATE_A");
  expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({username:"ownerA"});
  expect(node.textContent).not.toContain("Личные данные скрыты");
  expect(login).toHaveBeenCalledTimes(1);
 });
 it("X12 deliberate logout A then login B gets fresh owned session, not A data",async()=>{
  await mount("/profile");
  logout.mockResolvedValueOnce(json(null));
  authMe.mockResolvedValue(json(null,401));
  refresh.mockResolvedValue(json(null,401));
  await click("Выйти");
  login.mockResolvedValueOnce(json({user:user("B","ownerB")}));
  await go("/login");
  const name=node.querySelector<HTMLInputElement>("#login-name");
  const password=node.querySelector<HTMLInputElement>("#login-password");
  await act(async()=>{
    for(const [field,value] of
      ([[name,"ownerB"],[password,"new-fixture"]] as const)){
      if(!field)throw Error("MISSING_LOGIN_FIELD");
      const set=Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,"value")?.set;
      set?.call(field,value);
      field.dispatchEvent(new Event("input",{bubbles:true}));
    }
    node.querySelector("form")?.dispatchEvent(
      new Event("submit",{bubbles:true,cancelable:true}));
  });await tick();
  await go("/profile/albums/album_01");
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
  expect(node.textContent).not.toContain("Сессия изменилась");
  expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({username:"ownerB"});
  expect(logout).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledTimes(1);
 });
 it("X14 production questions must not inherit gallery-only irreversible session fence",async()=>{
  // main.tsx mounts <App showGalleryOptIn /> in production. A harmless
  // /auth/me cache retirement must not strand unrelated question routes on
  // the owner-gallery-specific 'reopen application' screen.
  const questionPath="/questions/cmw4rnj7000dme01jtt1refb";
  window.history.replaceState(null,"",questionPath);
  cache.setQueryData(CURRENT_USER_QUERY_KEY,user());
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <App showGalleryOptIn />
  </QueryClientProvider>));
  await tick();
  await act(async()=>cache.removeQueries({queryKey:CURRENT_USER_QUERY_KEY,exact:true}));
  await tick();
  expect(window.location.pathname).toBe(questionPath);
  expect(node.textContent).not.toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("Для нового просмотра личных разделов");
  expect(node.querySelector('[aria-label="Защита сессии связанных разделов"]')).toBeNull();
 });
 it("X15 production gallery owner routes keep A->B->A fencing",async()=>{
  window.history.replaceState(null,"","/profile/albums/album_01");
  cache.setQueryData(CURRENT_USER_QUERY_KEY,user());
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <App showGalleryOptIn galleryAlbumLoader={listAlbums}
      galleryDetailLoader={getAlbum} galleryPhotoLoader={getPhotos}/>
  </QueryClientProvider>));
  await tick();
  expect(node.textContent).toContain("PRIVATE_ALBUM_DESC");
  await act(async()=>{
    cache.setQueryData(CURRENT_USER_QUERY_KEY,user("B","ownerB"));
    cache.setQueryData(CURRENT_USER_QUERY_KEY,user());
  });
  await tick();
  expect(node.textContent).toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
 });
 it("X10 late album payload after logout cannot render on training URL",async()=>{
  const d=hold<AlbumSummary>();getAlbum.mockReturnValueOnce(d.promise);
  await mount("/profile/albums/album_01");
  await go("/login");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,null));
  await go("/trainings/IMPULSE_CONTROL/link_01");
  await act(async()=>d.resolve(album));await tick();
  expect(node.textContent).not.toContain("PRIVATE_ALBUM_DESC");
  expect(node.textContent).not.toContain("PRIVATE_STEP_A");
  expect(day).not.toHaveBeenCalled();
 });
});
