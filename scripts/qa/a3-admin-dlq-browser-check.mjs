/** Browser acceptance against actual Vite Admin/App + Hono/Prisma on disposable PG.
 * Connects ONLY to running McpGo shared Chrome MCP proxy 8940; never launches Chromium.
 * Keeps all unrelated personal Chrome tabs untouched and redacts their titles/URLs.
 */
const endpoint='http://127.0.0.1:8940/mcp';
const base='http://127.0.0.1:3001';
const view='http://127.0.0.1:5174/media';
let sid='';let seq=1;
function parse(raw){
 if(!raw.trim())return null;
 if(raw.trim().startsWith('{'))return JSON.parse(raw);
 for(const line of raw.split(/\r?\n/)) if(line.startsWith('data: ')){try{return JSON.parse(line.slice(6));}catch{}}
 throw Error('A3_MCP_RESPONSE_UNEXPECTED');
}
async function send(method,params,id=seq++){
 const body={jsonrpc:'2.0',method};if(id!==null)body.id=id;if(params!==undefined)body.params=params;
 const headers={'accept':'application/json, text/event-stream','content-type':'application/json','mcp-protocol-version':'2025-03-26'};
 if(sid)headers['mcp-session-id']=sid;
 const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(28000)});
 sid=r.headers.get('mcp-session-id')||sid;
 const text=await r.text();if(!r.ok)throw Error('A3_MCP_HTTP_'+r.status);
 const parsed=parse(text);if(parsed?.error)throw Error('A3_MCP_ERROR_'+JSON.stringify(parsed.error).slice(0,170));
 return parsed;
}
async function call(name,args){
 const data=await send('tools/call',{name,arguments:args});
 const answer=(data?.result?.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
 if(data?.result?.isError)throw Error('A3_BROWSER_'+name+'_ERROR_'+answer.slice(0,220));
 return answer;
}
async function api(path,method='GET'){
 const r=await fetch(base+path,{method,signal:AbortSignal.timeout(5000)});
 return {status:r.status,body:await r.json()};
}
async function tabIndex(){
 const t=await call('browser_tabs',{action:'list'});
 const hits=t.split(/\r?\n/).filter(line=>line.includes('[GAFUS — администрирование]') && line.includes(view));
 if(hits.length!==1)throw Error('A3_BROWSER_QA_TAB_NOT_UNIQUE');
 const m=hits[0].match(/\b(\d+):/);
 if(!m)throw Error('A3_BROWSER_QA_INDEX_MISSING');
 return Number(m[1]);
}
async function selectOwnTab(){ await call('browser_tabs',{action:'select',index:await tabIndex()}); }
const ensureQA='if (location.origin !== "http://127.0.0.1:5174") throw Error("NOT_QA_TAB");';
async function inspect(){
 const raw=await call('browser_evaluate',{function:`() => { ${ensureQA} return JSON.stringify({path:location.pathname,headings:[...document.querySelectorAll('h1,h2')].map(x=>x.textContent),rows:[...document.querySelectorAll('.exception-row')].map(x=>x.textContent),alerts:[...document.querySelectorAll('[role="alert"]')].map(x=>x.textContent),links:[...document.querySelectorAll('a')].filter(x=>x.textContent.includes('Медиа и хранение')).length}); }`});
 const m=raw.match(/\"\\?\{.*?\\?\}\"/);
 // Escape shape differs between MCP implementations. Read ordinary JSON string from ### Result.
 const lines=raw.trim().split(/\r?\n/);
 const value=lines.find(x=>x.startsWith('"')&&x.includes('headings')) ?? lines.find(x=>x.startsWith('{')&&x.includes('headings'));
 if(!value)throw Error('A3_BROWSER_EVALUATE_SHAPE_'+raw.slice(0,260));
 let parsed=JSON.parse(value);
 if(typeof parsed==='string')parsed=JSON.parse(parsed);
 return parsed;
}
async function waitFor(check,what){
 for(let i=0;i<28;i++){
  const state=await inspect();if(check(state))return state;
  await new Promise(resolve=>setTimeout(resolve,140));
 }
 throw Error('A3_BROWSER_WAIT_TIMEOUT_'+what);
}
await send('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'a3-admin-dlq-browser-acceptance',version:'1.0.0'}});
await send('notifications/initialized',undefined,null);
let created=false;
try{
 const list=await call('browser_tabs',{action:'list'});
 const candidates=list.split(/\r?\n/).filter(x=>x.includes(view));
 if(candidates.length===0){await call('browser_tabs',{action:'new',url:view});created=true;}
 await selectOwnTab();
 const admin=await waitFor(s=>s.headings.includes('Фоновые операции Chat 2.0')&&s.rows.length===2,'admin-panel-and-two-dlq');
 console.log('A3_CHROME_REAL_APP_ADMIN_VISIBLE_PASS rows='+admin.rows.length+' sidebar='+admin.links);
 // Fixture insertion order 1 then 2; newest dead letter 2 is claimed, so second row is retryable event 1.
 await call('browser_click',{target:'.exception-row:nth-child(2) button',element:'Retry the older unclaimed synthetic DLQ event'});
 const result=await waitFor(s=>s.rows.length===1 && s.alerts.length===0,'one-retry-no-error');
 const saved=await api('/api/v1/a3-qa/state');
 if(saved.status!==200||saved.body?.data?.deadLetteredAt!==null||saved.body?.data?.attempts!==0)throw Error('A3_BROWSER_DB_CAS_NOT_RESET');
 console.log('A3_CHROME_ACTUAL_RETRY_CAS_PASS remaining='+result.rows.length);
 // The remaining synthetic DLQ row is claimed, so UI must show conflict rather than success.
 await call('browser_click',{target:'.exception-row button',element:'Attempt claimed synthetic DLQ event'});
 const conflict=await waitFor(s=>s.alerts.some(a=>a.includes('Повтор не выполнен')),'claimed-conflict');
 if(conflict.rows.length!==1)throw Error('A3_BROWSER_CONFLICT_ROW_LOST');
 console.log('A3_CHROME_CONFLICT_ERROR_VISIBLE_PASS');
 // Role change is on a disposable local fixture only; production authentication is not simulated here.
 const mod=await api('/api/v1/a3-qa/role?role=MODERATOR');if(mod.status!==200)throw Error('A3_BROWSER_ROLE_TOGGLE_FAILED');
 const denied=await api('/api/v1/admin/media/chat-outbox/dead-letters');if(denied.status!==403)throw Error('A3_BROWSER_ROLE_ACL_NOT_403');
 await call('browser_navigate',{url:view});
 const modUI=await waitFor(s=>!s.headings.includes('Фоновые операции Chat 2.0') && s.links===0,'moderator-no-panel');
 console.log('A3_CHROME_MODERATOR_DENIED_403_AND_MENU_HIDDEN_PASS');
 const adm=await api('/api/v1/a3-qa/role?role=ADMIN');if(adm.status!==200)throw Error('A3_BROWSER_RESTORE_ADMIN_FAILED');
 await call('browser_navigate',{url:view});
 const restored=await waitFor(s=>s.headings.includes('Фоновые операции Chat 2.0')&&s.rows.length===1,'admin-restored');
 console.log('A3_CHROME_ADMIN_RESTORED_PASS rows='+restored.rows.length);
}finally{
 try{await api('/api/v1/a3-qa/role?role=ADMIN');}catch{}
 // Close only the dedicated localhost tab, never user tabs.
 try{await selectOwnTab();await call('browser_tabs',{action:'close',index:await tabIndex()});console.log('A3_CHROME_QA_TAB_CLOSED_PASS');}
 catch(error){console.log('A3_CHROME_QA_TAB_CLEANUP_INCOMPLETE',String(error).slice(0,120));}
}
