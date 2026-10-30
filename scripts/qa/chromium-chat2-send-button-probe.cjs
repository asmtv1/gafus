"use strict";
const fs=require('fs'),{chromium}=require('../../.local-pg-scratch/qa-playwright/node_modules/playwright-core');
const users=JSON.parse(fs.readFileSync('.local-pg-scratch/qa-browser-accounts-20261029.json','utf8'));
const actor=users.find(x=>x.role==='USER'),recipient=users.find(x=>x.role==='TRAINER');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
 const c=await b.newContext({viewport:{width:1280,height:800}});
 await c.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort('blockedbyclient')});
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:5173/login');
 await p.locator('#login-name').fill(actor.username);
 await p.locator('#login-password').fill(actor.password);
 await p.getByRole('button',{name:'Войти',exact:true}).click();
 await p.waitForURL('**/courses',{timeout:13000});
 await p.goto('http://127.0.0.1:5173/chats');
 await p.getByRole('heading',{name:'Сообщения',exact:true}).waitFor({timeout:13000});
 const entry=p.locator('button').filter({hasText:recipient.username}).first();
 await entry.waitFor({timeout:13000});await entry.click();
 const area=p.getByRole('textbox',{name:'Текст сообщения'}); await area.waitFor({timeout:13000});
 const info=async(label)=>{const x=await p.evaluate(()=>{
 const btn=document.querySelector('button[aria-label="Отправить сообщение"]');
 const field=document.querySelector('textarea[aria-label="Текст сообщения"]');
 return {disabled:btn?.disabled,buttonFound:!!btn,fieldValueLength:field?.value?.length,buttonParentText:btn?.closest('form')?.textContent?.trim()?.slice(0,180),hasError:document.querySelector('[role=alert]')?.textContent?.slice(0,130),isConnected:btn?.isConnected,formCount:document.querySelectorAll('form').length};
 });console.log('QA_CHAT2_COMPOSER_DIAG',JSON.stringify({label,...x}));};
 await info('before');
 await area.fill('QA: локальное сообщение Chat2 20261029');
 await info('after_fill');
 await p.waitForTimeout(850);
 await info('after_wait');
 const detail=await p.evaluate(()=>{
  const b=document.querySelector('button[aria-label="Отправить сообщение"]');
  if(!b)return {found:false};
  const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  const hit=document.elementFromPoint(x,y);
  const path=[];let n=hit;
  while(n&&path.length<8){path.push({tag:n.tagName,cl:String(n.className??'').slice(0,85),txt:(n.textContent??'').trim().slice(0,75),z:getComputedStyle(n).zIndex,pointer:getComputedStyle(n).pointerEvents});n=n.parentElement}
  return {buttonRect:{x,y,width:r.width,height:r.height},topHit:hit?.tagName,blocked:hit!==b&&!b.contains(hit),path,dialogCount:document.querySelectorAll('[role=dialog],[aria-modal=true]').length,skipButtons:[...document.querySelectorAll('button')].filter(x=>/Пропустить|Завершить|Далее/.test(x.textContent??'')).map(x=>x.textContent.trim().slice(0,50))};
 });
 console.log('QA_CHAT2_COMPOSER_HITTEST',JSON.stringify(detail));
 await p.screenshot({path:'.local-pg-scratch/qa-logs/browser-20261029/chat2-composer-disabled-probe.png'});
 await c.close();
 }finally{await b.close()}
})().catch(e=>{console.log('QA_CHAT2_COMPOSER_PROBE_ERR',String(e.message).slice(0,180));process.exitCode=1});
