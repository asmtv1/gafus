import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
process.chdir(cwd);
await rm('dist', { recursive: true, force: true });
await build({ entryPoints: ['index','hmac','cdn','objects','keys','config'].map(x => `src/${x}.ts`), outdir: 'dist', bundle: true, packages: 'external', platform: 'node', target: 'node22', format: 'esm' });
// Source typecheck is separate; noCheck avoids emitting unrelated core declaration graph errors.
execFileSync('pnpm', ['exec','tsc','--noCheck','--noEmit','false','--declaration','true','--emitDeclarationOnly','--outDir','.types'], { stdio: 'inherit' });
await mkdir('dist', { recursive: true });
for (const name of ['index','hmac','cdn','objects','keys','config']) await cp(`.types/gallery-storage/src/${name}.d.ts`, `dist/${name}.d.ts`);
await rm('.types', { recursive: true, force: true });
