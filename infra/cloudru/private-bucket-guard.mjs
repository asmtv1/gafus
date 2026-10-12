/** Explicit private-bucket guard. No ACL, CORS, policy, or user object mutation. */
import {S3Client, GetBucketAclCommand, GetBucketPolicyCommand,
  GetPublicAccessBlockCommand, PutPublicAccessBlockCommand} from '@aws-sdk/client-s3';
const buckets=['gafus-gallery-private','gafus-feed-private','gafus-documents-private'];
const desired={BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true};
async function main(){
  const mode=process.argv[2]??'--plan';
  if(!['--plan','--apply'].includes(mode))throw Error('INVALID_MODE');
  if(process.env.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru')throw Error('INVALID_ENDPOINT');
  if(!process.env.CLOUDRU_S3_ACCESS_KEY_ID||!process.env.CLOUDRU_S3_SECRET_ACCESS_KEY)throw Error('CREDENTIALS_MISSING');
  if(mode==='--apply'&&process.env.CLOUDRU_PRIVACY_GUARD_CONFIRM!=='three-private-buckets')throw Error('APPLY_NOT_AUTHORIZED');
  const client=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:process.env.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:process.env.CLOUDRU_S3_SECRET_ACCESS_KEY}});
  const decisions=[];
  try{
    for(const bucket of buckets){
      const acl=await client.send(new GetBucketAclCommand({Bucket:bucket}));
      if((acl.Grants??[]).some(g=>/AllUsers|AuthenticatedUsers/.test(g.Grantee?.URI??'')))throw Error(`PUBLIC_ACL_${bucket}`);
      try{await client.send(new GetBucketPolicyCommand({Bucket:bucket}));throw Error(`EXISTING_POLICY_REQUIRES_REVIEW_${bucket}`)}
      catch(e){if(e?.message?.startsWith('EXISTING_POLICY'))throw e;
        if(e?.$metadata?.httpStatusCode!==404||e.name!=='NoSuchBucketPolicy')throw e;}
      let current=null;
      try{current=(await client.send(new GetPublicAccessBlockCommand({Bucket:bucket}))).PublicAccessBlockConfiguration??null;}
      catch(e){if(e?.$metadata?.httpStatusCode!==404||e.name!=='NoSuchPublicAccessBlockConfiguration')throw e;}
      const compliant=current&&Object.keys(desired).every(key=>current[key]===true);
      decisions.push({bucket,alreadyProtected:!!compliant,requiresUpdate:!compliant});
    }
    if(mode==='--apply')for(const d of decisions){
      if(d.requiresUpdate){await client.send(new PutPublicAccessBlockCommand({Bucket:d.bucket,PublicAccessBlockConfiguration:desired}));}
      const verified=(await client.send(new GetPublicAccessBlockCommand({Bucket:d.bucket}))).PublicAccessBlockConfiguration??{};
      if(!Object.keys(desired).every(key=>verified[key]===true))throw Error(`PRIVATE_GUARD_VERIFY_FAILED_${d.bucket}`);
      console.log(JSON.stringify({bucket:d.bucket,allPublicAccessBlocked:true,changed:d.requiresUpdate}));
    }else for(const d of decisions)console.log(JSON.stringify({mode:'plan',...d}));
  }finally{client.destroy()}
}
await main();
