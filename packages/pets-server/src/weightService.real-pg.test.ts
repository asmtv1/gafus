/** Opt-in, disposable PostgreSQL verification of owner-locked pet weight writes.
 * Starts only inside scripts/qa/agent3-weight-isolated-pg.sh. No shared DB.
 */
import { randomUUID } from "node:crypto";
import { readFileSync,realpathSync } from "node:fs";
import { beforeAll,afterAll,afterEach,describe,expect,it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  getPetWeightHistory,addPetWeightEntry,deletePetWeightEntry,setPetTargetWeight,
} from "./weightService.js";

const root="/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/agent3-weight-accept-";
const databaseUrl=process.env.DATABASE_URL??"";
const owned=process.env.AG3_WEIGHT_OWNED_DIR??"";
const allowed=process.env.AG3_WEIGHT_REAL_PG==="1" &&
  /^postgresql:\/\/ag3_local@127\.0\.0\.1:5\d{4}\/agent3_weight_accept\?schema=public$/.test(databaseUrl) &&
  owned.startsWith(root);
const suite=allowed?describe:describe.skip;
const key="archqa_weight_"+randomUUID().slice(0,8);
let ownerId="",foreignId="",petId="";
async function makePet(weights:number[]) {
 const p=await prisma.pet.create({data:{
    ownerId,name:key+"-pet",type:"DOG",breed:"synthetic",
    birthDate:new Date("2020-01-01T00:00:00Z"),
    weightKg:weights.at(-1)??null,targetWeightKg:12.5,
 }});
 petId=p.id;
 const entries=[];
 for(let i=0;i<weights.length;i++){
  entries.push(await prisma.petWeightEntry.create({data:{
    petId:p.id,ownerId,weightKg:weights[i]!,
    measuredAt:new Date(Date.UTC(2025,0,i+1)),
  }}));
 }
 return entries;
}
async function verify(weight:number|null,length:number){
 const pet=await prisma.pet.findUnique({where:{id:petId}});
 const entries=await prisma.petWeightEntry.findMany({
  where:{petId,ownerId},orderBy:[{measuredAt:"asc"},{createdAt:"asc"}],
 });
 expect(pet?.weightKg).toBe(weight);
 expect(pet?.targetWeightKg).toBe(12.5);
 expect(entries).toHaveLength(length);
 return entries;
}
suite("AG3 PostgreSQL concurrent pet weight service, actual ownership and FOR NO KEY UPDATE",()=>{
 beforeAll(async()=>{
  if(!allowed)throw Error("PET_WEIGHT_NON_ISOLATED_DB_DENIED");
  const marker=readFileSync(owned+"/AG3_OWNED","utf8");
  if(marker!=="agent3-weight-disposable-only\n" || realpathSync(owned)!==owned)
    throw Error("PET_WEIGHT_NON_ISOLATED_DATA_DIRECTORY");
  const [row]=await prisma.$queryRawUnsafe<{directory:string;dbname:string;dbrole:string}[]>(
    "SELECT current_setting('data_directory') directory, current_database() dbname,current_user dbrole");
  if(!row || !row.directory.startsWith(owned+"/pg") ||
     row.dbname!=="agent3_weight_accept"||row.dbrole!=="ag3_local")
    throw Error("PET_WEIGHT_WRONG_POSTGRES_INSTANCE");
  const u=await prisma.user.create({data:{username:key+"-owner",
     password:"synthetic-no-login",registrationPending:false}});
  const v=await prisma.user.create({data:{username:key+"-foreign",
     password:"synthetic-no-login",registrationPending:false}});
  ownerId=u.id;foreignId=v.id;
 });
 afterEach(async()=>{
  if(petId)await prisma.pet.deleteMany({where:{id:petId,ownerId}});
  petId="";
 });
 afterAll(async()=>{
  if(ownerId)await prisma.user.deleteMany({where:{id:{in:[ownerId,foreignId]}}});
  await prisma.$disconnect();
 });
 it("concurrent different deletes are serialized; current weight equals last surviving measurement",async()=>{
  const rows=await makePet([10,11,12,13,14]);
  const outcomes=await Promise.all(rows.slice(1).map(x=>deletePetWeightEntry(petId,ownerId,x.id)));
  expect(outcomes).toEqual([true,true,true,true]);
  const left=await verify(10,1);
  expect(left[0]!.weightKg).toBe(10);
 });
 it("two concurrent deletes of SAME entry yield only one successful removal",async()=>{
  const [row]=await makePet([17]);
  const out=await Promise.all([
    deletePetWeightEntry(petId,ownerId,row!.id),
    deletePetWeightEntry(petId,ownerId,row!.id),
  ]);
  expect(out.sort()).toEqual([false,true]);
  await verify(null,0);
 });
 it("foreign owner cannot read, add, delete or set target, even with correct pet and entry ids",async()=>{
  const [row]=await makePet([15]);
  const before=await prisma.petWeightEntry.count({where:{petId}});
  expect(await getPetWeightHistory(petId,foreignId)).toBeNull();
  expect(await addPetWeightEntry(petId,foreignId,99,new Date())).toBeNull();
  expect(await deletePetWeightEntry(petId,foreignId,row!.id)).toBeNull();
  expect(await setPetTargetWeight(petId,foreignId,99)).toBe(false);
  expect(await prisma.petWeightEntry.count({where:{petId}})).toBe(before);
  await verify(15,1);
 });
 it("parallel ADD and DELETE preserve newest measurement and unchanged target",async()=>{
  const [old]=await makePet([16]);
  const [added,removed]=await Promise.all([
    addPetWeightEntry(petId,ownerId,19,new Date("2025-03-01T00:00:00Z")),
    deletePetWeightEntry(petId,ownerId,old!.id),
  ]);
  expect(added).not.toBeNull();
  expect(removed).toBe(true);
  await verify(19,1);
 });
});
