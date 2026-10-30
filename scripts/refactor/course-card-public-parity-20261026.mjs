import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const root = '/Users/asmtv1/Desktop/gafus-refactor';
const output = `${root}/.design-verify/course-card-public-pair-20261026`;
const fixtureMode = process.argv.includes('--fixture');
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const [width,height] of [[1280,800],[390,844]]) {
    for (const [kind,url] of (fixtureMode
      ? [['dev-vite-fixture','http://127.0.0.1:5173/courses']]
      : [['live-next','https://gafus.ru/courses'], ['dev-vite','http://127.0.0.1:5173/courses']])) {
      const context = await browser.newContext({ viewport: {width,height}, locale:'ru-RU', timezoneId:'Europe/Paris' });
      const page = await context.newPage();
      let syntheticRequests = 0;
      if (fixtureMode) await page.route('**/api/v1/public/courses', route => {
        syntheticRequests++;
        return route.fulfill({status:200, contentType:'application/json',body:JSON.stringify({
          success:true, data:[{
            id:'synthetic-card-01', name:'Тестовая карточка курса', type:'obedience',
            shortDesc:'Проверка отображения иконок и статуса без доступа к реальной базе.',
            duration:'25 дней', isPaid:true, isPrivate:false, hasAccess:false,
            isFavorite:false, userStatus:'NOT_STARTED', trainingLevel:'BEGINNER',
          }],
        })});
      });
      let status = null, error = '';
      try {
        const response = await page.goto(url,{ waitUntil:'domcontentloaded', timeout:12000 });
        status = response?.status() ?? null;
        await page.locator('li[class*="courseCard"],li.course-card').first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
      } catch(e) { error=String(e).slice(0,180); }
      const detail = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('li[class*="courseCard"],li.course-card')];
        return {
          title: document.title,
          heading: document.querySelector('h1')?.textContent?.slice(0,110) ?? '',
          bodyText: document.body.innerText.slice(0,950),
          count: cards.length,
          firstText: cards[0]?.textContent?.slice(0,260) ?? '',
          firstSvg: cards[0]?.querySelectorAll('svg').length ?? 0,
          cardButtons: cards[0]?.querySelectorAll('button').length ?? 0,
          firstBox: (()=> { const box=cards[0]?.getBoundingClientRect(); return box ? {x:box.x,y:box.y,width:box.width,height:box.height}:null; })(),
        };
      }).catch(e=>({evaluateError:String(e).slice(0,120)}));
      await page.screenshot({path:`${output}/${kind}-${width}.png`,fullPage:false}).catch(()=>{});
      if (fixtureMode && detail.count > 0) {
        const card = page.locator('li[class*="courseCard"],li.course-card').first();
        await card.screenshot({path:`${output}/${kind}-${width}-card.png`}).catch(()=>{});
      }
      rows.push({kind,width,height,status,url:page.url(),error,syntheticRequests,...detail});
      await context.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/${fixtureMode ? 'results-fixture.json' : 'results.json'}`,JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
