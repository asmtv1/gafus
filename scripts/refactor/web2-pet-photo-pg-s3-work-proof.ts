/** Guarded WORK PostgreSQL 18 + physical project-local MinIO pet-photo proof.
 * Owner and foreign synthetic identities are unique per run. No existing
 * rows or objects are read by this test; cleanup is explicit and scoped.
 * No schema generation or migrations, no production credentials or endpoints.
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { prisma } from "@gafus/prisma";
import { createPet, updatePetPhoto } from "../../packages/core/src/services/pets/petsService";
import { deleteFileFromCDN, getSignedDownloadUrl } from "../../packages/cdn-upload/src/uploadToCDN";
import { isolatedNonprodS3Config } from "../../packages/cdn-upload/src/isolatedNonprodS3";

async function run(){
  const root="/Users/asmtv1/Desktop/gafus-refactor";
  const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
  if(realpathSync(process.cwd())!==root||realpathSync(root)!==root||
    git("rev-parse","--show-toplevel")!==root||git("branch","--show-current")!=="vite")
    throw Error("WEB2_WORK_ROOT_DENIED");
  const raw=process.env.DATABASE_URL;
  if(!raw)throw Error("WEB2_WORK_DB_REQUIRED");
  const db=new URL(raw);
  if(db.protocol!=="postgresql:"||db.hostname!=="127.0.0.1"||db.port!=="55921"||
    db.pathname!=="/gafus_refactor_real_work_20261024"||
    db.username!=="gafus_refactor_local_real"||!db.password||
    db.searchParams.toString()!=="schema=public")throw Error("WEB2_WORK_DB_IDENTITY_DENIED");
  if(process.env.NODE_ENV!=="development"||process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||
    process.env.GAFUS_ISOLATED_NONPROD_S3!=="enabled"||
    process.env.GAFUS_ISOLATED_S3_ENDPOINT!=="http://127.0.0.1:9000"||
    process.env.GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET!=="gafus-refactor-documents-test"||
    !isolatedNonprodS3Config("documents")) throw Error("WEB2_WORK_S3_IDENTITY_DENIED");
  // Restricted WORK login deliberately cannot read data_directory. Validate
  // version/listener, fixed role and DB, after the strictly scoped URL gate.
  const identity=await prisma.$queryRaw<Array<{
    database:string;version:string;port:number;name:string
  }>>`
    SELECT current_database() AS database,
           current_setting('server_version_num') AS version,
           inet_server_port() AS port, current_user AS name`;
  if(identity.length!==1||identity[0]?.database!=="gafus_refactor_real_work_20261024"||
    identity[0].name!=="gafus_refactor_local_real"||
    identity[0].version!=="180004"||identity[0].port!==55921)
    throw Error("WEB2_WORK_SQL_RUNTIME_IDENTITY_DENIED");
  const owner=randomUUID(), foreign=randomUUID();
  const petName="WEB2 photo fixture";
  const suffix=randomUUID().replaceAll("-","").slice(0,22);
  const touched:string[]=[];
  let petId:string|undefined;
  const picture=()=>new File([Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7NwAAAABJRU5ErkJggg==",
    "base64")],"photo.png",{type:"image/png"});
  let success=false;
  try {
    await prisma.user.createMany({data:[
      {id:owner,username:`web2_photo_${suffix}_a`,password:"isolated-only"},
      {id:foreign,username:`web2_photo_${suffix}_b`,password:"isolated-only"},
    ]});
    const pet=await createPet(owner,{
      name:petName,type:"DOG",breed:"Метис",birthDate:"2021-05-17",
    });
    petId=pet.id;
    let foreignDenied=false;
    try{await updatePetPhoto(petId,foreign,picture());}
    catch(error){foreignDenied=error instanceof Error&&
      error.message.includes("не принадлежит пользователю");}
    if(!foreignDenied)throw Error("WEB2_FOREIGN_OWNER_NOT_DENIED");
    if((await prisma.pet.findUnique({where:{id:petId},select:{photoUrl:true}}))?.photoUrl)
      throw Error("WEB2_FOREIGN_MUTATED_SQL");
    const one=await updatePetPhoto(petId,owner,picture());touched.push(one);
    if(!one.startsWith("isodev-avatar:documents/uploads/users/"+owner+"/pets/"+petId+"/"))
      throw Error("WEB2_FIRST_STORAGE_PATH_DENIED");
    if((await prisma.pet.findUnique({where:{id:petId},select:{photoUrl:true}}))?.photoUrl!==one)
      throw Error("WEB2_FIRST_PG_READBACK_FAILED");
    const signed=await getSignedDownloadUrl(one,300);
    const content=await fetch(signed,{cache:"no-store"});
    if(content.status!==200||!(await content.arrayBuffer()).byteLength)
      throw Error("WEB2_FIRST_SIGNED_GET_FAILED");
    const two=await updatePetPhoto(petId,owner,picture());touched.push(two);
    if(two===one||(await prisma.pet.findUnique({where:{id:petId},select:{photoUrl:true}}))?.photoUrl!==two)
      throw Error("WEB2_REPLACEMENT_PG_READBACK_FAILED");
    if((await fetch(await getSignedDownloadUrl(one,300),{cache:"no-store"})).status!==404)
      throw Error("WEB2_PREVIOUS_PHOTO_NOT_PHYSICALLY_REMOVED");
    if((await fetch(await getSignedDownloadUrl(two,300),{cache:"no-store"})).status!==200)
      throw Error("WEB2_REPLACEMENT_SIGNED_GET_FAILED");
    console.log("WEB2_WORK_PG18_OWNER_FOREIGN_REPLACEMENT_S3_SIGNED_GET_OLD404_PASS");
    success=true;
  }finally{
    // Every delete is strictly scoped to the two freshly generated synthetic
    // UUID owners and only provider markers returned by this very run.
    for(const marker of touched){
      try{await deleteFileFromCDN(marker);}catch{success=false;}
    }
    try{
      if(petId)await prisma.pet.deleteMany({where:{id:petId,ownerId:owner}});
      await prisma.user.deleteMany({where:{id:{in:[owner,foreign]},username:{startsWith:"web2_photo_"}}});
    }catch{success=false;}
    await prisma.$disconnect();
    if(!success)throw Error("WEB2_WORK_PG_S3_CLEANUP_OR_PROOF_FAILED");
    console.log("WEB2_WORK_PG18_SYNTHETIC_SQL_S3_CLEANUP_PASS");
  }
}
run().catch(()=>{console.error("WEB2_WORK_PG18_S3_PROOF_FAILED");process.exitCode=1;});
