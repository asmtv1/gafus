/** Only test-owned staged assets; never permits a real-user prefix. */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { S3Client,ListObjectsV2Command,DeleteObjectCommand } from '@aws-sdk/client-s3';
const e=process.env;
if(e.GAFUS_SYNTHETIC_CLEAN_CONFIRM!=='exact-staging-owner' || e.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru')throw Error('NO_CLEANUP_AUTH');
const state=JSON.parse(await readFile(join(homedir(),'.codex/cloudru/gafus-media-core-staging/e2e-state.json'),'utf8'));
if(!/^stage_[a-f0-9]{22}$/.test(state.owner) || state.states.length!==2 ||
 state.states.some(x=>x.owner!==state.owner||!x.post.startsWith('stagepost_')))throw Error('TEST_IDENTITY_INVALID');
const client=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:e.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:e.CLOUDRU_S3_SECRET_ACCESS_KEY}});
const bucket='gafus-feed-private';const prefix=`posts/${state.owner}/`;
try{
 const list=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,MaxKeys:60}));
 const permitted=state.states.map(x=>`posts/${state.owner}/${x.post}/`);
 const keys=(list.Contents??[]).map(x=>x.Key);
 if(list.IsTruncated || keys.some(k=>!permitted.some(p=>k.startsWith(p))) || keys.length>50)throw Error('OUTSIDE_TEST_SCOPE');
 for(const Key of keys)await client.send(new DeleteObjectCommand({Bucket:bucket,Key}));
 const verify=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,MaxKeys:1}));
 if(verify.Contents?.length)throw Error('TEST_OBJECTS_REMAIN');
 console.log(JSON.stringify({testOnly:true,ownerTag:'synthetic',objectsDeleted:keys.length,noneRemain:true}));
}finally{client.destroy()}
