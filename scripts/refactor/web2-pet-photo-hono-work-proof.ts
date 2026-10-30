/** Guarded WORK PostgreSQL 18 + physical project-local MinIO pet-photo proof.
 * Owner and foreign synthetic identities are unique per run. No existing
 * rows or objects are read by this test; cleanup is explicit and scoped.
 * No schema generation or migrations, no production credentials or endpoints.
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { prisma } from "@gafus/prisma";
import { createPet } from "../../packages/core/src/services/pets/petsService";
import { deleteFileFromCDN, getSignedDownloadUrl } from "../../packages/cdn-upload/src/uploadToCDN";
import { isolatedNonprodS3Config } from "../../packages/cdn-upload/src/isolatedNonprodS3";

export async function runWeb2HonoProof(){
  const root="/Users/asmtv1/Desktop/gafus-refactor";
  const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
  // Vitest from apps/api is permitted; direct standalone execution uses root.
  // Never accept a sibling project or a symlinked application directory.
  if(![root,root+"/apps/api"].includes(realpathSync(process.cwd()))||
    realpathSync(root)!==root||
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
  let stage="seed";
  // Retain the original registered-Hono/import error even if final own-only
  // resource cleanup later fails. The old generic finally error hid its cause.
  let primaryFailure: unknown;
  try {
    await prisma.user.createMany({data:[
      {id:owner,username:`web2_photo_${suffix}_a`,password:"isolated-only"},
      {id:foreign,username:`web2_photo_${suffix}_b`,password:"isolated-only"},
    ]});
    const pet=await createPet(owner,{
      name:petName,type:"DOG",breed:"Метис",birthDate:"2021-05-17",
    });
    petId=pet.id;
    // A registered Hono app, true JWT sessions and real Core/Prisma routes.
    // Nothing listens on an external network port: these are Request objects.
    stage="module-import";
    const [{app},{generateAccessToken}] = await Promise.all([
      import("../../apps/api/src/app"),import("@gafus/auth/jwt"),
    ]);
    stage="JWT-creation";
    const credentials=await Promise.all([
      generateAccessToken({id:owner,username:`web2_photo_${suffix}_a`,role:"USER"}),
      generateAccessToken({id:foreign,username:`web2_photo_${suffix}_b`,role:"USER"}),
    ]);
    const makeRequest=async (actor:0|1,route:string,method="GET",file?:File)=>{
      const form=new FormData();if(file)form.append("file",file);
      return app.request(new Request("http://127.0.0.1:3012/api/v1"+route,{
        method,headers:{Authorization:"Bearer "+credentials[actor],
          ...(file?{}:{Accept:"application/json"})},
        ...(file?{body:form}:{})
      }));
    };
    stage="owner-list";
    const ownList=await makeRequest(0,"/pets");
    console.log("WEB2_HONO_OWNER_LIST_HTTP_STATUS",ownList.status);
    if(ownList.status!==200 || !JSON.stringify(await ownList.json()).includes(petId))
      throw Error("WEB2_HONO_OWNER_LIST_FAILED");
    stage="guest-guard";
    const guest=await app.request("http://127.0.0.1:3012/api/v1/pets/"+petId);
    if(guest.status!==401)throw Error("WEB2_HONO_GUEST_NOT_DENIED");
    stage="foreign-read";
    const foreignRead=await makeRequest(1,"/pets/"+petId);
    if(foreignRead.status!==404)throw Error("WEB2_HONO_FOREIGN_READ_NOT_404");
    stage="foreign-write";
    const foreignPost=await makeRequest(1,"/pets/"+petId+"/photo","POST",picture());
    if(foreignPost.status!==404)throw Error("WEB2_HONO_FOREIGN_PHOTO_NOT_404");
    if((await prisma.pet.findUnique({where:{id:petId},select:{photoUrl:true}}))?.photoUrl)
      throw Error("WEB2_HONO_FOREIGN_MUTATED_SQL");
    stage="owner-photo-1";
    const first=await makeRequest(0,"/pets/"+petId+"/photo","POST",picture());
    if(first.status!==200)throw Error("WEB2_HONO_FIRST_PHOTO_POST_FAILED");
    const firstBody=await first.json() as {success?:boolean;data?:{photoUrl?:string}};
    const firstLink=firstBody.data?.photoUrl;
    if(!firstBody.success||!firstLink)throw Error("WEB2_HONO_FIRST_PHOTO_ACK_BAD");
    const marker=(await prisma.pet.findUnique({where:{id:petId},select:{photoUrl:true}}))?.photoUrl;
    if(!marker||!marker.startsWith("isodev-avatar:documents/uploads/users/"+owner+"/pets/"+petId+"/"))
      throw Error("WEB2_HONO_FIRST_PG_MARKER_BAD");
    touched.push(marker);
    const firstSigned=new URL(firstLink);
    if(firstSigned.origin!=="http://127.0.0.1:9000"||
      !firstSigned.searchParams.has("X-Amz-Signature")||
      !(await fetch(firstLink)).ok) throw Error("WEB2_HONO_FIRST_S3_SIGNED_GET_FAILED");
    stage="owner-photo-readback";
    const readback=await makeRequest(0,"/pets/"+petId);
    if(readback.status!==200)throw Error("WEB2_HONO_OWNER_DETAIL_NOT_200");
    const detail=await readback.json() as {data?:{photoUrl?:string}};
    if(!detail.data?.photoUrl||new URL(detail.data.photoUrl).pathname!==firstSigned.pathname)
      throw Error("WEB2_HONO_OWNER_READBACK_DIFFERENT_OBJECT");
    stage="owner-photo-2";
    const second=await makeRequest(0,"/pets/"+petId+"/photo","POST",picture());
    if(second.status!==200)throw Error("WEB2_HONO_SECOND_PHOTO_POST_FAILED");
    const secondBody=await second.json() as {data?:{photoUrl?:string}};
    const updated=(await prisma.pet.findUnique({where:{id:petId},select:{photoUrl:true}}))?.photoUrl;
    if(!updated||updated===marker||!secondBody.data?.photoUrl)
      throw Error("WEB2_HONO_SECOND_SQL_RESULT_BAD");
    touched.push(updated);
    if(new URL(secondBody.data.photoUrl).pathname===firstSigned.pathname)
      throw Error("WEB2_HONO_SECOND_S3_OBJECT_NOT_UNIQUE");
    if((await fetch(await getSignedDownloadUrl(marker,300))).status!==404)
      throw Error("WEB2_HONO_PREVIOUS_OBJECT_STILL_EXISTS");
    if((await fetch(secondBody.data.photoUrl)).status!==200)
      throw Error("WEB2_HONO_NEW_OBJECT_UNREADABLE");
    console.log("WEB2_HONO_JWT_OWNERS_PG18_PRIVATE_S3_RELOAD_OLD404_PASS");
    success=true;
  }catch(error){
    primaryFailure=error;
    console.error("WEB2_HONO_PROOF_FAILED_AT_"+stage);
    console.error("WEB2_HONO_PRIMARY_ERROR_TYPE_"+
      (error instanceof Error ? error.name : "NonError"));
    if(error instanceof Error&&error.message.startsWith("WEB2_"))
      console.error(error.message);
    throw error;
  }finally{
    // Include any own row committed after a lost API ACK, never a foreign key.
    try {
      if(petId){
        const live=(await prisma.pet.findFirst({
          where:{id:petId,ownerId:owner},select:{photoUrl:true},
        }))?.photoUrl;
        if(live?.startsWith("isodev-avatar:documents/uploads/users/"+owner+"/pets/"+petId+"/"))
          touched.push(live);
      }
    }catch{success=false;}
    // Strictly scoped to unique synthetic owner and physical markers.
    for(const marker of new Set(touched)){
      try{await deleteFileFromCDN(marker);}catch{success=false;}
    }
    try{
      if(petId)await prisma.pet.deleteMany({where:{id:petId,ownerId:owner}});
      await prisma.user.deleteMany({where:{id:{in:[owner,foreign]},username:{startsWith:"web2_photo_"}}});
    }catch{success=false;}
    await prisma.$disconnect();
    if(!success)throw new Error("WEB2_WORK_PG_S3_CLEANUP_OR_PROOF_FAILED",{
      cause:primaryFailure,
    });
    console.log("WEB2_HONO_WORK_PG18_SYNTHETIC_SQL_S3_CLEANUP_PASS");
  }
}
