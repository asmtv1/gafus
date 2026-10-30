/** Isolated actual Chromium computed-style check for source-proven wallet CSS.
 * This is NOT a visual screenshot, API response mock or pixel parity receipt.
 * Its test HTML only verifies local cascade conflicts in ordinary Chrome.
 */
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const cwd='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==cwd)throw Error('WEB1_CASCADE_SCOPE_DENIED');
const executablePath=cwd+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(executablePath))throw Error('CHROMIUM_NOT_INSTALLED');
const base=readFileSync('apps/web-vite/src/brand/next-routes-parity.css','utf8');
const scoped=readFileSync('apps/web-vite/src/features/profile/web1-local-parity.css','utf8');
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.setContent(`<div class="gafus-app"><main class="shell"><section class="profile-overview">
   <section class="next-gafus-wallet" data-next-wallet><section class="summary"><h2>Активность</h2></section>
   <section class="history"><h2>История операций</h2></section></section>
 </section></main></div>`);
 // Test both real chunk arrival orders. CSS modules affect background but the
 // competing CSS selectors here are these exact global/local source rules.
 for(const order of [[base,scoped],[scoped,base]]){
   await page.locator('style').evaluateAll(nodes=>nodes.forEach(n=>n.remove()));
   for(const text of order)await page.addStyleTag({content:text});
   const result=await page.evaluate(()=>{
     const pick=sel=>{const node=document.querySelector(sel),css=getComputedStyle(node);
       return {fontSize:css.fontSize,fontWeight:css.fontWeight,lineHeight:css.lineHeight,
         marginBottom:css.marginBottom};};
     return {summary:pick('.summary h2'),history:pick('.history h2')};
   });
   if(result.summary.lineHeight!=='27px'||result.history.marginBottom!=='18px'||
     result.history.lineHeight!=='27px'||result.summary.fontSize!=='18px')
     throw Error('WEB1_WALLET_CASCADE_FAIL '+JSON.stringify(result));
   console.log('WEB1_WALLET_CASCADE_PASS',order[0]===base?'brand-then-web1':'web1-then-brand',JSON.stringify(result));
 }
}finally{await browser.close();}
