/** Deterministic, read-only, local-only desktop/mobile screenshot regression tests.
 * Baselines are checkpoints of REFACTOR UI, not evidence of parity with production.
 * Run: node scripts/refactor/visual-regression.mjs --update
 * Then: node scripts/refactor/visual-regression.mjs
 */
import { realpathSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=process.env.GAFUS_VISUAL_PORT??"5173";
if(!/^[0-9]{4,5}$/.test(port) || Number(port)<1024 || Number(port)>65535)
 throw Error("Invalid visual-test port");
const localOrigin=`http://127.0.0.1:${port}`;
if (![root,join(root,"apps/web-vite")].includes(realpathSync(process.cwd())))
 throw Error("Unexpected project root; refusing to run");
const binary=resolve(root,".local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if (!existsSync(binary)||!realpathSync(binary).startsWith(root+"/")) throw Error("Chromium must be inside Refactor");
const baseline=resolve(root,"apps/web-vite/visual-baselines");
const actual=resolve(root,".design-verify/visual-current");
for(const folder of [baseline,actual]) mkdirSync(folder,{recursive:true});
const update=process.argv.includes("--update");
const viewports=[{name:"desktop",width:1280,height:800},{name:"mobile",width:390,height:844}];
const screens=[
 {name:"home",path:"/",auth:false},
 {name:"home-owner-redirect",path:"/",auth:true},{name:"login",path:"/login",auth:false},
 {name:"register",path:"/register",auth:false},
 {name:"courses",path:"/courses",auth:true},
 {name:"courses-daily",path:"/courses",auth:true},
 {name:"trainings-root",path:"/trainings",auth:true},
 {name:"open-menu",path:"/courses",auth:true,menu:true},
 {name:"profile",path:"/profile",auth:true},
 {name:"profile-gafus",path:"/profile?tab=gafus",auth:true},
 {name:"profile-delete",path:"/profile/delete-account",auth:true},
 {name:"profile-tour",path:"/profile?tab=settings",auth:true},
 {name:"feed-alias",path:"/feed",auth:true},
 {name:"consultations",path:"/consultations",auth:true},
 {name:"consultations-my",path:"/consultations/my",auth:true},
 {name:"cynologist-chat",path:"/cynologist-chat",auth:true},
 {name:"gallery-albums",path:"/profile/albums",auth:true},
 {name:"reminders",path:"/reminders",auth:true},
 {name:"profile-settings",path:"/profile?tab=settings",auth:true},
 {name:"profile-questions",path:"/profile?tab=questions",auth:true},
 {name:"profile-notes",path:"/profile?tab=notes",auth:true},
 {name:"pets",path:"/pets",auth:true},{name:"moments",path:"/moments",auth:true},
 {name:"questions",path:"/questions",auth:true},{name:"articles",path:"/articles",auth:true},
 {name:"favorites",path:"/favorites",auth:true},
 {name:"edit-bio",path:"/profile/editBio",auth:true},
 {name:"edit-email",path:"/profile/change-email",auth:true},
 {name:"edit-username",path:"/profile/change-username",auth:true},
 {name:"change-password",path:"/profile/change-password",auth:true},
 {name:"create-question",path:"/questions/new",auth:true},
 {name:"create-moment",path:"/moments/new",auth:true},
 {name:"course-detail",path:"/courses/visual-course",auth:true},
 {name:"pet-detail",path:"/pets/dog-1",auth:true},
 {name:"article-detail",path:"/articles/dog-walking",auth:true},
 {name:"question-detail",path:"/questions/question-1",auth:true},
 {name:"moment-detail",path:"/moments/post-1",auth:true},
];
const user={id:"visual-user",username:"visual_user",role:"USER"};
const fixtureCover="https://storage.yandexcloud.net/gafus-media/uploads/courses/visual-course.webp";
const fixtureArticleCover="https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer1/articles/article1/cover.webp";
const course={id:"visual-course",name:"Тренируем спокойную прогулку",type:"BASIC",
 logoImg:fixtureCover,
 shortDesc:"Практические занятия для уверенных прогулок с собакой.",duration:"14 дней",
 isPaid:false,isPrivate:false,hasAccess:true,isFavorite:false,userStatus:"NOT_STARTED",
 trainingLevel:"BEGINNER"};
const article={id:"article-1",slug:"dog-walking",title:"Как гулять с собакой",
 description:"Полезные советы для прогулок и занятий",visibility:"PUBLIC",hasAccess:true,
 likeCount:18,authorUsername:"trainer",logoImg:fixtureArticleCover,viewCount:35};
const question={id:"question-1",title:"Как приучить собаку не тянуть поводок?",
 body:"Подскажите, с чего начать тренировки.",preview:"Подскажите, с чего начать тренировки.",
 category:"Поведение",status:"waiting",answerCount:2,
 createdAt:"2026-10-01T11:00:00.000Z",author:{name:"Владелец",username:"owner"}};
const post={id:"post-1",status:"published",text:"Сегодня тренировали неподбор на прогулке.\nПопробуем снова завтра!",
 createdAt:"2026-10-01T11:00:00.000Z",publishedAt:"2026-10-01T11:00:00.000Z",
 author:{name:"Владелец Бима",username:"owner",role:"USER"},reactions:[],attachments:[],
 commentCount:3,viewCount:29,myReaction:null,bookmarked:false,hasPoll:false,canEdit:false};
const envelope=data=>({success:true,data});
function payloadFor(pathname){
 if(pathname==="/api/v1/auth/me")return user;
 if(pathname==="/api/v1/courses")return [course];
 if(pathname==="/api/v1/public/courses")return [course];
 if(pathname==="/api/v1/notes/student")return [];
 if(pathname==="/api/v1/gafus/status")return {
  serverNow:"2026-10-18T12:00:00.000Z",wallet:{balance:8},
  activity:{earned:2,limit:3,windowSeconds:86400,remaining:1,nextCapacityAt:null},
  rules:{postReward:1,questionReward:1,answerReward:1,reactionThreshold:10,
   reactionReward:1,bestAnswerReward:1,courseStepCost:1,miniGuideCost:1,
   accessDurationSeconds:604800},
  enabled:{economy:true,earning:true,spending:true},settingsRevision:7,
 };
 if(pathname==="/api/v1/gafus/history")return {items:[],nextCursor:null};
 if(pathname==="/api/v1/cynologist-chat")return {
  enabled:true,isAssignedTrainer:false,canUseCynologistChat:true,canSend:false,
  needsIntake:false,canBookConsultations:true,chat:null,
 };
 if(pathname==="/api/v1/reminders")return [{id:"rem1",name:"Утренняя тренировка",
  enabled:true,reminderTime:"09:00",reminderDays:null,timezone:"Europe/Moscow"}];
 if(pathname===`/api/v1/gallery/profiles/${user.username}/albums`)return {
  items:[{id:"album1",ownerId:user.id,ownerUsername:user.username,
   name:"Прогулки с Бимом",description:null,isVisible:true,canEdit:true,
   photoCount:0,coverThumbUrl:null,urlsExpireAt:null}],
  nextCursor:null,isOwner:true,enabled:true,usedSlots:1,limit:10,
 };
 if(pathname==="/api/v1/consultations/cynologists")return [{
  id:"cynologist1",userId:"trainer1",username:"trainer1",displayName:"Анна Кинолог",
  about:"Поведение, социализация и обучение собак",slotDurationMin:60,
  avatarUrl:"https://storage.yandexcloud.net/gafus-media/uploads/users/trainer1/avatar.webp",
 }];
 if(pathname==="/api/v1/consultations/my")return {items:[],nextCursor:null};
 if(pathname==="/api/v1/user/profile")return {id:user.id,username:user.username,
  profile:{fullName:"Владелец Бима",city:"Самара",about:"Занимаемся с собакой каждый день."}};
 if(pathname==="/api/v1/pets")return [{id:"dog-1",name:"Бим",type:"DOG",breed:"Метис",showInProfile:true}];
 if(pathname==="/api/v1/pets/dog-1")return {
  id:"dog-1",name:"Бим",type:"DOG",breed:"Метис",showInProfile:true,
  notes:"Любит долгие прогулки",birthDate:"2022-04-09T00:00:00.000Z",
  weightKg:15.5,heightCm:44,neckGirthCm:38,muzzleGirthCm:24,bellyGirthCm:50,
 };
 if(pathname==="/api/v1/articles")return [article];
 if(pathname==="/api/v1/articles/dog-walking")return {
  ...article,contentType:"TEXT",content:"Сегодня учим собаку спокойно идти на поводке.\nЗанимайтесь постепенно.",
 };
 if(pathname==="/api/v1/feed/status")return {enabled:true,smartEnabled:false};
 if(pathname==="/api/v1/feed/posts")return {items:[post],nextCursor:null};
 // Synthetic owner feed for the restored Next profile activity tab.
 if(pathname===`/api/v1/feed/profiles/${user.username}/posts`)return {
  items:[{...post,author:{...post.author,username:user.username}}],nextCursor:null,
 };
 if(pathname==="/api/v1/questions/question-1")return {
  ...question,author:{id:"owner1",name:"Владелец",username:"owner",avatarUrl:null},
  closed:false,canReply:true,canManage:false,canEdit:false,blockReason:null,
  photos:[],tags:["поводок"],answers:[],nextAnswerPage:null,
 };
 if(pathname==="/api/v1/feed/posts/post-1")return post;
 if(pathname==="/api/v1/feed/posts/post-1/comments")return {items:[],nextCursor:null};
 if(pathname==="/api/v1/questions")return {items:[question],nextPage:null,canPublish:true,blockReason:null};
 return null;
}
function pixelDiff(golden,current) {
 const a=PNG.sync.read(readFileSync(golden));
 const b=PNG.sync.read(readFileSync(current));
 if (a.width!==b.width||a.height!==b.height) return {ratio:1,sizeMismatch:true};
 let changed=0;
 for(let offset=0;offset<a.data.length;offset+=4) {
  const dist=Math.max(Math.abs(a.data[offset]-b.data[offset]),
   Math.abs(a.data[offset+1]-b.data[offset+1]),
   Math.abs(a.data[offset+2]-b.data[offset+2]));
  if(dist>18)changed++;
 }
 return {ratio:changed/(a.width*a.height),sizeMismatch:false};
}
// One isolated browser instance can check a route group without restarting Vite
// and without blindly revising screenshots of concurrently edited features.
const screenFilter=process.env.GAFUS_VISUAL_SCREEN?.split(",").filter(Boolean);
if(screenFilter?.some(name=>!screens.some(screen=>screen.name===name)))
 throw Error("Unknown visual screen filter: "+screenFilter.join(","));
const browser=await chromium.launch({headless:true,executablePath:binary,
 args:["--no-sandbox","--disable-gpu","--disable-background-networking"],
 env:{...process.env,HOME:join(root,".local-browser-mcp/.cache/home"),
  XDG_CACHE_HOME:join(root,".local-browser-mcp/.cache/tmp")}});
let failure=0;
try {
 for(const viewport of viewports)for(const screen of screens) {
  if(screenFilter&&!screenFilter.includes(screen.name))continue;
  const name=`${screen.name}-${viewport.name}.png`;
  const ctx=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
   deviceScaleFactor:1,locale:"ru-RU",reducedMotion:"reduce",colorScheme:"light",serviceWorkers:"block"});
  const unknown=[];
  await ctx.route("**/*",async route=>{
   const req=route.request(),url=new URL(req.url());
   // Synthetic cover is served strictly from an in-repository image: no CDN request.
   if(url.href==="https://storage.yandexcloud.net/gafus-media/uploads/courses/course-day-logo.png?v=20260505-1620")
     return route.fulfill({status:200,contentType:"image/png",
      // Byte-identical copy of the public asset referenced by Next metadata.
      body:readFileSync(join(root,"apps/web-vite/public/images/course-day-logo-source.png"))});
   if(url.href==="https://storage.yandexcloud.net/gafus-media/uploads/users/trainer1/avatar.webp")
     return route.fulfill({status:200,contentType:"image/webp",
      body:readFileSync(join(root,"apps/web-vite/public/images/lana-petrenko.webp"))});
   if(url.href===fixtureCover||url.href===fixtureArticleCover)
     return route.fulfill({status:200,contentType:"image/webp",
      body:readFileSync(join(root,"apps/web-vite/public/images/gafus-landing-target-v2.webp"))});
   if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||url.port!==port)return route.abort();
   if(!url.pathname.startsWith("/api/v1/"))return route.continue();
   if(req.method()!=="GET")return route.fulfill({status:403,
    contentType:"application/json",body:JSON.stringify({success:false,error:"VISUAL_READ_ONLY"})});
   if(!screen.auth&&url.pathname==="/api/v1/auth/me")return route.fulfill({status:401,
    contentType:"application/json",body:JSON.stringify({success:false,error:"Unauthorized"})});
   // Independent published-today state from read-only Hono wire; not a
   // fabricated assignment for ordinary catalogue or any live production user.
   if(screen.name==="courses-daily" && url.pathname==="/api/v1/daily-course/today"){
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(envelope({
     mskDate:"2026-10-25",scheduleId:"schedule_oct25",userStatus:"IN_PROGRESS",
     day:{id:"bundle_oct25",title:"Работа с импульсивностью",description:"Упражнения",
      type:"PRACTICE",estimatedDuration:12,theoryMinutes:4,stepsCount:3},
     stepsSummary:{total:3,completed:1},
    }))});
   }
   if(url.pathname==="/api/v1/public/platform-stats")
     return route.fulfill({status:200,contentType:"application/json",
       // Observed public aggregate on read-only live Next 25 Oct 2026.
       // Snapshot fixture ONLY; actual Refactor renders a live Hono GET.
       body:JSON.stringify(envelope({students:2559}))});
   // Verified signed-in root redirect lands on /courses, which legitimately
   // reads today's Hono assignment. An absent assignment is NOT a 404.
   if(screen.name==="home-owner-redirect" &&
      url.pathname==="/api/v1/daily-course/today")
     return route.fulfill({status:200,contentType:"application/json",
       body:JSON.stringify(envelope({mskDate:"2026-10-25",scheduleId:null,
         userStatus:"NOT_STARTED",day:null,stepsSummary:{total:0,completed:0}}))});
   const payload=payloadFor(url.pathname);
   // The consultations dispatcher puts eligibility beside data, unlike
   // ordinary {success,data}; preserve its exact envelope in synthetic E2E.
   if(url.pathname==="/api/v1/consultations/cynologists" ||
      url.pathname==="/api/v1/consultations/my") {
     const bookingEligibility={canBook:true,reason:null,nextBookingAt:null,message:null};
     return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      success:true,data:payload,bookingEligibility,
     })});
   }
   if(payload===null){unknown.push(url.pathname);return route.fulfill({status:404,
    contentType:"application/json",body:JSON.stringify({success:false,error:"VISUAL_FIXTURE_ABSENT"})});}
   return route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify(envelope(payload))});
  });
  const page=await ctx.newPage();
  page.on("pageerror",error=>console.error(`PAGE JS ERROR ${name}: ${String(error.message).slice(0,550)}`));
  try {
   await page.goto(`${localOrigin}${screen.path}`,{waitUntil:"domcontentloaded",timeout:15000});
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForLoadState("networkidle",{timeout:8000});
   await page.waitForTimeout(120);
   if(screen.name==="profile-tour"){
     await page.getByRole("button",{name:"Повторить экскурсию"}).click();
     await page.getByRole("dialog",{name:"Экскурсия по GAFUS"}).waitFor();
   }
   if(screen.menu){
    const toggle=page.getByRole("button",{name:"Открыть меню"});
    await toggle.click();
    const menu=page.locator('nav[aria-label="Разделы"]');
    const menuLabels=await menu.locator('a,button').allTextContents();
    if(!await menu.isVisible() ||
       !await page.getByRole("button",{name:"Закрыть меню"}).getAttribute("aria-expanded").then(v=>v==="true") ||
       !["Профиль","Питомцы","Курсы","Моменты","Вопросы","Статьи","Выход"]
          .every(label=>menuLabels.some(value=>value.includes(label)))){
     console.error(`MENU MISSING ITEMS ${name}: ${menuLabels.join("|")}`);failure++;
    }
    await page.keyboard.press("Escape");
    if(await menu.isVisible()) { console.error(`MENU ESCAPE FAILED ${name}`); failure++; }
    await page.getByRole("button",{name:"Открыть меню"}).click();
    if(!await menu.isVisible()) { console.error(`MENU REOPEN FAILED ${name}`); failure++; }
    // Original BurgerIcon has a 400ms animation. Stabilize before pixel capture.
    await page.waitForTimeout(450);
   }
   const metrics=await page.evaluate(()=>({
    overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    broken:[...document.images].filter(img=>img.complete&&!img.naturalWidth).map(img=>img.src),
    header:!!document.querySelector('[data-ui-parity="legacy-header"]'),
    footer:!!document.querySelector('[data-ui-parity="legacy-footer"]'),
    background:getComputedStyle(document.body,"::before").backgroundImage,
    hasLanding:!!document.querySelector('[data-ui-parity="legacy-landing"]'),
    landingCatalog:!!document.querySelector('.gafus-public-landing + .catalog')||
      !!document.querySelector('.gafus-next-courses'),
    landingRoundedIcons:document.querySelectorAll('.gafus-public-landing svg[class*="pathCardIcon"]').length,
    landingCount:!!document.querySelector('.gafus-public-landing [class*="studentCount"]'),
    landingPromo:document.querySelectorAll('.gafus-public-landing [class*="planPrice"] sup').length,
    landingSupport:!!document.querySelector('.gafus-public-landing [class*="planSupportNote"]'),
    activeTour:!!document.querySelector('[data-next-onboarding-tour]'),
    connectedAccountDeletion:!!document.querySelector('[data-next-account-deletion]'),
    nextProfile:!!document.querySelector('[data-next-profile-identity]') &&
      !!document.querySelector('[data-next-profile-sections]'),
    nextPets:!!document.querySelector('[data-next-pet-hero]') &&
      !!document.querySelector('[data-next-pet-foot]'),
    nextSettings:!!document.querySelector('[data-next-profile-settings]'),
    nextMyQuestions:!!document.querySelector('[data-next-my-questions]'),
    nextNotes:!!document.querySelector('[data-next-student-notes]'),
    nextWallet:!!document.querySelector('[data-next-wallet]'),
    nextFeed:!!document.querySelector('[data-next-feed]'),
    nextQuestions:!!document.querySelector('[data-next-questions]'),
    sourceQuestionsCard:!!document.querySelector('.next-questions-page .next-question-preview'),
    sourceQuestionsFullWidth:(()=>{
      const card=document.querySelector('.next-questions-page .next-question-preview');
      if(!card)return false;const parent=card.closest('.question-catalog-card');
      if(!parent)return false;
      const c=card.getBoundingClientRect(),p=parent.getBoundingClientRect();
      return c.width>p.width*.95 && c.width>150;
    })(),
    sourceFeedNav:!!document.querySelector('.next-feed-page nav[aria-label="Разделы «Моментов»"]'),
    sourceReminderRows:(()=>{
      const root=document.querySelector('.next-reminders-page [data-next-reminders]')||
        document.querySelector('[data-next-reminders].next-reminders-page');
      const row=root?.querySelector('.reminder-list li');
      return !!row && getComputedStyle(row).borderTopWidth==='2px';
    })(),
    sourceAlbumThumb:!!document.querySelector('.next-gallery-albums .gallery-album-card [class*="thumb"]'),
    nextConsult:!!document.querySelector('[data-next-consultations]'),
    nextChat:!!document.querySelector('[data-next-cynologist-chat]'),
    nextAlbums:!!document.querySelector('[data-next-gallery]'),
    nextReminders:!!document.querySelector('[data-next-reminders]'),
    nextArticles:!!document.querySelector('[data-next-articles]'),
    nextDaily:!!document.querySelector('[data-next-daily-course-card]'),
    dailyBeforeSearch:(()=>{const card=document.querySelector('[data-next-daily-course-card]');
      const search=document.querySelector('[data-next-course-search]');
      return !!card&&!!search&&!!(card.compareDocumentPosition(search)&Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
    nextCourses:!!document.querySelector('[data-next-course-search]') &&
      !!document.querySelector('.gafus-next-courses .course-grid'),
    fonts:getComputedStyle(document.body).fontFamily,
    sourceProfileTypography:(()=>{
      const head=document.querySelector('[data-next-profile-identity] h1');
      const about=document.querySelector('[data-next-profile-identity] h2');
      const h=head?getComputedStyle(head):null;
      const a=about?getComputedStyle(about):null;
      return h?{font:h.fontFamily,size:parseFloat(h.fontSize),weight:Number(h.fontWeight),
        aboutSize:a?parseFloat(a.fontSize):null,
        aboutFont:a?.fontFamily??null}:null;
    })(),
    body:(document.querySelector("main")?.textContent??"").slice(0,3500)+
      (document.querySelector("[data-next-onboarding-tour]")?.textContent??""),
   }));
   const expected={home:"ГАФУС","home-owner-redirect":"Тренируем спокойную прогулку",
    login:"Логин",register:"Регистрация",
    courses:"Тренируем спокойную прогулку","courses-daily":"Задание дня","trainings-root":"Тренируем спокойную прогулку","open-menu":"Тренируем спокойную прогулку",
    profile:"Владелец Бима", "profile-gafus":"Мои Гафусы",
    "feed-alias":"Сегодня тренировали неподбор",
    consultations:"Консультации с кинологом",
    "consultations-my":"Мои консультации",
    "cynologist-chat":"Чат с кинологом",
    "gallery-albums":"Фотоальбомы",reminders:"Утренняя тренировка",
    "profile-settings":"Изменить email",
    "profile-questions":"Мои вопросы", "profile-notes":"Заметки кинолога",
    "profile-delete":"Удаление аккаунта","profile-tour":"Быстрый тур",
    pets:"Бим",
    moments:"Сегодня тренировали неподбор",questions:"Как приучить собаку",
    articles:"Как гулять с собакой", favorites:"Избранные курсы",
    "edit-bio":"Редактировать", "edit-email":"Изменить email",
    "edit-username":"Изменить логин", "change-password":"Сменить пароль",
    "create-question":"Задать вопрос", "create-moment":"Новая публикация",
    "course-detail":"Тренируем спокойную прогулку", "pet-detail":"Любит долгие прогулки",
    "article-detail":"Сегодня учим собаку спокойно идти",
    "question-detail":"Как приучить собаку не тянуть",
    "moment-detail":"Сегодня тренировали неподбор"}[screen.name];
   if(!metrics.body?.includes(expected)) {
    console.error(`DATA FIXTURE NOT VISIBLE ${name}: ${JSON.stringify(metrics.body)}`);failure++;
   }
   if(!metrics.fonts.includes("Gafus Montserrat")||
      !metrics.background.includes("site-sky-background-v1.webp")||
      (screen.auth&&(!metrics.header||!metrics.footer))) {
    console.error(`SHELL ASSETS FAILED ${name}: ${JSON.stringify(metrics)}`);failure++;
   }
   if(metrics.overflow>1||metrics.broken.length) {
    console.error(`LAYOUT FAIL ${name}: ${JSON.stringify(metrics)}`); failure++;
   }
   if((screen.name==="profile-delete"&&!metrics.connectedAccountDeletion)||
      (screen.name==="profile-tour"&&!metrics.activeTour)||
      (screen.name==="questions" && (!metrics.sourceQuestionsCard||!metrics.sourceQuestionsFullWidth))||
      (["moments","feed-alias"].includes(screen.name)&&!metrics.sourceFeedNav)||
      (screen.name==="reminders"&&!metrics.sourceReminderRows)||
      (screen.name==="gallery-albums"&&!metrics.sourceAlbumThumb)||
      (screen.name==="courses-daily"&&(!metrics.nextDaily||!metrics.dailyBeforeSearch))||
      (screen.name==="profile-settings"&&!metrics.nextSettings)||
      (screen.name==="profile-questions"&&!metrics.nextMyQuestions)||
      (screen.name==="profile-notes"&&!metrics.nextNotes)||
      (screen.name==="profile-gafus"&&!metrics.nextWallet)||
      (["moments","feed-alias"].includes(screen.name)&&!metrics.nextFeed)||
      (screen.name==="questions"&&!metrics.nextQuestions)||
      (["consultations","consultations-my"].includes(screen.name)&&!metrics.nextConsult)||
      (screen.name==="cynologist-chat"&&!metrics.nextChat)||
      (screen.name==="gallery-albums"&&!metrics.nextAlbums)||
      (screen.name==="reminders"&&!metrics.nextReminders)||
      (screen.name==="articles"&&!metrics.nextArticles)||
      (["profile","profile-settings","profile-questions","profile-notes"].includes(screen.name)&&
       !metrics.nextProfile) ||
      (screen.name==="pets"&&!metrics.nextPets) ||
      (["courses","courses-daily","trainings-root","open-menu"].includes(screen.name)&&!metrics.nextCourses)) {
    console.error(`NEXT LAYOUT CONTRACT MISSING ${name}`); failure++;
   }
   if(screen.name==="profile"&&metrics.sourceProfileTypography){
     const t=metrics.sourceProfileTypography;
     // Measured from the authenticated live Next page at 1280px:
     // 30px/750 Montserrat. Narrow-screen font comes from its source clamp.
     const want=viewport.width===1280?30:21;
     if(Math.abs(t.size-want)>1||t.weight!==750||
        !/montserrat/i.test(t.font)||
        (t.aboutSize!==null && Math.abs(t.aboutSize-18)>1)||
        (t.aboutFont!==null&&!/montserrat/i.test(t.aboutFont))){
       console.error(`LIVE NEXT BIO TYPOGRAPHY MISMATCH ${name}: ${JSON.stringify(t)}`);
       failure++;
     }
   }
   if((["home","home-owner-redirect"].includes(screen.name))&&unknown.length){
     console.error(`LANDING UNEXPECTED API ${name}: ${unknown.join(",")}`);failure++;
   }
   if(screen.name==="home-owner-redirect"&&(
      new URL(page.url()).pathname!=="/courses"||metrics.hasLanding||!metrics.nextCourses)){
     console.error(`AUTHENTICATED ROOT REDIRECT FAILED ${name}: ${page.url()}`);failure++;
   }
   if(screen.name==="home"&&(!metrics.hasLanding||metrics.landingCatalog||
      metrics.landingRoundedIcons!==5||!metrics.landingCount||
      metrics.landingPromo!==2||!metrics.landingSupport)){
     console.error(`HOME NEXT CONTENT PARITY FAILED ${name}: ${JSON.stringify(metrics)}`);
     failure++;
   }
   if(screen.name==="home"&&!metrics.hasLanding) {
    console.error(`LANDING MISSING ${name}`);failure++;
   }
   const output=join(actual,name),golden=join(baseline,name);
   await page.screenshot({path:output,animations:"disabled",scale:"css"});
   if(update){writeFileSync(golden,readFileSync(output));
    console.log(`BASELINE ${name} overflow=${metrics.overflow} unknownAPI=${[...new Set(unknown)].join(",")}`);
   }else if(!existsSync(golden)){
    console.error(`BASELINE MISSING ${name} (run --update only after review)`);failure++;
   }else{
    const diff=pixelDiff(golden,output);
    console.log(`CHECK ${name} changed=${(diff.ratio*100).toFixed(3)}% unknownAPI=${[...new Set(unknown)].join(",")}`);
    if(diff.ratio>.004){console.error(`VISUAL REGRESSION ${name}`);failure++;}
   }
  }catch(error){console.error(`SCREEN FAIL ${name}: ${error.message}`);failure++;}
  finally{await ctx.close();}
 }
}finally{await browser.close();}
if(failure)process.exitCode=1;
