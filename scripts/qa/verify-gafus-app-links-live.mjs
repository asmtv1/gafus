#!/usr/bin/env node
/** Run read-only AFTER web/nginx deployment, never as a predeploy gate. */
import { expectedSourceFiles,verifyLiveDomainLinks } from './gafus-app-links-live.mjs';
try {
  const routes=await verifyLiveDomainLinks({expected:expectedSourceFiles()});
  console.log(`GAFUS_APP_LINKS_LIVE_PASS (${routes.length}/4): verified JSON, no redirects, apex+www`);
} catch(e) {
  console.error('GAFUS_APP_LINKS_LIVE_NOT_READY:'+e.message);
  process.exitCode=1;
}
