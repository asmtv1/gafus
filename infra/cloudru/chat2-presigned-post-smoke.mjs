/** One owned synthetic upload; validates Cloud.ru S3 browser POST and removes object. */
import{readFileSync,lstatSync}from'node:fs';import{execFileSync}from'node:child_process';
import{randomUUID}from'node:crypto';import{request,Agent}from'node:https';
import{createRequire}from'node:module';
import{S3Client,HeadObjectCommand,DeleteObjectCommand}from'@aws-sdk/client-s3';
import{NodeHttpHandler}from'@smithy/node-http-handler';
import{chat2V2DirectUploadForm,chat2V2CheckOriginal}from'../../packages/cdn-upload/dist/index.js';
const require=createRequire(import.meta.url);const sharp=require('sharp');
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==root||execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()!==root||
 execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='vite'||
 process.env.GAFUS_CHAT2_POST_SMOKE!=='owned-object-only')throw Error('SCOPE');
const secretsPath='.local-pg-scratch/cloudru/refactor-api-credentials.json';
if(lstatSync(secretsPath).isSymbolicLink())throw Error('SYMLINK');const creds=JSON.parse(readFileSync(secretsPath,'utf8'));
if(creds.project_id!=='4c590727-4133-475b-a4bc-564c90a9e686')throw Error('PROJECT');
const source='chat2/qa_chat/qa_actor/'+randomUUID()+'/incoming/source.jpg';
const image=await sharp({create:{width:120,height:120,channels:3,background:'#668855'}}).jpeg().toBuffer();
const mime='image/jpeg';
process.env.CHAT2_V2_MEDIA_ENABLED='true';process.env.CHAT2_S3_ENDPOINT='https://s3.cloud.ru';
process.env.CHAT2_S3_BUCKET='gafus-chat-public';
process.env.CHAT2_S3_ACCESS_KEY_ID=creds.tenant_id+':'+creds.key_id;
process.env.CHAT2_S3_SECRET_ACCESS_KEY=creds.key_secret;
const ip=execFileSync('ipconfig',['getifaddr','en0'],{encoding:'utf8'}).trim();
const s3=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
 credentials:{accessKeyId:creds.tenant_id+':'+creds.key_id,secretAccessKey:creds.key_secret},
 requestHandler:new NodeHttpHandler({httpsAgent:new Agent({localAddress:ip,family:4}),connectionTimeout:5000,requestTimeout:8000})});
let status=0,verified=false,cleanup=false;
try{
 const form=await chat2V2DirectUploadForm(source,mime,image.length);
 const boundary='----GafusChat2V2Smoke'+randomUUID().replaceAll('-','');const buffers=[];
 for(const[name,value]of Object.entries(form.fields)){
  buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
 }
 buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.jpg"\r\nContent-Type: ${mime}\r\n\r\n`));
 buffers.push(image);buffers.push(Buffer.from(`\r\n--${boundary}--\r\n`));
 const body=Buffer.concat(buffers);const u=new URL(form.url);
 status=await new Promise((resolve,reject)=>{const req=request({hostname:u.hostname,path:u.pathname+u.search,
  method:'POST',localAddress:ip,family:4,timeout:12000,
  headers:{'content-type':'multipart/form-data; boundary='+boundary,'content-length':body.length,'origin':'http://localhost:5173'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.end(body)});
 if(![200,201,204].includes(status))throw Error('S3_POST_HTTP_'+status);
 const check=await s3.send(new HeadObjectCommand({Bucket:'gafus-chat-public',Key:source}));
 verified=check.ContentLength===image.length&&check.ContentType===mime;
 if(!verified)throw Error('S3_POST_MIME_SIZE');
}finally{
 try{await s3.send(new DeleteObjectCommand({Bucket:'gafus-chat-public',Key:source}));
 try{await s3.send(new HeadObjectCommand({Bucket:'gafus-chat-public',Key:source}));}
 catch(e){cleanup=e.$metadata?.httpStatusCode===404;}}catch{}
 s3.destroy();
 console.log(JSON.stringify({signedFormPostStatus:status,mimeAndSizeVerified:verified,deleted:cleanup}));
 if(!cleanup)process.exitCode=6;
}
