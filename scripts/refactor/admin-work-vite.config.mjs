/** Independent QA-only Vite 5373 -> isolated Hono 3301; never edit global Web Vite config. */
import { defineConfig } from 'vite';
import original from '../../apps/web-vite/vite.config.mjs';
const root = '/Users/asmtv1/Desktop/gafus-refactor';
export default defineConfig(env => {
  if (env.command !== 'serve' || process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE !== '1' ||
    process.env.GAFUS_WEB1_ALT_HONO !== '1' ||
    process.env.GAFUS_WEB_DEV_API_MODE !== 'local-hono' ||
    process.env.GAFUS_LOCAL_ISOLATED_API !== '1' ||
    process.env.API_HOST !== '127.0.0.1' || process.env.API_PORT !== '3301' ||
    process.env.GAFUS_WEB_QA_BASE_DIR !== root) {
    throw Error('ADMIN_WORK_VITE_5373_GUARD_DENIED');
  }
  const base = original(env);
  return {
    ...base,
    server: {
      ...base.server,
      host: '127.0.0.1', port: 5373, strictPort: true,
      proxy: { '/api/v1': { target: 'http://127.0.0.1:3301', changeOrigin: false } },
    },
  };
});
