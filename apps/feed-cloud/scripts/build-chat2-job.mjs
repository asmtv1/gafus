import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const cwd=fileURLToPath(new URL('../',import.meta.url));
process.chdir(cwd);
await mkdir('dist',{recursive:true});
const result=await build({
 entryPoints:['src/chat2-job-entry.ts'],outfile:'dist/chat2-job.mjs',
 bundle:true,platform:'node',target:'node22',format:'esm',external:['sharp'],metafile:true,
 banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'},
});
const files=Object.keys(result.metafile.inputs);
if(files.some(name=>/packages\/prisma|packages\/core\/src|packages\/logger/.test(name)))
  throw Error('CHAT2_JOB_BUNDLE_FORBIDDEN_DEPENDENCIES');
await writeFile('dist/chat2-job-metafile.json',JSON.stringify(result.metafile));
console.log('Chat2 media Job bundled without Prisma and GAFUS Main dependencies.');
