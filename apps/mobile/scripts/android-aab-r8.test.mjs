import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readAabR8Mapping, dexHasMappedClass } from './android-aab-r8.mjs';

test('streams mapping larger than old limit and keeps exact class declarations only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gafus-r8-'));
  try {
    const file = join(dir, 'sample.aab');
    const entry = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map';
    execFileSync('python3', ['-c', [
      'import sys, zipfile',
      'with zipfile.ZipFile(sys.argv[1], "w", compression=zipfile.ZIP_DEFLATED) as z:',
      '    with z.open(sys.argv[2], "w") as f:',
      '        f.write(b"example.First -> a.b:\\r\\n")',
      '        block = b"    1:1:void example():1:1 -> c\\n" * 32768',
      '        for _ in range(150): f.write(block)',
      '        f.write(b"example.Last -> x.y:\\n")',
      '    assert z.getinfo(sys.argv[2]).file_size > 128 * 1024 * 1024',
    ].join('\n'), file, entry]);
    const mapping = readAabR8Mapping([entry], file);
    assert.equal(mapping, 'example.First -> a.b:\nexample.Last -> x.y:\n');
    assert.equal(dexHasMappedClass([Buffer.from('Lx/y;')], mapping, /^example\.Last$/), true);
    assert.equal(dexHasMappedClass([Buffer.from('Lx/y;')], mapping, /^example\.First$/), false);
    assert.equal(readAabR8Mapping([], file), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
