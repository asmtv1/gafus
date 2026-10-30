import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const cwd=fileURLToPath(new URL('../',import.meta.url));
process.chdir(cwd);
await mkdir('dist',{recursive:true});
const result=await build({
  entryPoints:['src/questions-v2-job-entry.ts'],
  outfile:'dist/questions-photo-job.mjs',bundle:true,platform:'node',
  target:'node22',format:'esm',external:['sharp'],metafile:true,
  alias:{'@gafus/feed-cloud':'../../packages/feed-cloud/src/questions-v2.ts',
    '@gafus/cdn-upload':'../../packages/cdn-upload/src/questionsV2Media.ts'},
  banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'},
});
const names=Object.keys(result.metafile.inputs);
if(names.some(name=>/packages\/(?:core|prisma)|(?:\/video|ffmpeg|chat2-job-entry)\b/i.test(name)))
  throw Error('QUESTIONS_JOB_BUNDLE_FORBIDDEN_DEPENDENCIES');
await writeFile('dist/questions-photo-job-metafile.json',JSON.stringify(result.metafile));
console.log('Dedicated Questions image-only Job bundled successfully');
