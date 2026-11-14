/** Browser-only, anonymous, release-gated GAFUS diagnostic collector.
 * No DSN, tokens in storage, URL, user ID, form content or error.message.
 * This producer is opt-in until the same-origin ingress is approved.
 */
type Service='gafus-web'|'gafus-admin-panel'|'gafus-trainer-panel'|'gafus-bull-board';
type Kind='js_handled'|'react_error'|'promise_rejection'|'network_failure'|'startup_failure';
type EventV1={
  schemaVersion:1;eventId:string;appStartId:string;platform:'web';
  kind:Kind;severity:'ERROR'|'FATAL';occurredAt:string;
  appVersion:string;build:string;runtime:string;channel:'web';updateId:'embedded';
  errorCode:string;stack?:string;operation?:string;
};
export type BrowserTelemetryOptions={
  service:Service;appVersion:string;build:string;enabled:boolean;
};
const ALLOWED_CODES=new Set([
  'WEB_JS_ERROR','WEB_REACT_RENDER','WEB_UNHANDLED_REJECTION','WEB_RESOURCE_LOAD',
  'WEB_CHUNK_PRELOAD','WEB_RUNTIME_STARTUP','WEB_OPERATION_FAILED',
]);
const BUILD=/^[a-zA-Z0-9_.-]{8,40}$/;
const VERSION=/^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:[-+][a-zA-Z0-9.-]{1,24})?$/;
const MAX_EVENTS=100,MAX_BYTES=2*1024*1024, MAX_BATCH_BYTES=128*1024;
const RETENTION_MS=72*60*60*1000;
const DB='gafus-safe-diagnostics-v1',STORE='events',LEASES='leases';
const hasId=(s:unknown):s is string=>
  typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const safeFrameName=(value:string)=>
  /^[a-zA-Z_$][a-zA-Z0-9_.$<>-]{0,99}$/.test(value)?value:'anonymous';
