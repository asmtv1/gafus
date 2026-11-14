/** Disposable private PostgreSQL only; no real S3 delete or shared user rows. */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
const enabled=process.env.QUESTIONS_LEGACY_DELETE_ISOLATED_TEST==="1";
if(enabled){
  const url=new URL(process.env.DATABASE_URL??"http://invalid");
  if(url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||
     url.pathname!=="/gafus_refactor_legacy_outbox"||
     process.env.GAFUS_LOCAL_ISOLATED_API!=="1")
    throw Error("DENIED: Questions legacy photo test requires dedicated loopback DB");
}
vi.mock("@gafus/cdn-upload",()=>({
  parsePrivateMediaLocation:()=>null,
  deleteFileFromCDN:()=>{throw Error("DENIED: external provider in isolated test");},
}));
vi.mock("@gafus/media-server/question-v2-cleanup", () => ({
  scheduleQuestionsV2Cleanup: vi.fn(),
}));
vi.mock("./service.js",()=>({
  questionActor:async()=>({id:"synthetic"}),
  QuestionError:class QuestionError extends Error{
    constructor(public code:string,message:string,public status:number){super(message);}
  },
}));
import { deleteUnusedQuestionPhoto,processDueLegacyQuestionPhotoDeletions } from "./photos.js";
const suite=enabled?describe:describe.skip;
suite("Gafus Questions legacy delete: committed outbox vs SQL rollback, two Worker leases",()=>{
  let owner="";let outsider="";
  const photoIds:string[]=[];
  const createPhoto=async(name:string)=>{
    const id="qa-"+name+"-"+randomUUID();
    await prisma.questionPhoto.create({
      data:{id,ownerId:owner,url:"",storagePath:"questions/"+owner+"/"+randomUUID()+".jpg"},
    });
    photoIds.push(id);
    return id;
  };
  beforeAll(async()=>{
    owner=(await prisma.user.create({
      data:{username:"qa_question_owner_"+randomUUID(),password:randomUUID(),role:"USER"},
    })).id;
    outsider=(await prisma.user.create({
      data:{username:"qa_question_other_"+randomUUID(),password:randomUUID(),role:"USER"},
    })).id;
  });
  afterEach(async()=>{
    await prisma.questionLegacyPhotoDeletion.deleteMany({
      where:{id:{in:photoIds}},
    });
    await prisma.questionPhoto.deleteMany({where:{id:{in:photoIds}}});
    photoIds.length=0;
  });
  afterAll(async()=>{
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "qlegacy_qa_reject" ON "QuestionPhoto"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS qlegacy_qa_delete_guard()');
    if(owner)await prisma.user.deleteMany({where:{id:{in:[owner,outsider]}}});
    await prisma.$disconnect();
  });
  it("cannot commit deletion intent when photo row deletion rolls back",async()=>{
    const id=await createPhoto("rollback");
    await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION qlegacy_qa_delete_guard() RETURNS trigger AS $$ BEGIN IF OLD.id LIKE \'qa-rollback-%\' THEN RAISE EXCEPTION \'QA_FORCED_SQL_ROLLBACK\'; END IF; RETURN OLD; END; $$ LANGUAGE plpgsql');
    await prisma.$executeRawUnsafe('CREATE TRIGGER "qlegacy_qa_reject" BEFORE DELETE ON "QuestionPhoto" FOR EACH ROW EXECUTE FUNCTION qlegacy_qa_delete_guard()');
    try{
      await expect(deleteUnusedQuestionPhoto(owner,id)).rejects.toThrow();
      expect(await prisma.questionPhoto.findUnique({where:{id}})).not.toBeNull();
      expect(await prisma.questionLegacyPhotoDeletion.findUnique({where:{id}})).toBeNull();
    }finally{
      await prisma.$executeRawUnsafe('DROP TRIGGER "qlegacy_qa_reject" ON "QuestionPhoto"');
      await prisma.$executeRawUnsafe('DROP FUNCTION qlegacy_qa_delete_guard()');
    }
  });
  it("commit persists outbox and removes photo; concurrent Worker claims allow only one S3 effect",async()=>{
    const id=await createPhoto("commit");
    await expect(deleteUnusedQuestionPhoto(owner,id)).resolves.toEqual({id});
    expect(await prisma.questionPhoto.findUnique({where:{id}})).toBeNull();
    const intent=await prisma.questionLegacyPhotoDeletion.findUniqueOrThrow({where:{id}});
    expect(intent).toMatchObject({id,ownerId:owner,status:"PENDING",attempts:0});
    const effects:string[]=[];
    const fakeS3=async(path:string)=>{effects.push(path);};
    const [a,b]=await Promise.all([
      processDueLegacyQuestionPhotoDeletions({deleteObject:fakeS3}),
      processDueLegacyQuestionPhotoDeletions({deleteObject:fakeS3}),
    ]);
    expect(a.done+b.done).toBe(1);
    expect(effects).toEqual([intent.locator]);
    const completed=await prisma.questionLegacyPhotoDeletion.findUniqueOrThrow({where:{id}});
    expect(completed.status).toBe("DONE");
    expect(completed.attempts).toBe(1);
    expect(completed.ownerId).toBe("");
    expect(completed.locator).toBe("");
  });
  it("reclaims expired lease after remote delete but before SQL ACK, idempotent S3 replay",async()=>{
    const id=await createPhoto("replay");
    await deleteUnusedQuestionPhoto(owner,id);
    const paths:string[]=[];
    const first=await processDueLegacyQuestionPhotoDeletions({deleteObject:async path=>{
      paths.push(path);
      await prisma.questionLegacyPhotoDeletion.update({
        where:{id},data:{attemptToken:randomUUID(),leaseUntil:new Date(Date.now()-1000)},
      });
    }});
    expect(first).toMatchObject({claimed:1,done:0});
    expect((await prisma.questionLegacyPhotoDeletion.findUniqueOrThrow({where:{id}})).status)
      .toBe("PROCESSING");
    const second=await processDueLegacyQuestionPhotoDeletions({
      deleteObject:async path=>{paths.push(path);},
    });
    expect(second).toMatchObject({claimed:1,done:1});
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe(paths[1]);
    expect((await prisma.questionLegacyPhotoDeletion.findUniqueOrThrow({where:{id}})).status)
      .toBe("DONE");
  });
  it("committed delete intent survives owner-account cascade and can be retired later",async()=>{
    const abandoned=(await prisma.user.create({
      data:{username:"qa_question_removed_"+randomUUID(),password:randomUUID(),role:"USER"},
    })).id;
    const id="qa-orphan-"+randomUUID();
    photoIds.push(id);
    const locator="questions/"+abandoned+"/"+randomUUID()+".jpg";
    await prisma.questionPhoto.create({
      data:{id,ownerId:abandoned,url:"",storagePath:locator},
    });
    await deleteUnusedQuestionPhoto(abandoned,id);
    await prisma.user.delete({where:{id:abandoned}});
    const persisted=await prisma.questionLegacyPhotoDeletion.findUniqueOrThrow({where:{id}});
    expect(persisted).toMatchObject({ownerId:abandoned,locator,status:"PENDING"});
    const effects:string[]=[];
    const result=await processDueLegacyQuestionPhotoDeletions({
      deleteObject:async path=>{effects.push(path);},
    });
    expect(result.done).toBe(1);
    expect(effects).toEqual([locator]);
    expect((await prisma.questionLegacyPhotoDeletion.findUniqueOrThrow({where:{id}})).status)
      .toBe("DONE");
  });
  it("denies foreign actor without enqueuing or deleting the photo",async()=>{
    const id=await createPhoto("foreign");
    await expect(deleteUnusedQuestionPhoto(outsider,id)).rejects.toMatchObject({
      code:"PHOTO_FORBIDDEN",status:403,
    });
    expect(await prisma.questionPhoto.findUnique({where:{id}})).not.toBeNull();
    expect(await prisma.questionLegacyPhotoDeletion.findUnique({where:{id}})).toBeNull();
  });
});
