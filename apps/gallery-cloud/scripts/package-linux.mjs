import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
process.chdir(cwd);
const native = 'scripts/linux-native';
// A separate npm lock isolates platform selection from the workspace pnpm lock.
execFileSync('npm', ['ci','--ignore-scripts','--omit=dev','--omit=optional','--force','--os=linux','--cpu=x64','--libc=glibc','--no-audit','--no-fund'], { cwd: native, stdio: 'inherit' });
const addon = `${native}/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node`;
const magic = await readFile(addon);
if (magic.subarray(0,4).toString('hex') !== '7f454c46' || magic.readUInt16LE(18) !== 62) throw Error('NOT_LINUX_X64_ELF');
await mkdir('artifacts', { recursive: true });
for (const entry of ['origin','process','maintenance','dispatch']) {
  const folder = `artifacts/${entry}`;
  await rm(folder, { recursive: true, force: true }); await mkdir(folder);
  await cp(`dist/${entry}/index.js`, `${folder}/index.js`);
  await cp(`dist/${entry}/package.json`, `${folder}/package.json`);
  if (entry === 'process' || entry === 'maintenance') await cp(`${native}/node_modules`, `${folder}/node_modules`, { recursive: true });
  // Stable order, metadata and timestamp make identical inputs yield identical zip bytes.
  execFileSync('python3', ['-c', `import pathlib,zipfile,sys
root=pathlib.Path(sys.argv[1]); out=root.with_suffix('.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file():
   i=zipfile.ZipInfo(p.relative_to(root).as_posix(),(1980,1,1,0,0,0)); i.external_attr=0o100644<<16; i.compress_type=zipfile.ZIP_DEFLATED; z.writestr(i,p.read_bytes(),compresslevel=9)
`, folder]);
  const zip = await readFile(`${folder}.zip`);
  console.log(`${entry}.zip ${zip.length} bytes sha256=${createHash('sha256').update(zip).digest('hex')}`);
}
await writeFile('artifacts/runtime.json', JSON.stringify({ runtime: 'nodejs22', os: 'linux', arch: 'x64', libc: 'glibc', sharp: '0.34.3', libvips: '1.2.0', nativeExecutableVerified: false, packagingHost: process.platform, note: 'ELF architecture inspected; Linux execution and YC cold-start remain external gates.' }, null, 2) + '\n');
