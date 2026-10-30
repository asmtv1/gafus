/** Real PostgreSQL WORK owner-pet deletion without any S3 media.
 * Uses only unique synthetic users/pet and always cleans up.
 */
import {randomUUID} from "node:crypto";
import {realpathSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {prisma} from "@gafus/prisma";
import {createPet,deletePet} from "../../packages/core/src/services/pets/petsService";
async function run(){
  const root="/Users/asmtv1/Desktop/gafus-refactor";
  const git=(...a:string[])=>execFileSync("git",["-C",root,...a],{encoding:"utf8"}).trim();
  if(realpathSync(process.cwd())!==root||git("rev-parse","--show-toplevel")!==root||
     git("branch","--show-current")!=="vite")throw Error("WEB2_DELETE_WORK_ROOT_DENIED");
  const value=process.env.DATABASE_URL;
  if(!value)throw Error("WEB2_DELETE_WORK_DB_REQUIRED");
  const url=new URL(value);
  if(url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||
    url.port!=="55921"||url.username!=="gafus_refactor_local_real"||
    url.pathname!=="/gafus_refactor_real_work_20261024"||
    url.searchParams.toString()!=="schema=public"||!url.password||
    process.env.NODE_ENV!=="development")throw Error("WEB2_DELETE_WORK_WRONG_DB");
  const who=await prisma.$queryRaw<Array<{db:string;role:string;port:number}>>`
    SELECT current_database() AS db,current_user AS role,inet_server_port() AS port`;
  if(who[0]?.db!=="gafus_refactor_real_work_20261024"||
    who[0].role!=="gafus_refactor_local_real"||who[0].port!==55921)
    throw Error("WEB2_DELETE_WORK_IDENTITY_DENIED");
  const owner=randomUUID(),intruder=randomUUID();
  const key=randomUUID().replaceAll("-","").slice(0,20);
  let petId:string|undefined,complete=false;
  try{
    await prisma.user.createMany({data:[
      {id:owner,username:`web2_delete_${key}_owner`,password:"synthetic"},
      {id:intruder,username:`web2_delete_${key}_other`,password:"synthetic"},
    ]});
    petId=(await createPet(owner,{name:"WEB2 synthetic pet",type:"DOG",
      breed:"Метис",birthDate:"2020-01-01"})).id;
    if(await deletePet(petId,intruder))throw Error("WEB2_DELETE_FOREIGN_ACCEPTED");
    if(!(await prisma.pet.findFirst({where:{id:petId,ownerId:owner}})))
      throw Error("WEB2_DELETE_FOREIGN_MUTATED");
    if(!await deletePet(petId,owner))throw Error("WEB2_DELETE_OWNER_DENIED");
    if(await prisma.pet.findUnique({where:{id:petId}}))throw Error("WEB2_DELETE_ROW_REMAINS");
    if(await deletePet(petId,owner))throw Error("WEB2_DELETE_REPEAT_SUCCEEDED");
    console.log("WEB2_PG18_PET_OWNER_FOREIGN_DELETE_RELOAD_REPEATED_PASS");
    complete=true;
  }finally{
    try {
      if(petId)await prisma.pet.deleteMany({where:{id:petId,ownerId:owner}});
      await prisma.user.deleteMany({where:{id:{in:[owner,intruder]},username:{startsWith:"web2_delete_"}}});
    }catch{complete=false;}
    await prisma.$disconnect();
    if(!complete)throw Error("WEB2_DELETE_WORK_PROOF_OR_CLEANUP_FAILED");
    console.log("WEB2_PG18_PET_DELETE_SYNTHETIC_CLEANUP_PASS");
  }
}
run().catch(()=>{console.error("WEB2_DELETE_PG18_WORK_PROOF_FAILED");process.exitCode=1;});
