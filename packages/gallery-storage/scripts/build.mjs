import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, cp, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const cwd = fileURLToPath(new URL('../', import.meta.url));
process.chdir(cwd);
const entries = ['index', 'hmac', 'cdn', 'objects', 'keys', 'config', 'fallback'];
// A per-build temp directory prevents concurrent/retried package builds from
// removing each other's declaration outputs. Do not use a shared .types dir.
const typesDir = await mkdtemp(join(cwd, '.types-build-'));
try {
  await rm('dist', { recursive: true, force: true });
  await build({ entryPoints: entries.map(x => `src/${x}.ts`), outdir: 'dist', bundle: true, packages: 'external', platform: 'node', target: 'node22', format: 'esm' });
  // Source typecheck is separate; noCheck avoids unrelated core declaration errors.
  execFileSync('pnpm', ['exec', 'tsc', '--noCheck', '--noEmit', 'false',
    '--declaration', 'true', '--emitDeclarationOnly', '--outDir', typesDir],
    { stdio: 'inherit' });
  await mkdir('dist', { recursive: true });
  for (const name of entries) {
    await cp(join(typesDir, 'gallery-storage', 'src', `${name}.d.ts`),
      join(cwd, 'dist', `${name}.d.ts`));
  }
} finally {
  await rm(typesDir, { recursive: true, force: true });
}
