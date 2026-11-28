// Exercises the real AWS CLI HTTP transport against a loopback protocol
// fixture. Does not assert Cloud.ru/Yandex compatibility or real provider IAM.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,writeFile,readFile,rm,realpath} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
const hasAws=spawnSync("aws",["--version"],{stdio:"ignore"}).status===0;
const xml=(content)=>'<?xml version="1.0" encoding="UTF-8"?>'+content;
test("actual AWS CLI list, conditional PUT/GET and byte readback on loopback HTTP",{skip:!hasAws},async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),"gafus-aws-http-")));
 const bytes=Buffer.from("actual transport bytes");
 const tag='"'+createHash("md5").update(bytes).digest("hex")+'"';
 let stored,putCount=0,gets=0,lists=0;
 const server=createServer(async(req,res)=>{
  try {
   const u=new URL(req.url,"http://127.0.0.1");
   assert.ok(req.headers.authorization?.includes("Credential=qa-access/"));
   if(u.searchParams.get("list-type")==="2"){
    lists++;
    assert.equal(u.pathname,"/qa-bucket");
    res.writeHead(200,{"content-type":"application/xml"});
    res.end(xml('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>qa-bucket</Name><Prefix></Prefix><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>'+(stored?'<Contents><Key>sample.bin</Key><LastModified>2026-11-27T12:00:00Z</LastModified><ETag>'+tag+'</ETag><Size>'+stored.length+'</Size><StorageClass>STANDARD</StorageClass></Contents>':'')+'</ListBucketResult>'));return;
   }
   assert.equal(u.pathname,"/qa-bucket/sample.bin");
   if(req.method==="PUT"){
    assert.equal(req.headers["if-none-match"],"*");
    if(stored){res.writeHead(412,{"content-type":"application/xml"});res.end(xml("<Error><Code>PreconditionFailed</Code></Error>"));return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    stored=Buffer.concat(chunks);putCount++;
    assert.equal(req.headers["content-type"],"application/octet-stream");
    res.writeHead(200,{ETag:tag});res.end();return;
   }
   if(req.method==="GET"){
    assert.equal(req.headers["if-match"],tag);gets++;
    res.writeHead(200,{"Content-Type":"application/octet-stream","Content-Length":stored.length,ETag:tag,"Last-Modified":"Fri, 27 Nov 2026 12:00:00 GMT"});res.end(stored);return;
   }
   throw Error("unexpected operation");
  }catch{res.writeHead(500);res.end("fixture assertion failed");}
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 try{
  const config=join(dir,"aws-config"),credentials=join(dir,"aws-credentials"),src=join(dir,"source"),dst=join(dir,"readback");
  await writeFile(config,"[profile qa]\nregion = us-east-1\ns3 =\n    addressing_style = path\n",{mode:0o600});
  await writeFile(credentials,"[qa]\naws_access_key_id = qa-access\naws_secret_access_key = qa-not-real-secret\n",{mode:0o600});
  await writeFile(src,bytes,{mode:0o600});
  const endpoint="http://127.0.0.1:"+server.address().port;
  const code='import {s3,list} from '+JSON.stringify(new URL("archive.mjs",import.meta.url).href)+';'+
   'const c='+JSON.stringify({endpoint,bucket:"qa-bucket",region:"us-east-1",profile:"qa"})+';'+
   'if(list(c).length) throw Error("not empty");'+
   'const put=["--bucket",c.bucket,"--key","sample.bin","--body",'+JSON.stringify(src)+',"--if-none-match","*","--content-type","application/octet-stream"];'+
   's3(c,"put-object",put);let rejected=false;try{s3(c,"put-object",put)}catch{rejected=true}if(!rejected)throw Error("conditional put failed");'+
   'const items=list(c);if(items.length!==1)throw Error("list mismatch");'+
   's3(c,"get-object",["--bucket",c.bucket,"--key","sample.bin","--if-match",items[0].etag,'+JSON.stringify(dst)+']);';
  const child=spawn(process.execPath,["--input-type=module","-e",code],{env:{...process.env,GAFUS_AWS_BIN:"aws",AWS_CONFIG_FILE:config,AWS_SHARED_CREDENTIALS_FILE:credentials,AWS_MAX_ATTEMPTS:"1",NO_PROXY:"127.0.0.1",no_proxy:"127.0.0.1"},stdio:["ignore","pipe","pipe"]});
  let stderr="";child.stderr.on("data",b=>stderr+=b);
  const timer=setTimeout(()=>child.kill(),45_000);
  const exit=await new Promise((r,j)=>{child.on("error",j);child.on("exit",r);});clearTimeout(timer);
  assert.equal(exit,0,stderr);assert.deepEqual(await readFile(dst),bytes);assert.equal(putCount,1);assert.equal(gets,1);assert.equal(lists,2);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
