import {test} from "node:test";
import assert from "node:assert/strict";
import {validateQuestionsJobConfig, validateQuestionsJobResource,
  verifyQuestionsJobLive} from "./questions-job-live-readiness.mjs";

const project="7f7f7f7f-8888-9999-aaaa-bbbbbbbbbbbb";
const image="gafus.cr.cloud.ru/gafus-questions-worker@sha256:"+"a".repeat(64);
const env={
  QUESTIONS_PUBLIC_S3_ENABLED:"true",QUESTIONS_CLOUD_JOB_ENABLED:"true",
  QUESTIONS_PROCESSOR_READY:"true",CLOUDRU_PROJECT_ID:project,
  CLOUDRU_KEY_ID:"key",CLOUDRU_KEY_SECRET:"secret",
};
const job={
  name:"gafus-questions-photo",projectId:project,status:"ACTIVE",
  configuration:{privileged:false},
  template:{timeout:240,maxRetries:3,containers:[{
    name:"gafus-questions-photo",image,resources:{cpu:"0.5",memory:"1024Mi"},
    env:["QUESTIONS_JOB_ENABLED","QUESTIONS_PUBLIC_S3_BUCKET",
      "CLOUDRU_S3_ENDPOINT","CLOUDRU_S3_ACCESS_KEY_ID",
      "CLOUDRU_S3_SECRET_ACCESS_KEY"].map(name=>({name,value:"private"})),
  }]},
};
test("Questions production cutover requires all three flags and IAM",()=>{
  assert.doesNotThrow(()=>validateQuestionsJobConfig(env));
  assert.equal(validateQuestionsJobConfig({...env,QUESTIONS_PUBLIC_S3_ENABLED:"false"}),false);
  for(const name of ["QUESTIONS_CLOUD_JOB_ENABLED",
    "QUESTIONS_PROCESSOR_READY","CLOUDRU_PROJECT_ID","CLOUDRU_KEY_ID","CLOUDRU_KEY_SECRET"]){
    assert.throws(()=>validateQuestionsJobConfig({...env,[name]:
      ["CLOUDRU_KEY_ID","CLOUDRU_KEY_SECRET"].includes(name)?"":"false"}));
  }
});
test("accept only existing isolated production Job, correct digest and bounded resources",()=>{
  assert.equal(validateQuestionsJobResource(job,project),image);
  for(const broken of [
    {...job,name:"gafus-gallery-process"},
    {...job,projectId:"other"},
    {...job,status:"FAILED"},
    {...job,configuration:{privileged:true}},
    {...job,template:{...job.template,timeout:650}},
    {...job,template:{...job.template,containers:[{...job.template.containers[0],image:"gafus-feed-worker@sha256:"+"a".repeat(64)}]}},
    {...job,template:{...job.template,containers:[{...job.template.containers[0],env:[]}]}},
  ]) assert.throws(()=>validateQuestionsJobResource(broken,project),
    /QUESTIONS_JOB_LIVE_RESOURCE_MISMATCH/);
});
test("reads IAM+Job only and blocks a failed GET before deployment",async()=>{
  const calls=[];
  const transport=async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>calls.length===1?{access_token:"token"}:job};
  };
  assert.deepEqual(await verifyQuestionsJobLive({...env,QUESTIONS_PUBLIC_S3_ENABLED:"false"},transport),
    {name:"gafus-questions-photo",ready:false});
  assert.equal(calls.length,0);
  assert.deepEqual(await verifyQuestionsJobLive(env,transport),
    {name:"gafus-questions-photo",image,ready:true});
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.method,"POST");
  assert.equal(calls[1].options.method,undefined);
  assert.match(calls[1].url,/\/v2\/jobs\/gafus-questions-photo\?projectId=/);
  await assert.rejects(verifyQuestionsJobLive(env,async()=>({ok:false,status:403})),
    /QUESTIONS_JOB_IAM_HTTP_403/);
});
