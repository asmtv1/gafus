/** WEB1 original nine-step onboarding: actual owner browser -> Hono -> Core ->
 * restricted disposable WORK PostgreSQL -> UI/GET/reload, then owner DELETE.
 * This test never writes a nonleased record or uses any production provider.
 */
import {existsSync,lstatSync,readFileSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const lease=root+'/.local-pg-scratch/web1-unified-private.json';
const base='http://127.0.0.1:5373',path='/api/v1';
if(process.cwd()!==root||process.env.GAFUS_WEB1_REAL_BROWSER!=='1'||
 process.env.GAFUS_WEB1_ALT_VITE_PORT!=='5373'||
 !existsSync(lease)||lstatSync(lease).isSymbolicLink())
 throw Error('WEB1_TOUR_WORK_SCOPE_DENIED');
const users=JSON.parse(readFileSync(lease,'utf8')).users;
if(users?.length!==2||!users.every(u=>u.username==='web1_unified_'+u.id.replaceAll('-','')))
 throw Error('WEB1_TOUR_LEASE_IDENTITY_DENIED');
const owner=users[0],foreign=users[1];let assertions=0;
function check(ok,label){if(!ok)throw Error('WEB1_TOUR_SQL_ASSERT:'+label);assertions++;}
const chrome=root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome))throw Error('WEB1_TOUR_CHROME_MISSING');
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:root+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:root+'/.local-browser-mcp/.cache/tmp'}});
async function open(user,suffix){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',
  deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.port!=='5373')
   return route.abort();
  return route.continue(u.pathname.startsWith('/api/v1/')?{
   headers:{...route.request().headers(),'x-real-ip':'198.18.233.'+suffix}}:{});
 });
 const page=await context.newPage();
 await page.goto(base+'/login',{waitUntil:'domcontentloaded',timeout:15000});
 const auth=await api(page,path+'/auth/login','POST',{username:user.username,password:user.password});
 check(auth.status===200,'browser login '+user.username);
 return {page,context};
}
async function api(page,url,method='GET',body){
 return page.evaluate(async ({url,method,body})=>{
  const res=await fetch(url,{method,credentials:'include',cache:'no-store',headers:{
   ...(body?{'content-type':'application/json'}:{}),
   ...(method!=='GET'?{'X-Gafus-Auth-Transport':'cookie'}:{}),
  },...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await res.json();}catch{data=null;}
  return {status:res.status,data};
 },{url,method,body});
}
let petId=null;let principal=null;let primaryError=null;
const petName='Турик Тест';
try{
 principal=await open(owner,'41');
 const page=principal.page;
 const initial=await api(page,path+'/pets');
 console.log('WEB1_TOUR_PETS_READ_PROOF',JSON.stringify({status:initial.status,
   success:initial.data?.success,code:initial.data?.code,
   isArray:Array.isArray(initial.data?.data),count:initial.data?.data?.length}));
 check(initial.status===200&&Array.isArray(initial.data?.data)&&
  initial.data.data.length===0,'first-visit owner has no pets');
 await page.goto(base+'/profile?tab=settings',{waitUntil:'domcontentloaded',timeout:20000});
 await page.getByRole('button',{name:'Повторить экскурсию'}).click();
 let tour=page.getByRole('dialog',{name:'Экскурсия по GAFUS'});
 await tour.waitFor({timeout:16000});
 const named=['Быстрый тур','Кинолог','Питомцы','Добавить питомца'];
 for(let i=0;i<4;i++){
  try{
   await tour.getByText(named[i],{exact:true}).first().waitFor({timeout:7000});
  }catch(error){
   console.error('WEB1_TOUR_STEP_DIAGNOSTIC',JSON.stringify({
    index:i,url:new URL(page.url()).pathname,dialogs:await tour.count(),
    dialogText:(await tour.count())?(await tour.innerText()).slice(0,180):null,
    authStatus:(await api(page,path+'/auth/me')).status,
   }));
   throw error;
  }
  check((await tour.innerText()).includes((i+1)+'/9'),'source step '+(i+1));
  if(i<3)await tour.getByRole('button',{name:'Далее'}).click();
 }
 check(new URL(page.url()).pathname==='/pets','tour navigated owner pets');
 await tour.getByRole('button',{name:'Добавить питомца'}).click();
 await page.waitForURL('**/profile/addPet',{timeout:14000});
 check(await tour.count()===0,'tour pauses until owner creates pet');
 const form=page.locator('form').filter({has:page.locator('input[name="petType"]')});
 await form.waitFor({state:'visible',timeout:15000});
 await form.locator('input[name="name"]').fill(petName);
 await form.locator('input[name="petType"][value="DOG"]').check();
 await form.locator('input[name="breed"]').fill('Метис');
 await form.locator('input[name="birthDate"]').fill('01.01.2020');
 await form.getByRole('button',{name:'Добавить питомца'}).click();
 await page.getByRole('heading',{name:'Питомец создан'}).waitFor({timeout:18000});
 check(true,'Hono create + Core SQL persisted via actual input form');
 const owned=await api(page,path+'/pets');
 const row=owned.data?.data?.find(p=>p.name===petName);
 check(owned.status===200&&row?.ownerId===owner.id,'GET owner created pet');
 petId=row.id;
 check(typeof petId==='string'&&petId.length>0,'verified pet identity');
 await page.getByRole('button',{name:'К моим питомцам'}).click();
 await page.waitForURL('**/pets',{timeout:12000});
 tour=page.getByRole('dialog',{name:'Экскурсия по GAFUS'});
 await tour.getByText('Процедуры',{exact:true}).waitFor({timeout:18000});
 check((await tour.innerText()).includes('5/9'),'5/9 resumed only after owner saved pet');
 for(const [i,title] of ['Документы','Задание дня','Остальные курсы','Готово'].entries()){
  // Real keyboard action is single-shot. Playwright click() can retry after
  // the React overlay remounts and accidentally advance multiple steps.
  const nextButton=tour.getByRole('button',{name:'Далее'});
  await nextButton.focus();
  await page.keyboard.press('Enter');
  await tour.getByRole('heading',{name:title,exact:true}).waitFor({timeout:13000});
  check((await tour.innerText()).includes((i+6)+'/9'),'source step '+(i+6));
 }
 await tour.getByRole('button',{name:'Готово'}).click();
 await tour.waitFor({state:'hidden',timeout:14000});
 const completed=await api(page,path+'/user/onboarding-tour');
 check(completed.status===200&&completed.data?.data?.hasSeenV1===true,
   'source 9/9 completion POST committed to SQL');
 await page.reload({waitUntil:'domcontentloaded'});
 const persisted=await api(page,path+'/user/onboarding-tour');
 check(persisted.data?.data?.hasSeenV1===true,'tour stays completed after reload');
 const foreignContext=await open(foreign,'42');
 try{
  const others=await api(foreignContext.page,path+'/pets');
  check(others.status===200&&!others.data?.data?.some(x=>x.id===petId),
    'foreign owner cannot read created pet');
  const denied=await api(foreignContext.page,path+'/pets/'+petId,'DELETE');
  check(denied.status===404,'foreign DELETE fails 404');
 }finally{await foreignContext.context.close();}
 console.log('WEB1_REAL_PET_TOUR_PASS assertions='+assertions);
}catch(error){
 primaryError=error;
 console.error('WEB1_TOUR_PRIMARY_ERROR',error instanceof Error?error.message:String(error));
 throw error;
}finally{
 if(principal){
  try{
   const page=principal.page;
   if(!petId){
     console.log('WEB1_TOUR_NO_CONFIRMED_PET_ID; fixture-user cascade handles unknown writes');
   } else {
   const current=await api(page,path+'/pets');
   const matches=current.data?.data?.filter(x=>x.name===petName&&x.ownerId===owner.id)||[];
   if(matches.length>1)throw Error('WEB1_TOUR_CLEANUP_AMBIGUOUS');
   for(const row of matches){
    if(petId&&row.id!==petId)throw Error('WEB1_TOUR_CLEANUP_WRONG_ID');
    const deleted=await api(page,path+'/pets/'+row.id,'DELETE');
    check(deleted.status===200,'owner deleted only synthetic pet');
   }
   const after=await api(page,path+'/pets');
   console.log('WEB1_TOUR_OWNER_DELETE_PROOF',JSON.stringify({status:after.status,
     hasPet:after.data?.data?.some(x=>x.name===petName)}));
   check(after.status===200&&!after.data?.data?.some(x=>x.name===petName),
     'owner GET verified synthetic pet cleanup');
   console.log('WEB1_REAL_PET_CLEANUP_OK');
   }
  }catch(cleanError){
   console.error('WEB1_TOUR_CLEANUP_DIAGNOSTIC',
     cleanError instanceof Error?cleanError.message:String(cleanError));
   if(!primaryError)throw cleanError;
  }finally{await principal.context.close();}
 }
 await browser.close();
}
