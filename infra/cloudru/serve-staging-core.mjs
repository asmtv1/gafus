/** Starts a restricted GAFUS internal-only Hono API on localhost staging DB. */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const root=join(homedir(),'.codex/cloudru/gafus-media-core-staging');
const text=await readFile(join(root,'core.env'),'utf8');
const values=Object.fromEntries(text.split('\n').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
for(const k of ['PG_APP_PASSWORD','REDIS_PASSWORD','GALLERY_INTERNAL_HMAC_SECRET','FEED_INTERNAL_HMAC_SECRET'])if(!values[k])throw Error('STAGING_SECRET_MISSING');
const child=spawn('pnpm',['--filter','@gafus/api','exec','tsx','src/staging-media-core.ts'],{
  stdio:'inherit',cwd:process.cwd(),env:{PATH:process.env.PATH,HOME:homedir(),USER:process.env.USER??'asmtv1',NODE_ENV:'test',
    GAFUS_MEDIA_CORE_STAGE_ONLY:'isolated-localhost',
    DATABASE_URL:`postgresql://gafus_media_stage:${values.PG_APP_PASSWORD}@127.0.0.1:55448/gafus_media_stage?schema=public`,
    REDIS_URL:`redis://:${values.REDIS_PASSWORD}@127.0.0.1:56389`,
    API_PORT:'31339',GALLERY_ENABLED:'false',FEED_ENABLED:'false',FEED_PROCESSOR_READY:'false',
    GALLERY_INTERNAL_HMAC_SECRET:values.GALLERY_INTERNAL_HMAC_SECRET,
    FEED_INTERNAL_HMAC_SECRET:values.FEED_INTERNAL_HMAC_SECRET,
    // Never include production credentials, URLs, secrets or user providers.
  }});
process.on('SIGTERM',()=>child.kill('SIGTERM'));
process.on('SIGINT',()=>child.kill('SIGINT'));
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
