#!/usr/bin/env node
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateWebViteGroups, discoverWebTests, groupFingerprint } from './web-vite-groups.mjs';
const root=resolve(import.meta.dirname,'../..');
const file=join(root,'tests/catalog/web-vite-groups.json');
const groups=generateWebViteGroups(discoverWebTests(join(root,'apps/web-vite')));
const value={schema:1,source:'apps/web-vite/src/**/*.{test,spec}.{js,jsx,ts,tsx,cjs,mjs,cts,mts}',legacyCommand:'node --test vite.config.test.mjs && vitest run src --maxWorkers=1',groupFingerprint:groupFingerprint(groups),groups};
if(process.argv[2]==='write'){
  writeFileSync(file,JSON.stringify(value,null,2)+'\n');
  console.log(`WEB_VITE_GROUPS_WRITTEN ${groups.length} groups / ${groups.filter(g=>g.mode==='vitest').flatMap(g=>g.files).length} files`);
}else if(process.argv[2]==='check'){
  const saved=JSON.parse(readFileSync(file,'utf8'));
  if(JSON.stringify(saved)!==JSON.stringify(value))throw Error('WEB_VITE_GROUPS_DRIFT: update manifest via node scripts/qa/web-vite-group-inventory.mjs write');
  console.log(`WEB_VITE_GROUPS_VERIFIED ${groups.length} groups / ${groups.filter(g=>g.mode==='vitest').flatMap(g=>g.files).length} files`);
}else throw Error('Usage: node scripts/qa/web-vite-group-inventory.mjs check|write');
