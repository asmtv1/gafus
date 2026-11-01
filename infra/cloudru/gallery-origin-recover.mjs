/**
 * Explicitly scoped Cloud.ru Gallery Origin recovery.
 * Never edits an image/configuration, other Container Apps, Jobs, buckets or CDN.
 * Requires the existing production project credentials and manual dispatch.
 * Never logs tokens, provider payloads or secrets.
 */
const mode = process.argv[2];
if (!['--inspect', '--start', '--delete'].includes(mode) || process.argv.length !== 3)
  throw Error('GALLERY_ORIGIN_MODE_INVALID');
if (mode === '--start' && process.env.GAFUS_GALLERY_ORIGIN_START_CONFIRM !== 'START_SUSPENDED_GALLERY_ORIGIN_ONLY')
  throw Error('GALLERY_ORIGIN_MANUAL_CONFIRM_REQUIRED');
if (mode === '--delete' && process.env.GAFUS_GALLERY_ORIGIN_START_CONFIRM !== 'DELETE_SUSPENDED_GAFUS_GALLERY_ORIGIN')
  throw Error('GALLERY_ORIGIN_DELETE_CONFIRM_REQUIRED');
const project = process.env.CLOUDRU_PROJECT_ID;
if (project !== '4c590727-4133-475b-a4bc-564c90a9e686')
  throw Error('GALLERY_ORIGIN_PROJECT_MISMATCH');
const name = 'gafus-gallery-origin';
const keyId = process.env.CLOUDRU_KEY_ID;
const keySecret = process.env.CLOUDRU_KEY_SECRET;
if (!keyId || !keySecret) throw Error('GALLERY_ORIGIN_CREDENTIALS_MISSING');
const auth = await fetch('https://iam.api.cloud.ru/api/v1/auth/token', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ keyId, secret: keySecret }), signal: AbortSignal.timeout(15000),
});
if (!auth.ok) throw Error('GALLERY_ORIGIN_IAM_HTTP_' + auth.status);
const accessToken = (await auth.json()).access_token;
if (typeof accessToken !== 'string' || !accessToken) throw Error('GALLERY_ORIGIN_IAM_INVALID_TOKEN');
const url = `https://containers.api.cloud.ru/v1/containers/${name}?projectId=${project}`;
const request = async (method, target) => fetch(target, {
  method, headers: { Authorization: `Bearer ${accessToken}` },
  signal: AbortSignal.timeout(20000), redirect: 'error',
});
const status = async () => {
  const result = await request('GET', url);
  if (!result.ok) throw Error('GALLERY_ORIGIN_STATUS_HTTP_' + result.status);
  const data = await result.json();
  if (data.name !== name || data.projectId !== project || typeof data.status !== 'string')
    throw Error('GALLERY_ORIGIN_IDENTITY_OR_STATUS_MISMATCH');
  return data.status;
};
const initial = await status();
console.log(`GALLERY_ORIGIN_INITIAL_STATUS=${initial}`);
if (mode === '--inspect') process.exit(0);
if (mode === '--delete') {
  if (initial !== 'suspended') throw Error('GALLERY_ORIGIN_DELETE_REQUIRES_SUSPENDED_STATUS_' + initial);
  const deletion = await request('DELETE', `https://containers.api.cloud.ru/v2/containers/${name}?projectId=${project}`);
  if (!deletion.ok) throw Error('GALLERY_ORIGIN_DELETE_HTTP_' + deletion.status);
  await deletion.body?.cancel();
  console.log('GALLERY_ORIGIN_DELETE_REQUEST_ACCEPTED=PASS');
  for (let attempt=0;attempt<12;attempt++){
    await new Promise(resolve=>setTimeout(resolve,5000));
    const response=await request('GET',url);
    if (response.status===404){console.log('GALLERY_ORIGIN_DELETION_VERIFIED_404=PASS');process.exit(0)}
    if(!response.ok)throw Error('GALLERY_ORIGIN_DELETE_VERIFY_HTTP_'+response.status);
    const data=await response.json();
    if(data.name!==name||data.projectId!==project)throw Error('GALLERY_ORIGIN_DELETE_WRONG_RESOURCE');
    console.log('GALLERY_ORIGIN_DELETE_PENDING_STATUS='+String(data.status).slice(0,40));
  }
  throw Error('GALLERY_ORIGIN_DELETION_NOT_VERIFIED');
}
if (initial === 'running') {
  console.log('GALLERY_ORIGIN_ALREADY_RUNNING_NO_MUTATION=PASS');
  process.exit(0);
}
// Service/product/limit suspensions require a separate fix. Do not bypass
// a billing or product hold; do not try to repair rejected/error revisions.
if (initial !== 'suspended') throw Error('GALLERY_ORIGIN_NOT_OPERATOR_SUSPENDED_' + initial);
const started = await request('POST',
  `https://containers.api.cloud.ru/v2/containers/${name}:start?projectId=${project}`);
if (!started.ok) throw Error('GALLERY_ORIGIN_START_HTTP_' + started.status);
await started.body?.cancel();
console.log('GALLERY_ORIGIN_START_ACCEPTED=PASS');
for (let attempt = 0; attempt < 24; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 10000));
  const current = await status();
  console.log(`GALLERY_ORIGIN_POLL_STATUS=${current}`);
  if (current === 'running') {
    console.log('GALLERY_ORIGIN_RUNNING=PASS');
    process.exit(0);
  }
  if (['rejected', 'suspended_product', 'suspended', 'deleted'].includes(current))
    throw Error('GALLERY_ORIGIN_START_DID_NOT_RECOVER_' + current);
}
throw Error('GALLERY_ORIGIN_START_UNCONFIRMED');
