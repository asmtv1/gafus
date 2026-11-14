#!/usr/bin/env node
/**
 * Read-only, bounded Uptrace Cloud canary reader. No ingest credentials.
 * Never print response bodies, request headers, a token or arbitrary attributes.
 */
import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HOST = 'https://api.uptrace.dev';
const MAX_TOKEN_BYTES = 4096;
const DEFAULT_PROJECT = '9378';
const MAX_RESULT_ITEMS = 50;
const ID = /^[a-f0-9]{16,32}$/i;

export class ReadFailure extends Error {
  constructor(code, exitCode) {
    super(code);
    this.name = 'ReadFailure';
    this.exitCode = exitCode;
  }
}

export async function readViewerToken(file) {
  if (typeof file !== 'string' || !file.startsWith('/')) {
    throw new ReadFailure('VIEWER_TOKEN_FILE_REQUIRED', 2);
  }
  let stat;
  try { stat = await lstat(file); }
  catch { throw new ReadFailure('VIEWER_TOKEN_FILE_UNREADABLE', 2); }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      stat.size < 12 || stat.size > MAX_TOKEN_BYTES ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
    throw new ReadFailure('VIEWER_TOKEN_FILE_UNSAFE', 2);
  }
  const token = (await readFile(file, 'utf8')).trim();
  if (token.length < 12 || token.length > MAX_TOKEN_BYTES ||
      /[\r\n\x00-\x1f]/.test(token)) {
    throw new ReadFailure('VIEWER_TOKEN_INVALID', 2);
  }
  return token;
}

export function makeReadUrl(mode, project, now = Date.now(), minutes = 15) {
  if (!/^[1-9][0-9]{0,11}$/.test(String(project))) {
    throw new ReadFailure('PROJECT_ID_INVALID', 4);
  }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
    throw new ReadFailure('WINDOW_INVALID', 4);
  const endpoint = mode === 'spans' || mode === 'groups'
    ? `/api/v1/tracing/${project}/${mode}`
    : mode === 'up' ? `/api/prometheus/${project}/api/v1/query` : null;
  if (!endpoint) throw new ReadFailure('READ_MODE_INVALID', 4);
  const url = new URL(endpoint, HOST);
  if (mode === 'up') url.searchParams.set('query', 'up');
  else {
    url.searchParams.set('time_start', new Date(now - minutes * 60_000).toISOString());
    url.searchParams.set('time_end', new Date(now).toISOString());
    url.searchParams.set('limit', String(MAX_RESULT_ITEMS));
  }
  return url;
}

function boundedRetryDelay(value, attempt, random) {
  const retryAfter = Number(value);
  if (value && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(10_000, Math.round(retryAfter * 1000));
  }
  return 250 * (2 ** attempt) + Math.floor(random() * 100);
}

export async function fetchReadOnlyJson(url, token, {
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  random = Math.random,
} = {}) {
  if (!(url instanceof URL) || url.origin !== HOST ||
      !url.pathname.startsWith('/api/') || url.username || url.password || url.hash) {
    throw new ReadFailure('URL_NOT_ALLOWED', 4);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      if (attempt === 2) throw new ReadFailure('NETWORK_OR_TIMEOUT', 3);
      await sleep(boundedRetryDelay(null, attempt, random));
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new ReadFailure('VIEWER_AUTH_OR_SCOPE', 2);
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 2) throw new ReadFailure('UPTRACE_TEMPORARY_FAILURE', 3);
      await sleep(boundedRetryDelay(response.headers.get('retry-after'), attempt, random));
      continue;
    }
    if (!response.ok) throw new ReadFailure('UPTRACE_UNEXPECTED_STATUS', 4);
    try {
      // Don't surface raw response text when schema is incompatible.
      return await response.json();
    } catch { throw new ReadFailure('UPTRACE_INVALID_JSON', 4); }
  }
  throw new ReadFailure('UPTRACE_UNAVAILABLE', 3);
}

function safeId(value) {
  return typeof value === 'string' && ID.test(value) && !/^0+$/.test(value)
    ? value.toLowerCase() : undefined;
}
function safeService(value) {
  return typeof value === 'string' && /^gafus-[a-z0-9-]{2,48}$/.test(value)
    ? value : undefined;
}
function pickArray(body, keys) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return null;
  for (const key of keys) {
    if (Array.isArray(body[key])) return body[key];
    if (body.data && Array.isArray(body.data[key])) return body.data[key];
  }
  return null;
}
export function summariseResponse(mode, body, project) {
  if (mode === 'up') {
    if (!body || body.status !== 'success' || !Array.isArray(body.data?.result)) {
      throw new ReadFailure('PROMETHEUS_SCHEMA_MISMATCH', 4);
    }
    const results = body.data.result;
    return { project, signal: 'metrics', count: results.length,
      samples: results.slice(0, 10).map(item => ({
        service: safeService(item?.metric?.service) ?? null,
        job: typeof item?.metric?.job === 'string' &&
          /^[a-z0-9_-]{1,48}$/i.test(item.metric.job) ? item.metric.job : null,
        hasValue: Array.isArray(item?.value) && item.value.length === 2,
      })) };
  }
  const rows = pickArray(body, mode === 'spans' ? ['spans', 'items', 'results'] : ['groups', 'items', 'results']);
  if (!rows) throw new ReadFailure('TRACING_SCHEMA_MISMATCH', 4);
  return { project, signal: mode, count: rows.length,
    samples: rows.slice(0, 10).map(row => ({
      traceId: safeId(row?.traceId ?? row?.trace_id) ?? null,
      spanId: safeId(row?.spanId ?? row?.span_id) ?? null,
      service: safeService(row?.serviceName ?? row?.service_name) ?? null,
    })) };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [mode = 'spans', windowMinutes = '15'] = argv;
  const project = env.UPTRACE_PROJECT_ID || DEFAULT_PROJECT;
  if (!/^[1-9][0-9]{0,4}$/.test(windowMinutes)) throw new ReadFailure('WINDOW_INVALID', 4);
  const token = await readViewerToken(env.UPTRACE_VIEWER_TOKEN_FILE);
  const payload = await fetchReadOnlyJson(makeReadUrl(mode, project, Date.now(), Number(windowMinutes)), token);
  const safe = summariseResponse(mode, payload, project);
  process.stdout.write(JSON.stringify(safe) + '\n');
  if (safe.count === 0) throw new ReadFailure('NO_DATA_IN_WINDOW', 3);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Intentionally no raw exception text, URLs, headers or response bodies.
    const known = error instanceof ReadFailure;
    process.stderr.write((known ? error.message : 'UNEXPECTED_READ_FAILURE') + '\n');
    process.exitCode = known ? error.exitCode : 4;
  });
}
