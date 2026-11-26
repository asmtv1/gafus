#!/usr/bin/env node
/** Verify that ONLY the Vite process started for a disposable QA run may be
 * signalled, and independently prove that both its PID and port are released.
 * No process is created, modified or signalled by this helper. */
import { spawnSync } from 'node:child_process';

function validPort(port) {
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65535;
}
function validPid(pid) {
  return Number.isSafeInteger(pid) && pid > 1;
}

export function verifyViteLifecycle({ mode, pid, port, uid, parentPid, processInfo, listeners }) {
  if (!['owned', 'released'].includes(mode) || !validPid(pid) || !validPort(port)) {
    return { ok: false, reason: 'BAD_QA_PID_PORT_OR_MODE' };
  }
  if (!Number.isSafeInteger(uid) || uid < 1 || !Array.isArray(listeners) ||
      listeners.some(value => !validPid(value))) {
    return { ok: false, reason: 'UNKNOWN_QA_PROCESS_OR_LISTENER' };
  }
  if (processInfo !== null && (
      typeof processInfo !== 'object' || processInfo.pid !== pid ||
      !Number.isSafeInteger(processInfo.uid) || !Number.isSafeInteger(processInfo.ppid) ||
      typeof processInfo.command !== 'string')) {
    return { ok: false, reason: 'QA_PROCESS_METADATA_INVALID' };
  }
  if (mode === 'released') {
    if (processInfo !== null) return { ok: false, reason: 'QA_VITE_PID_STILL_EXISTS' };
    if (listeners.length > 0) return { ok: false, reason: 'QA_VITE_PORT_STILL_IN_USE' };
    return { ok: true, reason: 'PID_ABSENT_AND_PORT_FREE' };
  }
  if (processInfo === null || processInfo.uid !== uid ||
      !validPid(parentPid) || processInfo.ppid !== parentPid) {
    return { ok: false, reason: 'QA_VITE_OWNER_NOT_VERIFIED' };
  }
  const expected = `node ./node_modules/vite/bin/vite.js --config vite.account-delete-qa.config.mjs --host 127.0.0.1 --port ${port} --strictPort`;
  if (processInfo.command !== expected) {
    return { ok: false, reason: 'QA_VITE_COMMAND_NOT_EXACT' };
  }
  if (listeners.some(value => value !== pid)) {
    return { ok: false, reason: 'QA_VITE_FOREIGN_PORT_LISTENER' };
  }
  return { ok: true, reason: 'EXACT_USER_OWNED_VITE_PID' };
}

function runProbe(executable, args, emptyExit) {
  const output = spawnSync(executable, args, { encoding: 'utf8', timeout: 2500 });
  if (output.error || output.signal || ![0, emptyExit].includes(output.status)) {
    throw new Error('QA_LIFECYCLE_PROBE_UNAVAILABLE');
  }
  return { status: output.status, stdout: output.stdout, stderr: output.stderr };
}

export function inspectViteLifecycle(mode, pid, port, {
  uid = typeof process.getuid === 'function' ? process.getuid() : -1,
  parentPid,
  probe = runProbe,
} = {}) {
  if (!validPid(pid) || !validPort(port) || !['owned', 'released'].includes(mode)) {
    return { ok: false, reason: 'BAD_QA_PID_PORT_OR_MODE' };
  }
  let processInfo;
  let listeners;
  try {
    const ps = probe('/bin/ps', ['-p', String(pid), '-o', 'pid=', '-o', 'ppid=', '-o', 'uid=', '-o', 'command='], 1);
    if (ps.status === 1 && ps.stdout.trim() === '' && !(ps.stderr ?? '').trim()) {
      processInfo = null;
    } else {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([^\n]+)\s*$/.exec(ps.stdout);
      if (!match || ps.status !== 0) throw Error('QA_PROCESS_PS_UNCERTAIN');
      processInfo = { pid: Number(match[1]), ppid: Number(match[2]),
        uid: Number(match[3]), command: match[4] };
    }
    // macOS installs lsof in /usr/sbin; Ubuntu CI provides it in /usr/bin.
    // Use only trusted absolute paths: a failed probe must never mean a free port.
    const lsofBinary = process.platform === 'darwin' ? '/usr/sbin/lsof' : '/usr/bin/lsof';
    const open = probe(lsofBinary, ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], 1);
    if (open.status === 1 && open.stdout.trim() === '' && !(open.stderr ?? '').trim()) listeners = [];
    else if (open.status === 0) {
      const rows = open.stdout.trim().split(/\s+/).filter(Boolean);
      if (rows.some(row => !/^\d+$/.test(row))) throw Error('QA_PORT_LSOF_UNCERTAIN');
      listeners = rows.map(Number);
    } else throw Error('QA_PORT_LSOF_UNCERTAIN');
  } catch {
    return { ok: false, reason: 'QA_LIFECYCLE_PROBE_UNAVAILABLE' };
  }
  return verifyViteLifecycle({ mode, pid, port, uid, parentPid, processInfo, listeners });
}

if (process.argv[1]?.endsWith('/owned-vite-process.mjs')) {
  const [mode, rawPid, rawPort, rawParentPid] = process.argv.slice(2);
  const result = inspectViteLifecycle(mode, Number(rawPid), Number(rawPort),
    { parentPid: Number(rawParentPid) });
  if (!result.ok) {
    console.error(result.reason);
    process.exitCode = 2;
  }
}
