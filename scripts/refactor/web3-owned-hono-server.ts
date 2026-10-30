/** Strict local-only registered Hono app server for WEB3 synthetic bearer/SQL.
 * This does NOT run background media monitors, scheduled jobs, or production. */
import { existsSync, lstatSync } from 'node:fs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const port=3103;
const url=new URL(process.env.DATABASE_URL??'postgresql://not-allowed.invalid/not-allowed');
const ok=process.cwd()===ROOT+'/apps/api'&&
 process.env.GAFUS_WEB3_OWN_HTTP==='1'&&
 process.env.NODE_ENV==='development'&&
 process.env.GAFUS_LOCAL_ISOLATED_API==='1'&&
 process.env.API_HOST==='127.0.0.1'&&process.env.API_PORT==='3103'&&
 ['redis://127.0.0.1:55927/1','redis://127.0.0.1:55927/6','redis://127.0.0.1:55927/7','redis://127.0.0.1:55927/8','redis://127.0.0.1:55927/9'].includes(process.env.REDIS_URL??'')&&
 url.protocol==='postgresql:'&&url.hostname==='127.0.0.1'&&
 url.port==='55921'&&url.username==='gafus_refactor_local_real'&&
 url.pathname==='/gafus_refactor_real_work_20261024'&&
 url.search==='?schema=public'&&Boolean(url.password)&&
 existsSync(ROOT+'/apps/api')&&!lstatSync(ROOT+'/apps/api').isSymbolicLink();
if(!ok)throw Error('WEB3_LOCAL_HTTP_PREFLIGHT_DENIED');
async function main(){
 const [{app},{serve}]=await Promise.all([
  import('../../apps/api/src/app.ts'),
  import('../../apps/api/node_modules/@hono/node-server/dist/index.mjs'),
 ]);
 const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port});
 console.log('WEB3_REGISTERED_HONO_OWN_LOOPBACK_READY',port);
 for(const signal of ['SIGTERM','SIGINT'] as const){
  process.on(signal,()=>server.close(()=>process.exit(0)));
 }
}
void main().catch(e=>{console.error('WEB3_HONO_START_ERROR',e instanceof Error?e.message:'unknown');process.exitCode=1;});
