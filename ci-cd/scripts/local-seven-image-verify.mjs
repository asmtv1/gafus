/** Read-only confirmation of the seven CI-matrix OCI images built locally.
 * No pulls, Docker runs, cache cleanup, tags, writes, registry or deployment.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
const sha=execFileSync('git',['rev-parse','--short=7','HEAD'],{encoding:'utf8'}).trim();
const matrix=YAML.parse(readFileSync('.github/workflows/ci-cd.yml','utf8'))
  .jobs['build-images'].strategy.matrix.image;
const expected=['web','trainer-panel','admin-panel','api','worker','bull-board','prisma'];
assert.deepEqual(matrix.map(x=>x.name),expected,'RELEASE_MATRIX_SEVEN_NAMES_CHANGED');
const log='.gafus-refactoring/architecture-qa-20261103-local/qa/seven-images-local-status.tsv';
assert(existsSync(log),'LOCAL_SEQUENTIAL_BUILD_EVIDENCE_MISSING');
const rows=new Map(readFileSync(log,'utf8').trim().split('\n').map(x=>x.split('\t')));
for (const row of matrix) {
  assert.equal(rows.get('image-'+row.name),'0',`LOCAL_BUILD_NOT_GREEN:${row.name}`);
  assert(existsSync('ci-cd/docker/'+row.file),'RELEASE_DOCKERFILE_MISSING');
  const tag=`gafus-archqa-local:${row.name}-${sha}`;
  const raw=execFileSync('docker',['image','inspect','--format','{{json .}}',tag],
    {encoding:'utf8',timeout:12000,maxBuffer:512*1024});
  const object=JSON.parse(raw);
  assert.equal(object.Architecture,'amd64',`ARCH_NOT_AMD64:${tag}`);
  assert.equal(object.Os,'linux',`OS_NOT_LINUX:${tag}`);
  assert(/^sha256:[a-f0-9]{64}$/.test(object.Id),`IMAGE_DIGEST_MISSING:${tag}`);
  assert(object.Size>100_000,`TRUNCATED_IMAGE:${tag}`);
  console.log(`PASS ${row.name} linux/amd64 ${object.Id.slice(0,22)} size=${object.Size}`);
}
console.log(`PASS ALL_7_LOCAL_AMD64_IMAGE_BUILD_SEVEN_MATRIX sha=${sha} READ_ONLY_NO_PUSH_NO_DEPLOY`);
