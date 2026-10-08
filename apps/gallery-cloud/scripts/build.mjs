import { build } from 'esbuild';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
process.chdir(cwd);
await rm('dist', { recursive: true, force: true });
for (const name of ['origin','process','maintenance','dispatch']) {
  const result = await build({ entryPoints: [`src/${name}.ts`], outfile: `dist/${name}/index.js`, bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['sharp'], metafile: true, minify: true });
  const inputs = Object.entries(result.metafile.outputs[`dist/${name}/index.js`].inputs).filter(([,v]) => v.bytesInOutput > 0).map(([k]) => k);
  const imports = result.metafile.outputs[`dist/${name}/index.js`].imports.map(value => value.path);
  const modules = [...inputs, ...imports];
  if (modules.some(x => /(?:prisma|packages\/logger|@gafus[+\/]logger|core\/src\/index)/i.test(x))) throw Error(`FORBIDDEN_BUNDLE:${name}`);
  if (name === 'origin' && modules.some(x => /(?:sharp|client-sqs|sharp-engine)/.test(x))) throw Error('HEAVY_ORIGIN_BUNDLE');
  await writeFile(`dist/${name}/package.json`, JSON.stringify({ private: true, type: 'commonjs' }) + '\n');
  await writeFile(`dist/${name}/metafile.json`, JSON.stringify(result.metafile));
  console.log(`${name}: ${result.metafile.outputs[`dist/${name}/index.js`].bytes} bytes; isolated bundle verified`);
}
await mkdir('dist/local', { recursive: true });
await build({ stdin: { contents: "export { sharpGalleryEngine } from './src/sharp-engine.ts'; export { createGalleryImageProcessor } from '@gafus/core/services/gallery/imageProcessing';", resolveDir: cwd }, outfile: 'dist/local/processor.cjs', bundle: true, platform: 'node', target: 'node20', format: 'cjs', external: ['sharp'] });
