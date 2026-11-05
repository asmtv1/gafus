/** Restricted S3 delete/readback adapter for the existing GAFUS Worker.
 * No image conversion, Cloud.ru Container Job, or user-controlled S3 keys.
 */
import {S3Client,DeleteObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {isolatedNonprodS3Config} from '@gafus/cdn-upload/isolated-nonprod-s3';
import {assertFeedObjectKey} from './keys.js';
export interface FeedJanitorObjects {
  delete(key:string,signal?:AbortSignal):Promise<void>;
  exists(key:string,signal?:AbortSignal):Promise<boolean>;
}
export function createFeedJanitorObjects(env:Record<string,string|undefined>=process.env):FeedJanitorObjects {
  const local=isolatedNonprodS3Config('feed',env);
  if(!local && env.NODE_ENV!=='production')
    throw Error('FEED_JANITOR_REMOTE_S3_FROM_LOCAL_DENIED');
  const endpoint=local?.endpoint??env.FEED_S3_ENDPOINT??'';
  const bucket=local?.bucket??env.FEED_BUCKET??'';
  const accessKeyId=local?.accessKeyId??env.FEED_S3_ACCESS_KEY_ID??'';
  const secretAccessKey=local?.secretAccessKey??env.FEED_S3_SECRET_ACCESS_KEY??'';
  if(!bucket||!accessKeyId||!secretAccessKey||
     (!local&&(bucket!=='gafus-feed-private'||endpoint!=='https://s3.cloud.ru')))
    throw Error('FEED_JANITOR_UNSAFE_S3_CONFIG');
  const client=new S3Client({endpoint,region:local?'us-east-1':'ru-central-1',
    forcePathStyle:true,credentials:{accessKeyId,secretAccessKey},maxAttempts:2,
    requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
  return {
    async delete(key,signal){
      assertFeedObjectKey(key);
      await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:signal});
    },
    async exists(key,signal){
      assertFeedObjectKey(key);
      try{
        await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:signal});
        return true;
      }catch(e){
        if((e as {$metadata?:{httpStatusCode?:number}})?.$metadata?.httpStatusCode===404)
          return false;
        throw e;
      }
    },
  };
}
