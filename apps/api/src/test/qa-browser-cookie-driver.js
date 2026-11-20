/* Runs INSIDE the user's already-open Chrome via McpGo Playwright Extension.
 * Only synthetic QA users, unique *.localhost cookie hosts, live Hono fetch.
 * No JWT/cookie/password values are returned or written in browser receipts. */
(() => {
  'use strict';
  const done = new Set();
  const assert = (ok, label) => { if (!ok) throw Error('QA_BROWSER_ASSERT_' + label); };
  const data = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const json = async response => data(await response.json());
  async function probe() {
    const res = await fetch('/api/v1/__qa-cookie-probe', {credentials:'include', cache:'no-store'});
    assert(res.status===200,'COOKIE_PROBE_NOT_AVAILABLE');
    return await json(res);
  }
  async function request(path,method='GET',body) {
    const response = await fetch('/api/v1'+path,{
      method, mode:'same-origin', credentials:'include', cache:'no-store', redirect:'error',
      headers:{'Accept':'application/json','X-Gafus-Auth-Transport':'cookie',
        ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const bodyJson=await json(response);
    return {method,path,status:response.status,
      code:typeof bodyJson.code==='string'?bodyJson.code:null,
      success:bodyJson.success===true,
      actorId:bodyJson.data?.user?.id??bodyJson.data?.id??null};
  }
  async function runStep(step){
    assert(typeof step==='string'&&!done.has(step),'DUPLICATE_STEP');
    assert(location.hostname.endsWith('.localhost'),'NON_LOCALHOST_ORIGIN');
    assert(navigator.userAgent.includes('Chrome'),'NOT_PERSONAL_CHROME');
    const fixtureResponse=await fetch('/api/v1/__qa-fixture',{credentials:'include',cache:'no-store'});
    assert(fixtureResponse.status===200,'UNKNOWN_QA_HOST');
    const actor=await json(fixtureResponse);
    assert(actor.id&&actor.username&&actor.password,'MISSING_SYNTHETIC_ACTOR');
    const before=await probe();
    const requests=[];
    async function hit(method,path,status,body){
      const result=await request(path,method,body);
      assert(result.status===status,step+'_HTTP_'+path+'_EXPECTED_'+status+'_GOT_'+result.status);
      if(status===200&&['/auth/me','/auth/login'].includes(path))
        assert(result.actorId===actor.id,step+'_CROSS_ACTOR_ID');
      requests.push(result);
      return result;
    }
    switch(step){
      case 'a_login': case 'b_login': case 'c_login':
        assert(!before.access&&!before.refresh,step+'_DIRTY_INITIAL_COOKIES');
        await hit('GET','/auth/me',401);
        await hit('POST','/auth/login',200,{username:actor.username,password:actor.password});
        await hit('GET','/auth/me',200);
        break;
      case 'a_refresh':
        assert(before.access&&before.refresh,'REFRESH_MISSING_COOKIE');
        await hit('POST','/auth/refresh',200,{});
        await hit('GET','/auth/me',200);
        break;
      case 'a_logout': case 'c_cleanup': case 'b_cleanup':
        assert(before.access&&before.refresh,step+'_MISSING_BEFORE_LOGOUT');
        await hit('POST','/auth/logout',200,{});
        await hit('GET','/auth/me',401);
        break;
      case 'c_after_single': case 'b_after_single':
        assert(before.access&&before.refresh,'OTHER_SESSION_COOKIE_MISSING');
        await hit('GET','/auth/me',200);
        break;
      case 'a_relogin':
        assert(!before.access&&!before.refresh,'RELOGIN_UNEXPECTED_COOKIE');
        await hit('POST','/auth/login',200,{username:actor.username,password:actor.password});
        await hit('GET','/auth/me',200);
        break;
      case 'a_logout_all':
        assert(before.access&&before.refresh,'LOGOUT_ALL_MISSING_LOGIN');
        await hit('POST','/auth/logout-all',200,{});
        await hit('GET','/auth/me',401);
        break;
      case 'c_after_all':
        assert(before.access&&before.refresh,'SECOND_SESSION_COOKIE_REMOVED_EARLY');
        await hit('GET','/auth/me',401);
        await hit('POST','/auth/refresh',401,{});
        await hit('GET','/auth/me',401);
        break;
      case 'b_unaffected':
        assert(before.access&&before.refresh,'OTHER_USER_COOKIE_MISSING');
        await hit('GET','/auth/me',200);
        await hit('POST','/auth/refresh',200,{});
        await hit('GET','/auth/me',200);
        break;
      default:throw Error('QA_BROWSER_UNKNOWN_STEP');
    }
    const after=await probe();
    assert(!document.cookie.includes('gafus_access')&&!document.cookie.includes('gafus_refresh'),
      step+'_HTTPONLY_VISIBLE_TO_JS');
    const browser={origin:location.origin,host:location.hostname,
      userAgent:navigator.userAgent,chrome:true,documentCookieHasAuth:false,
      before,after,requests};
    const saved=await fetch('/api/v1/__qa-record',{
      method:'POST',credentials:'include',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({step,browser})});
    const ack=await json(saved);
    assert(saved.status===200&&ack.recorded===step,'SERVER_SQL_HTTP_PROOF_REJECTED_'+(ack.error??saved.status));
    done.add(step);
    return {step,recorded:true,http:requests.map(({method,path,status,code})=>({method,path,status,code})),
      browser:{origin:location.origin,httpOnlyUnreadable:true,
        cookieBefore:{access:before.access,refresh:before.refresh},
        cookieAfter:{access:after.access,refresh:after.refresh},
        cookieRotated:before.refreshFingerprint&&after.refreshFingerprint?
          before.refreshFingerprint!==after.refreshFingerprint:null},
      sql:ack.sql};
  }
  Object.defineProperty(window,'__qaRunStep',{value:runStep,configurable:false,writable:false});
})();
