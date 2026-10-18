/** Gallery one-push cutover: read-only audit of private ready WebP metadata. */
import {GetPublicAccessBlockCommand,GetBucketVersioningCommand,S3Client} from '@aws-sdk/client-s3';
import {migrateGalleryMetadata} from './gallery-cache-metadata-migration.mjs';
if(process.env.GALLERY_CDN_REDIRECT_ENABLED!=='true')console.log('GALLERY_METADATA_AUDIT_DISABLED');
else{
  const e=process.env;
  if(!e.GALLERY_S3_ACCESS_KEY_ID||!e.GALLERY_S3_SECRET_ACCESS_KEY)throw Error('GALLERY_S3_CREDENTIALS_MISSING');
  const b='gafus-gallery-private',s=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,
    credentials:{accessKeyId:e.GALLERY_S3_ACCESS_KEY_ID,secretAccessKey:e.GALLERY_S3_SECRET_ACCESS_KEY}});
  try{
    const [p,v]=await Promise.all([s.send(new GetPublicAccessBlockCommand({Bucket:b}),{abortSignal:AbortSignal.timeout(12000)}),
      s.send(new GetBucketVersioningCommand({Bucket:b}),{abortSignal:AbortSignal.timeout(12000)})]);
    if(Object.values(p.PublicAccessBlockConfiguration??{}).filter(Boolean).length!==4||v.Status==='Enabled')throw Error('GALLERY_S3_NOT_PRIVATE');
    const c=await migrateGalleryMetadata(s,{apply:false,limit:10000});
    if(!c.finals||c.pending||c.rejected)throw Error(`GALLERY_CACHE_METADATA_NOT_READY_${c.pending}_${c.rejected}`);
    console.log('GALLERY_METADATA_RELEASE_PASS',JSON.stringify({finalWebp:c.finals,cache:'max-age=180,s-maxage=600',privateBucket:true}));
  }finally{s.destroy()}
}
