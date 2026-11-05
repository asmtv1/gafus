#!/usr/bin/env node
/** Static CI and real destination cutover gate. Safe, no production mutations. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateStaticContracts, validateCutoverConfig, verifyLiveDestination,
  verifyQaStatus, readDestinationEnv, probePublicWebsocketUpgrade,
  verifyMobileForcedUpdate } from './chat2-release-readiness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composeFile = path.join(root, 'ci-cd/docker/docker-compose.prod.yml');
const read = file => readFileSync(path.join(root, file), 'utf8');
try {
  validateStaticContracts(read('ci-cd/docker/docker-compose.prod.yml'),
    read('ci-cd/docker/nginx-vite-refactor.conf'),
    JSON.parse(read('infra/chat2/centrifugo.prod.json')),
    read('ci-cd/nginx/conf.d/gafus.ru.conf'));
  if (process.argv.includes('--staged')) {
    if (process.argv.includes('--release') || process.argv.includes('--candidate'))
      throw Error('CHAT2_RELEASE_BLOCKED: staging cannot be combined with release');
    validateCutoverConfig(process.env, true);
    console.log('Chat2 STAGED configuration PASS: legacy retirement DISABLED; runtime NOT VERIFIED');
  } else if (process.argv.includes('--candidate') && process.argv.includes('--release'))
    throw Error('CHAT2_RELEASE_BLOCKED: choose exactly one validation mode');
  if (process.argv.includes('--candidate')) {
    // Intended CI values only. Never presented as live destination readiness.
    validateCutoverConfig(process.env);
    verifyQaStatus(read('docs/qa/CURRENT_RELEASE_STATUS.md'));
    // Already at candidate time: check the actual published two-platform
    // minimum/store links BEFORE any image pull or release mutation.
    await verifyMobileForcedUpdate(process.env);
    console.log('Chat2 intended configuration + published forced Mobile update PASS (candidate only; broker live unverified)');
  } else if (process.argv.includes('--release')) {
    const i = process.argv.indexOf('--destination-env');
    if (i < 0 || !process.argv[i + 1] || process.argv[i + 1].startsWith('--'))
      throw Error('CHAT2_RELEASE_BLOCKED: --destination-env is required (actual target Compose env)');
    const destination = path.resolve(process.argv[i + 1]);
    if (destination !== path.join(root, 'ci-cd/docker/.env'))
      throw Error('CHAT2_RELEASE_BLOCKED: only the actual target Compose .env is accepted');
    const env = readDestinationEnv(destination);
    validateCutoverConfig(env);
    verifyQaStatus(read('docs/qa/CURRENT_RELEASE_STATUS.md'));
    verifyLiveDestination(env, composeFile);
    await verifyMobileForcedUpdate(env);
    await probePublicWebsocketUpgrade(env.CHAT2_PUBLIC_WS_URL);
    console.log('Chat2 cutover PASS: target config + QA veto + LIVE API/worker/broker health + public WSS upgrade');
  } else if (!process.argv.includes('--staged')) console.log('Chat2 static broker/proxy/Compose contract PASS; NOT release readiness');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'CHAT2_RELEASE_BLOCKED: unknown error');
  process.exitCode = 1;
}
