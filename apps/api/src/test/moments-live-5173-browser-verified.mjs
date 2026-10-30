/** Refactor-only local Feed preview proof: temporary WORK actor, real Gallery cookie,
 * real Feed HTTP through Vite, browser desktop/mobile, scoped actor cleanup. */
import { randomBytes } from 'node:crypto';
import { realpathSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { prisma } from '@gafus/prisma';
import { chromium } from '../../../../.local-browser-mcp/node_modules/playwright/index.mjs';

const root='/Users/asmtv1/Desktop/gafus-refactor';
const web='http://127.0.0.1:5173';
const username='moments_live_ui_'+randomBytes(6).toString('hex');
const password='MomentSmoke1_'+randomBytes(18).toString('base64url');
let user, browser, phase='preflight';
const assert=(condition,code)=>{if(!condition)throw Error('MOMENTS_LIVE_'+code)};
const json=async (url,init={})=>{
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(16000)});
  let body={};try{body=await response.json()}catch{}
  return {status:response.status,body};
};
try {
  assert(realpathSync(root)===root && realpathSync(process.cwd())===root+'/apps/api','ROOT');
  assert(execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()===root,'GIT_ROOT');
  assert(execFileSync('git',['-C',root,'branch','--show-current'],{encoding:'utf8'}).trim()==='vite','BRANCH');
  const db=new URL(process.env.DATABASE_URL??'');
  assert(db.hostname==='127.0.0.1' && db.port==='55921' &&
    db.pathname==='/gafus_refactor_real_work_20261024' &&
    db.username==='gafus_refactor_local_real','WORK_DB');
  phase='own_fixture';
  user=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    role:'USER',passwordSetAt:new Date(),registrationPending:false,
    onboardingTourCompletedAt:new Date()}});
  phase='gallery_login';
  const login=await json(web+'/api/v1/auth/login',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const token=login.body?.data?.accessToken;
  assert(login.status===200&&typeof token==='string','GALLERY_LOGIN');
  const headers={Authorization:`Bearer ${token}`};
  phase='feed_routes';
  const [direct,proxied,list,gallery]=await Promise.all([
    json('http://127.0.0.1:3001/api/v1/feed/status',{headers}),
    json(web+'/api/v1/feed/status',{headers}),
    json(web+'/api/v1/feed/posts?sort=new&pageSize=20',{headers}),
    json(web+'/api/v1/gallery/profiles/'+username+'/albums?pageSize=20',{headers}),
  ]);
  assert(direct.status===200&&direct.body?.data?.enabled===true,'DIRECT_HONO_FEED');
  assert(proxied.status===200&&proxied.body?.data?.enabled===true,'VITE_FEED_ENABLED');
  assert(list.status===200&&list.body?.success===true&&Array.isArray(list.body?.data?.items),'FEED_LIST');
  assert(gallery.status===200&&gallery.body?.data?.enabled===true,'GALLERY_UNCHANGED');
  if (list.body.data.items.length) {
    const first=list.body.data.items[0];
    const detail=await json(web+'/api/v1/feed/posts/'+first.id,{headers});
    const authorAvatar=detail.body?.data?.author?.avatarUrl;
    const attachment=(detail.body?.data?.attachments??[]).find(x=>x.kind==='video'&&x.status==='ready');
    const poster=attachment?.posterUrl??attachment?.thumbUrl;
    console.log('MOMENTS_VISUAL_FEED_ROWS='+list.body.data.items.length);
    console.log('MOMENTS_VISUAL_AUTHOR_HAS_AVATAR='+Boolean(authorAvatar));
    console.log('MOMENTS_VISUAL_DETAIL_HTTP='+detail.status);
    if (authorAvatar && /^https?:\/\//.test(authorAvatar)) {
      try { const res=await fetch(authorAvatar,{signal:AbortSignal.timeout(5000)}); console.log('MOMENTS_VISUAL_AVATAR_HTTP='+res.status); }
      catch { console.log('MOMENTS_VISUAL_AVATAR_FETCH_FAILED'); }
    }
    console.log('MOMENTS_VISUAL_VIDEO_POSTER_PRESENT='+Boolean(poster));
    if (poster && /^https?:\/\//.test(poster)) {
      try { const res=await fetch(poster,{signal:AbortSignal.timeout(5000)}); console.log('MOMENTS_VISUAL_POSTER_HTTP='+res.status); }
      catch { console.log('MOMENTS_VISUAL_POSTER_FETCH_FAILED'); }
    }
  }
  console.log('MOMENTS_LIVE_DIRECT_HONO_ENABLED=PASS');
  console.log('MOMENTS_LIVE_VITE_FEED_ENABLED=PASS');
  console.log('MOMENTS_LIVE_VITE_POSTS_GET=PASS');
  console.log('MOMENTS_LIVE_GALLERY_REMAINS_ENABLED=PASS');
  phase='browser_cookie';
  const binary=root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
  assert(existsSync(binary)&&realpathSync(binary).startsWith(root+'/'),'PROJECT_CHROME');
  browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox','--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const session=await context.request.post(web+'/api/v1/auth/login',{
    headers:{Origin:web,'X-Gafus-Auth-Transport':'cookie','Content-Type':'application/json'},
    data:{username,password},timeout:18000});
  assert(session.status()===200,'COOKIE_LOGIN');
  assert((await context.cookies(web+'/api/v1/feed/status')).some(c=>c.name==='gafus_access'),'COOKIE_STORED');
  const browserFeed=await context.request.get(web+'/api/v1/feed/status');
  assert(browserFeed.status()===200&&(await browserFeed.json()).data?.enabled===true,'COOKIE_FEED_STATUS');
  console.log('MOMENTS_LIVE_COOKIE_STATUS_ENABLED=PASS');
  const page=await context.newPage();
  phase='browser_desktop';
  await page.goto(web+'/feed',{waitUntil:'domcontentloaded',timeout:22000});
  await page.getByRole('heading',{name:'Моменты',exact:true}).waitFor({state:'visible',timeout:20000});
  await page.getByRole('link',{name:'Создать публикацию'}).waitFor({state:'visible',timeout:20000});
  assert(await page.getByText('Моменты сейчас недоступны.').count()===0,'DESKTOP_NO_DISABLED');
  // The feed list intentionally omits signed avatar URLs. Real thumbnails are
  // resolved only after a card becomes visible, from authorized post details.
  await page.locator('.moment-summary-card').first().scrollIntoViewIfNeeded();
  await page.locator('.moment-summary-card .web4-moment-author-avatar img').first()
    .waitFor({state:'attached',timeout:16000});
  await page.waitForFunction(() => {
    const avatar=document.querySelector('.moment-summary-card .web4-moment-author-avatar img');
    return avatar instanceof HTMLImageElement && avatar.complete && avatar.naturalWidth>0;
  },null,{timeout:16000});
  const topLinks=await page.locator('.gafus-app .question-controls a').allTextContents();
  assert(!topLinks.includes('Уведомления «Моментов»'), 'DUPLICATED_FLOATING_LINKS');
  assert((await page.getByRole('navigation',{name:'Разделы «Моментов»'})
    .getByRole('link',{name:/Черновики/}).count())===1,'DRAFTS_IN_NAV');
  console.log('MOMENTS_LIVE_AUTHOR_IMAGE_LOADED=PASS');
  console.log('MOMENTS_LIVE_FLOATING_LINKS_REMOVED=PASS');
  console.log('MOMENTS_LIVE_DESKTOP_1280_ENABLED=PASS');
  if (list.body.data.items.length) {
    const selected=list.body.data.items[0];
    phase='browser_detail_desktop';
    await page.goto(web+'/moments/'+selected.id,{waitUntil:'domcontentloaded',timeout:22000});
    await page.locator('.moment-detail-post').waitFor({state:'visible',timeout:18000});
    assert(await page.locator('.moment-detail-author h2').count()===1,'DETAIL_SINGLE_AUTHOR_NAME');
    assert(await page.getByRole('button',{name:'Выбрать реакцию'}).count()===1,'DETAIL_REACTION_PICKER');
    assert(await page.getByRole('button',{name:/Показать вложения/}).count()===0,'DETAIL_NO_BIG_MEDIA_BUTTON');
    assert(await page.locator('.moment-detail-engagement .moment-action-comment').count()===1,
      'DETAIL_COMMENTS_ACTION');
    const chooser=page.getByRole('button',{name:'Выбрать реакцию'});
    await chooser.scrollIntoViewIfNeeded();
    const geometry=await chooser.evaluate(button=>{
      const r=button.getBoundingClientRect();
      const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {width:Math.round(r.width),height:Math.round(r.height),
        viewport:document.documentElement.clientWidth,
        obscured:el!==button&&!button.contains(el),
        blockerTag:el?.tagName??null,
        blockerClass:el?.className?.toString().slice(0,60)??null};
    });
    console.log('MOMENTS_DETAIL_REACTION_BUTTON='+JSON.stringify(geometry));
    await chooser.click({timeout:4500});
    assert(await page.getByRole('group',{name:'Реакции'}).getByRole('button').count()===5,
      'DETAIL_ALL_REACTIONS_STILL_AVAILABLE');
    await chooser.click({timeout:4500});
    const layout=await page.evaluate(()=>{
      const root=document.querySelector('.moment-detail-post');
      const header=document.querySelector('.moment-detail-author');
      return {cardWidth:Math.round(root?.getBoundingClientRect().width??0),
        viewport:document.documentElement.clientWidth,
        headerFont:parseFloat(getComputedStyle(header?.querySelector('h2')).fontSize||'0')};
    });
    assert(layout.cardWidth>450&&layout.cardWidth<=layout.viewport&&layout.headerFont<=17,
      'DETAIL_DESKTOP_GEOMETRY');
    console.log('MOMENTS_LIVE_DETAIL_DESKTOP_COMPACT=PASS');
    await page.setViewportSize({width:390,height:844});
    await page.reload({waitUntil:'domcontentloaded',timeout:20000});
    await page.locator('.moment-detail-post').waitFor({state:'visible',timeout:18000});
    const mobile=await page.evaluate(()=>({
      viewport:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth,
      card:document.querySelector('.moment-detail-post')?.getBoundingClientRect().width??0,
    }));
    assert(mobile.card>300&&mobile.scroll<=mobile.viewport+2,'DETAIL_MOBILE_OVERFLOW');
    console.log('MOMENTS_LIVE_DETAIL_MOBILE_390=PASS');
    await page.setViewportSize({width:1280,height:800});
    await page.goto(web+'/feed',{waitUntil:'domcontentloaded',timeout:20000});
    await page.getByRole('link',{name:'Создать публикацию'}).waitFor({state:'visible',timeout:18000});
  }
  phase='browser_mobile';
  await page.setViewportSize({width:390,height:844});
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.getByRole('link',{name:'Создать публикацию'}).waitFor({state:'visible',timeout:20000});
  assert(await page.getByText('Моменты сейчас недоступны.').count()===0,'MOBILE_NO_DISABLED');
  console.log('MOMENTS_LIVE_MOBILE_390_ENABLED=PASS');
  await context.close();
} catch(error) {
  process.exitCode=1;
  console.error('MOMENTS_LIVE_FAILED_PHASE='+phase+' CODE='+
    (error instanceof Error?error.message.replace(/[^A-Za-z0-9_]/g,'').slice(0,95):'UNKNOWN'));
} finally {
  await browser?.close().catch(()=>{});
  if(user){
    try {
      const row=await prisma.user.findUnique({where:{id:user.id},select:{username:true}});
      assert(row?.username===username&&username.startsWith('moments_live_ui_'),'CLEANUP_SCOPE');
      await prisma.user.delete({where:{id:user.id}});
      console.log('MOMENTS_LIVE_OWN_FIXTURE_CLEANED=PASS');
    }catch{
      process.exitCode=1; console.error('MOMENTS_LIVE_FIXTURE_CLEANUP_REVIEW_REQUIRED');
    }
  }
  await prisma.$disconnect();
}
