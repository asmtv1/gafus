#!/usr/bin/env node
/**
 * Release inventory guard (no checkout writes). CI must build actual Git-tracked
 * refactor sources, never succeed only because a developer has local untracked files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function listedFiles() {
  return new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean));
}
const files = listedFiles();
const problems = [];
const required = [
  'apps/web-vite/src/App.tsx',
  'apps/web-vite/src/features/chats/Chat2Messenger.tsx',
  'apps/api/src/app.ts',
  'apps/api/src/routes/v1/chats.ts',
  'apps/mobile/app/_layout.tsx',
  'apps/admin-panel/src/admin-live/App.tsx',
  'apps/trainer-panel/src/trainer-vite/live/main.tsx',
  'packages/prisma/schema.prisma',
  'docs/current/ARCHITECTURE.md',
  'docs/current/MEDIA.md',
  'docs/qa/CURRENT_RELEASE_STATUS.md',
  'scripts/check-web-core-boundary.mjs',
  '.github/workflows/ci-cd.yml',
];
for (const item of required) if (!files.has(item)) problems.push('Required release source missing from Git: ' + item);

for (const filename of files) {
  if (/(^|\/)(secrets|credentials|rustore-signing)\//i.test(filename) ||
      /(^|\/)\.env(\.|$)/.test(filename) && !filename.endsWith('.env.example') ||
      /\.(p8|p12|pfx|jks|keystore|pem|key)$/i.test(filename)) {
    problems.push('Private material tracked by Git: ' + filename);
  }
}
const migrationsDir = path.join(root, 'packages/prisma/migrations');
if (fs.existsSync(migrationsDir)) {
  for (const entry of fs.readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relative = 'packages/prisma/migrations/' + entry.name + '/migration.sql';
    if (fs.existsSync(path.join(root, relative)) && !files.has(relative)) {
      problems.push('Untracked database migration: ' + relative);
    }
  }
}
const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
for (const rule of ['secrets/', '**/*.p8', '**/credentials/']) {
  if (!ignore.split(/\r?\n/).includes(rule)) problems.push('Missing Docker secret rule: ' + rule);
}
if (problems.length) {
  for (const item of problems.slice(0, 45)) console.error(item);
  if (problems.length > 45) console.error('...and', problems.length - 45, 'more');
  process.exit(1);
}
console.log('Release inventory PASS: required Web/Admin/Trainer/API/Mobile sources and all local migrations tracked, private keys excluded');
