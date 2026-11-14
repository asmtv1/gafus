import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await build({
 entryPoints:[resolve(root,'src/diagnostics-browser.ts')],
 outfile:resolve(root,'dist/gafus-diagnostics.js'),
 platform:'browser',format:'iife',bundle:true,minify:true,target:'es2022',
 logLevel:'error',sourcemap:false,
});
