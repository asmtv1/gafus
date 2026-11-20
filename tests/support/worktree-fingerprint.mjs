/** Bind QA evidence to the *actual* dirty checkout, not merely to HEAD.
 * Git's status output is NUL-delimited, so quoted/renamed paths are unambiguous.
 * Files generated in ignored QA report directories are intentionally excluded.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

export function readWorktreeFingerprint(root) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw Error(`WORKTREE_STATUS_UNAVAILABLE: ${result.stderr || result.error}`);
  const hash = createHash('sha256');
  hash.update(result.stdout, 'utf8');
  const entries = result.stdout.split('\0');
  let changedFiles = 0;
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    if (!item) continue;
    if (item.length < 4 || item[2] !== ' ') throw Error('INVALID_GIT_PORCELAIN_ENTRY');
    const status = item.slice(0, 2);
    const file = item.slice(3);
    // Renames/copies have an additional NUL-delimited origin path, already
    // covered by the hashed status string; only the destination has contents.
    if (status.includes('R') || status.includes('C')) {
      if (!entries[++i]) throw Error('INCOMPLETE_GIT_RENAME_ENTRY');
    }
    if (isAbsolute(file) || file.split('/').includes('..')) throw Error('UNSAFE_WORKTREE_PATH');
    const abs = resolve(root, file);
    if (relative(root, abs).startsWith('..')) throw Error('WORKTREE_PATH_ESCAPES_ROOT');
    changedFiles++;
    let stat;
    try { stat = lstatSync(abs); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('\0MISSING\0');
      continue;
    }
    if (stat.isSymbolicLink()) {
      hash.update('\0LINK\0');
      hash.update(readlinkSync(abs));
    } else if (stat.isFile()) {
      hash.update('\0FILE\0');
      hash.update(readFileSync(abs));
    } else {
      // A changed gitlink/submodule is represented by its git status entry.
      hash.update('\0NONFILE\0');
    }
  }
  return { sha256: hash.digest('hex'), changedFiles };
}

export function sameWorktreeFingerprint(expected, actual) {
  return !!(expected?.sha256 && actual?.sha256 && expected.sha256 === actual.sha256 &&
    expected.changedFiles === actual.changedFiles);
}