export function sanitizeBrowserFrames(input:unknown):string|undefined {
  if(!(input instanceof Error)||typeof input.stack!=='string')return undefined;
  const frames:string[]=[];
  for(const raw of input.stack.split(/[\r\n]/).slice(0,150)){
    if(frames.length>=50)break;
    const line=raw.trim();
    // Parse function and numeric location only; never persist chunk URL.
    const v8=/^at\s+([a-zA-Z_$][a-zA-Z0-9_.$<>-]{0,99})\s*\([^)]*:(\d{1,7}):(\d{1,7})\)$/.exec(line);
    const ff=/^([a-zA-Z_$][a-zA-Z0-9_.$<>-]{0,99})@[^\s]*:(\d{1,7}):(\d{1,7})$/.exec(line);
    const f=v8??ff;
    if(f)frames.push(`at ${safeFrameName(f[1]!)} (bundle:${Number(f[2])}:${Number(f[3])})`);
  }
  return frames.join('\n').slice(0,8192)||undefined;
}
class BrowserCollector {
  private launchId=crypto.randomUUID();
  private reported=new WeakSet<object>();
  private pendingMemory=new Map<string,EventV1>();
  private pendingPromises=new Map<Promise<unknown>,number>();
  private flushing=false;
  private retryAt=0;
  private token:string|undefined;
  private tokenExpiry=0;
  private dbPromise:Promise<IDBDatabase|null>|undefined;
  private readonly key=crypto.randomUUID();
  constructor(private readonly opts:BrowserTelemetryOptions){}
  start() {
    window.addEventListener('error',(event:Event)=>{
      if(event instanceof ErrorEvent) this.capture(event.error,'js_handled','WEB_JS_ERROR');
      else {
        const target=event.target;
        if(target instanceof HTMLScriptElement||target instanceof HTMLLinkElement||
           target instanceof HTMLImageElement||target instanceof HTMLVideoElement)
          this.capture(null,'network_failure','WEB_RESOURCE_LOAD');
      }
    },true);
    window.addEventListener('unhandledrejection',event=>{
      const reason=event.reason;
      const handle=window.setTimeout(()=>{
        this.pendingPromises.delete(event.promise);
        this.capture(reason,'promise_rejection','WEB_UNHANDLED_REJECTION');
      },1000);
      this.pendingPromises.set(event.promise,handle);
    });
    window.addEventListener('rejectionhandled',event=>{
      const id=this.pendingPromises.get(event.promise);
      if(id!==undefined)window.clearTimeout(id);
      this.pendingPromises.delete(event.promise);
    });
    window.addEventListener('vite:preloadError',()=>{
      this.capture(null,'network_failure','WEB_CHUNK_PRELOAD');
    });
    window.addEventListener('online',()=>void this.flush());
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')void this.flush();
    });
    // Foreground bounded retry survives transient 429/503; no busy polling
    // while backgrounded. Offline persistence is independent of this timer.
    window.setInterval(()=>{
      if(document.visibilityState==='visible')void this.flush();
    },30_000);
    void this.flush();
  }
  private async database() {
    if(this.dbPromise)return this.dbPromise;
    this.dbPromise=new Promise(resolve=>{
      if(!('indexedDB' in window)){resolve(null);return;}
      try{
        const open=indexedDB.open(DB,2);
        open.onupgradeneeded=()=>{
          if(!open.result.objectStoreNames.contains(STORE))
            open.result.createObjectStore(STORE,{keyPath:'eventId'});
          if(!open.result.objectStoreNames.contains(LEASES))
            open.result.createObjectStore(LEASES);
        };
        open.onsuccess=()=>resolve(open.result);
        open.onerror=()=>resolve(null);
        open.onblocked=()=>resolve(null);
      }catch{resolve(null);}
    });
    return this.dbPromise;
  }
  private async readAll():Promise<EventV1[]> {
    const db=await this.database();
    if(!db)return [...this.pendingMemory.values()];
    return new Promise(resolve=>{
      try{
        const tx=db.transaction(STORE,'readonly');
        const request=tx.objectStore(STORE).getAll();
        request.onsuccess=()=>{
          const merged=new Map<string,EventV1>((request.result as EventV1[])
            .map(e=>[e.eventId,e]));
          for(const e of this.pendingMemory.values())merged.set(e.eventId,e);
          resolve([...merged.values()]);
        };
        request.onerror=()=>resolve([...this.pendingMemory.values()]);
      }catch{resolve([...this.pendingMemory.values()]);}
    });
  }
  private async mutate(operation:(store:IDBObjectStore)=>void):Promise<boolean> {
    const db=await this.database();
    if(!db)return false;
    return new Promise(resolve=>{
      try{
        const tx=db.transaction(STORE,'readwrite');
        operation(tx.objectStore(STORE));
        tx.oncomplete=()=>resolve(true);
        tx.onerror=()=>resolve(false);
        tx.onabort=()=>resolve(false);
      }catch{resolve(false);}
    });
  }
  private async acquireLease():Promise<(() => Promise<void>)|null> {
    const db=await this.database();
    if(!db)return async()=>undefined; // private mode: per-tab memory-only queue
    return new Promise(resolve=>{
      try{
        const tx=db.transaction(LEASES,'readwrite');
        const store=tx.objectStore(LEASES);
        const req=store.get('export');
        let claimed=false;
        req.onsuccess=()=>{
          const prior=req.result as {owner?:string;expiresAt?:number}|undefined;
          if(!prior?.expiresAt||prior.expiresAt<Date.now()||prior.owner===this.key){
            store.put({owner:this.key,expiresAt:Date.now()+60_000},'export');
            claimed=true;
          }
        };
        tx.oncomplete=()=>{
          if(!claimed){resolve(null);return;}
          resolve(async()=>{
            await new Promise<void>(release=>{
              try{
                const unlock=db.transaction(LEASES,'readwrite');
                const holder=unlock.objectStore(LEASES).get('export');
                holder.onsuccess=()=>{
                  if((holder.result as {owner?:string}|undefined)?.owner===this.key)
                    unlock.objectStore(LEASES).delete('export');
                };
                unlock.oncomplete=()=>release();
                unlock.onerror=()=>release();
                unlock.onabort=()=>release();
              }catch{release();}
            });
          });
        };
        tx.onerror=()=>resolve(null);
        tx.onabort=()=>resolve(null);
      }catch{resolve(null);}
    });
  }
  private async persist(event:EventV1) {
    const items=await this.readAll();
    const valid=items.filter(e=>Date.parse(e.occurredAt)>Date.now()-RETENTION_MS &&
      e.build===this.opts.build&&e.appVersion===this.opts.appVersion);
    valid.push(event);
    valid.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
    while(valid.length>MAX_EVENTS||
      JSON.stringify(valid).length>MAX_BYTES)valid.shift();
    const keep=new Set(valid.map(e=>e.eventId));
    if(!keep.has(event.eventId))return;
    const committed=await this.mutate(store=>{
      for(const old of items)if(!keep.has(old.eventId))store.delete(old.eventId);
      store.put(event);
    });
    if(!committed) {
      for(const old of items)if(!keep.has(old.eventId))this.pendingMemory.delete(old.eventId);
      this.pendingMemory.set(event.eventId,event);
    }
  }
  capture(error:unknown,kind:Kind,code:string) {
    if(!ALLOWED_CODES.has(code))return;
    if(error&&typeof error==='object'){
      if(this.reported.has(error))return;
      this.reported.add(error);
    }
    const event:EventV1={
      schemaVersion:1,eventId:crypto.randomUUID(),appStartId:this.launchId,
      platform:'web',kind,severity:'ERROR',occurredAt:new Date().toISOString(),
      appVersion:this.opts.appVersion,build:this.opts.build,runtime:this.opts.build,
      channel:'web',updateId:'embedded',errorCode:code,
      ...(sanitizeBrowserFrames(error)?{stack:sanitizeBrowserFrames(error)}:{}),
    };
    void this.persist(event).then(()=>this.flush()).catch(()=>undefined);
  }
  private async grant():Promise<boolean> {
    if(this.token&&Date.now()<this.tokenExpiry-10_000)return true;
    try{
      const response=await fetch('/api/v1/telemetry/web/session',{
        method:'POST',headers:{'Content-Type':'application/json'},
        credentials:'omit',cache:'no-store',redirect:'error',
        signal:AbortSignal.timeout(8000),
        body:JSON.stringify({appVersion:this.opts.appVersion,build:this.opts.build}),
      });
      if(!response.ok){
        this.retryAt=Date.now()+60_000;
        return false;
      }
      const result=await response.json() as {token?:unknown;expiresAt?:unknown};
      if(!hasId(this.launchId)||typeof result.token!=='string'||
        !/^[A-Za-z0-9_-]{43}$/.test(result.token)||typeof result.expiresAt!=='string')return false;
      this.token=result.token;
      this.tokenExpiry=Date.parse(result.expiresAt);
      return Number.isFinite(this.tokenExpiry);
    }catch{return false;}
  }
  async flush() {
    if(this.flushing||Date.now()<this.retryAt||!navigator.onLine)return;
    this.flushing=true;
    let unlock:(()=>Promise<void>)|null=null;
    try{
      unlock=await this.acquireLease();
      if(!unlock)return; // another tab owns the in-flight export
      let items=(await this.readAll()).filter(e=>Date.parse(e.occurredAt)>Date.now()-RETENTION_MS);
      if(!items.length)return;
      items=items.filter(e=>e.build===this.opts.build&&e.appVersion===this.opts.appVersion);
      if(!items.length)return;
      items.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
      const batch:EventV1[]=[];
      for(const event of items.slice(0,50)){
        if(JSON.stringify({schemaVersion:1,events:[...batch,event]}).length>MAX_BATCH_BYTES)break;
        batch.push(event);
      }
      if(!batch.length||!(await this.grant()))return;
      const response=await fetch('/api/v1/telemetry/web',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+this.token},
        credentials:'omit',cache:'no-store',redirect:'error',
        signal:AbortSignal.timeout(8000),
        body:JSON.stringify({schemaVersion:1,events:batch}),
      });
      if(response.status===401){this.token=undefined;this.tokenExpiry=0;return;}
      if(response.status===429||response.status>=500){
        const header=response.headers.get('Retry-After');
        const seconds=header===null?NaN:Number(header);
        this.retryAt=Date.now()+((Number.isFinite(seconds)&&seconds>=0&&seconds<=900)?seconds*1000:15_000);
        return;
      }
      if(!response.ok)return;
      const result=await response.json() as {accepted?:unknown};
      if(!Array.isArray(result.accepted))return;
      const expected=new Set(batch.map(e=>e.eventId));
      const ack=result.accepted.filter((id:unknown):id is string=>
        typeof id==='string'&&expected.has(id));
      const committed=await this.mutate(store=>{for(const id of ack)store.delete(id);});
      if(committed)for(const id of ack)this.pendingMemory.delete(id);
      else for(const id of ack)this.pendingMemory.delete(id);
    }catch{
      this.retryAt=Date.now()+15_000;
    }finally{
      try{await unlock?.();}catch{/* lease expires after bounded interval */}
      this.flushing=false;
    }
  }
}
let active:BrowserCollector|undefined;
export function startBrowserTelemetry(opts:BrowserTelemetryOptions):boolean {
  if(typeof window==='undefined'||!opts.enabled||active)return false;
  if(!BUILD.test(opts.build)||!VERSION.test(opts.appVersion))return false;
  active=new BrowserCollector(opts);
  active.start();
  return true;
}
export function reportBrowserDiagnostic(error:unknown,kind:Kind='react_error',
  code='WEB_REACT_RENDER') {
  active?.capture(error,kind,code);
}
