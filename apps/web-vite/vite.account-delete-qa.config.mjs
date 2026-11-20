/** Real original Web UI on a fresh unique cookie host. Test-only proxy to
 * only the Hono child created by api-account-delete-web-isolated.sh.
 * The ordinary Vite config and normal web dev API targets are untouched. */
import {defineConfig} from 'vite';
import baseConfig from './vite.config.mjs';
const run=process.env.GAFUS_QA_ACCOUNT_DELETE_RUN??'';
const webPort=Number(process.env.GAFUS_QA_ACCOUNT_DELETE_WEB_PORT);
const apiPort=Number(process.env.GAFUS_QA_ACCOUNT_DELETE_API_PORT);
const temp=process.env.GAFUS_QA_ACCOUNT_DELETE_DIR??'';
const expectedDb=process.env.GAFUS_QA_ACCOUNT_DELETE_DB??'';
const safe=process.env.GAFUS_QA_ACCOUNT_DELETE_WEB==='1'&&
  process.env.GAFUS_LOCAL_ISOLATED_API==='1'&&
  /^[a-f0-9]{12}$/.test(run)&&Number.isInteger(webPort)&&webPort>=1024&&webPort<=65535&&
  Number.isInteger(apiPort)&&apiPort>=1024&&apiPort<=65535&&apiPort!==webPort&&
  /^\/tmp\/gafus-qa-delete-web\.[a-zA-Z0-9]+$/.test(temp)&&
  /^archqa_delete_[a-f0-9]{12}$/.test(expectedDb)&&
  process.env.GAFUS_WEB_DEV_API_MODE==='mock'&&!process.env.VITE_API_BASE_URL;
if(!safe)throw Error('QA_DELETE_WEB_ORIGIN_OR_LOOPBACK_PREFLIGHT_DENIED');
export default defineConfig(context=>{
  if(context.command!=='serve')throw Error('QA_DELETE_WEB_SERVE_ONLY');
  const base=baseConfig(context);
  return {...base,
    cacheDir:temp+'/vite-cache',
    server:{...base.server,host:'127.0.0.1',port:webPort,strictPort:true,
      allowedHosts:[`qa-delete-owner-${run}.localhost`,`qa-delete-other-${run}.localhost`],
      proxy:{'/api/v1':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:false,
        configure(proxy){proxy.on('error',()=>{});}}}},
  };
});
