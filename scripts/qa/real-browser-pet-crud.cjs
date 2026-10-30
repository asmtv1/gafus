const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const user=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(a=>a.role==="USER");
(async()=>{
  const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  try{
    const ctx=await b.newContext({viewport:{width:1280,height:800}});
    await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
    const p=await ctx.newPage(),requests=[];
    p.on("response",r=>{const u=new URL(r.url());if(u.pathname.startsWith("/api/v1/pets"))requests.push({method:r.request().method(),status:r.status(),isCollection:u.pathname==="/api/v1/pets"})});
    await p.goto("http://127.0.0.1:5173/login");
    await p.locator("#login-name").fill(user.username);
    await p.locator("#login-password").fill(user.password);
    await p.getByRole("button",{name:"Войти",exact:true}).click();
    await p.waitForTimeout(400);
    if(!(await ctx.cookies()).some(x=>x.name==="gafus_access"))throw Error("TEST_ACTOR_AUTH_FAILED");
    await p.goto("http://127.0.0.1:5173/profile/addPet");
    await p.getByRole("heading",{name:"Добавить питомца"}).waitFor({timeout:8000});
    console.log("REAL_PET_FORM_RENDERED");
    await p.locator("#g05-name").fill("Тестовый");
    await p.locator('input[name="petType"][value="DOG"]').check();
    await p.locator("#g05-breed").fill("Метис");
    await p.locator("#g05-birthDate").fill("15.03.2020");
    await p.locator("#g05-notes").fill("Локальная QA запись");
    await p.getByRole("button",{name:"Добавить питомца",exact:true}).click();
    await p.waitForTimeout(1100);
    const confirmed=(await p.getByRole("heading",{name:"Питомец создан"}).count())>0;
    const link=p.getByRole("link",{name:"Открыть карточку питомца"});
    const petPath=confirmed&&await link.count()?await link.getAttribute("href"):null;
    const result={scenario:"local real Chrome+HTTP controlled pet create",confirmed,petPath,requests};
    fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/real-pet-create.json",JSON.stringify(result,null,2));
    console.log("REAL_PET_CREATE_RESULT",JSON.stringify(result));
    if(!confirmed||!requests.some(x=>x.method==="POST"&&x.status===201))process.exitCode=1;
    await ctx.close();
  }finally{await b.close()}
})().catch(e=>{console.log("REAL_PET_CREATE_FAILED",String(e.message).slice(0,140));process.exitCode=1});
