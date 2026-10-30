/** Local-only Feed Media V2 web acceptance, isolated from the running Vite 5173. */
import base from './vite.config.mjs';
import {defineConfig} from 'vite';
export default defineConfig(env=>{
 if(env.command!=='serve'||env.isPreview||process.env.GAFUS_WEB_DEV_API_MODE!=='local-hono'||
  process.env.VITE_WEB4_PRIVATE_S3!=='1'||process.env.GAFUS_FEED_V2_LOCAL_BROWSER!=='1')
  throw Error('ISOLATED_FEED_BROWSER_ENV_REQUIRED');
 const common=typeof base==='function'?base(env):base;
 return {...common,server:{...common.server,host:'127.0.0.1',port:5504,strictPort:true,proxy:{'/api/v1':{target:'http://127.0.0.1:3501',changeOrigin:false}}}};
});
