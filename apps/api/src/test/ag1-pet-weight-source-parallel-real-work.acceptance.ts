/** AG1 new Core SOURCE concurrent pet weights on REAL isolated WORK PG18. */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {prisma} from '@gafus/prisma';
import {deletePetWeightEntry,addPetWeightEntry} from '../../../../packages/core/src/services/pets/petWeightService';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_weight_core_race_'+randomBytes(5).toString('hex');
let owner:string|undefined,petId:string|undefined,phase='GUARD';
function check(v:unknown,k:string):asserts v{if(!v)throw Error('PET_CORE_CONCURRENT_'+k);}
function pass(s:string){console.warn('AG1_PET_WEIGHT_SOURCE_REAL_WORK '+s+'=PASS');}
async function state(id:string,weight:number|null,length:number){const p=await prisma.pet.findUnique({where:{id},select:{weightKg:true,targetWeightKg:true}});const list=await prisma.petWeightEntry.findMany({where:{petId:id},select:{weightKg:true},orderBy:[{measuredAt:'asc'},{createdAt:'asc'}]});check(p?.weightKg===weight&&p.targetWeightKg===12.5&&list.length===length,'SQL_WEIGHT_MATCHES_SURVIVING_LATEST_ENTRY_AND_TARGET');return list;}
async function cleanup(){if(petId&&owner){const pet=await prisma.pet.findUnique({where:{id:petId},select:{ownerId:true,name:true}});if(pet?.ownerId===owner&&pet.name.startsWith('AG1 real work pet weight race'))await prisma.pet.delete({where:{id:petId}});}if(owner){const a=await prisma.user.findUnique({where:{id:owner},select:{username:true}});if(a?.username.startsWith(prefix))await prisma.user.delete({where:{id:owner}});}}
async function main(){
 check(process.env.AG1_PET_WEIGHT_SOURCE_RACE==='1'&&process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1','EXPLICIT_LOCAL_OPTIN');
 check(realpathSync(root)===root&&realpathSync(process.cwd())===root+'/apps/api','EXACT_ROOT');
 const u=new URL(process.env.DATABASE_URL??'');check(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','RESTRICTED_WORK');
 const usersBefore=await prisma.user.count(),petsBefore=await prisma.pet.count(),weightsBefore=await prisma.petWeightEntry.count();
 try{
  phase='OWN_GRAPH';const user=await prisma.user.create({data:{username:prefix,password:'synthetic-only-no-login',role:'USER',registrationPending:false}});owner=user.id;
  const pet=await prisma.pet.create({data:{ownerId:user.id,name:'AG1 real work pet weight race '+prefix,type:'DOG',breed:'Метис',birthDate:new Date('2021-01-01T00:00:00Z'),weightKg:13,targetWeightKg:12.5}});petId=pet.id;
  const entries=[];for(let i=0;i<4;i++)entries.push(await prisma.petWeightEntry.create({data:{petId:pet.id,ownerId:user.id,weightKg:10+i,measuredAt:new Date(Date.UTC(2025,0,i+1))}}));
  await state(pet.id,13,4);pass('EXACT_OWN_USER_PET_FOUR_CHRONOLOGICAL_ENTRY_GRAPH');
  phase='FOREIGN_AND_STALE';const foreign=await deletePetWeightEntry(pet.id,'synthetic-foreign-id',entries[3].id);const missing=await deletePetWeightEntry(pet.id,user.id,'unknown-entry-id');check(foreign===null&&missing===false,'OWNER_AND_MISSING_NO_WRITE');await state(pet.id,13,4);pass('FOREIGN_OWNER_DENIED_MISSING_ENTRY_NO_MUTATION');
  phase='TWO_PARALLEL_DIFFERENT_DELETES';const outcome=await Promise.all([deletePetWeightEntry(pet.id,user.id,entries[3].id),deletePetWeightEntry(pet.id,user.id,entries[2].id)]);check(outcome[0]===true&&outcome[1]===true,'BOTH_PARALLEL_SUCCEEDED');const left=await state(pet.id,11,2);check(left[0].weightKg===10&&left[1].weightKg===11,'BOTH_REMOVED_AND_WEIGHT11');pass('SIMULTANEOUS_TWO_LATEST_DELETES_SERIALIZE_TO_CURRENT_WEIGHT11');
  phase='SAME_ENTRY_RACE';const twice=await Promise.all([deletePetWeightEntry(pet.id,user.id,entries[1].id),deletePetWeightEntry(pet.id,user.id,entries[1].id)]);check(twice.filter(v=>v===true).length===1&&twice.filter(v=>v===false).length===1,'ONE_TRUE_ONE_FALSE');await state(pet.id,10,1);pass('PARALLEL_SAME_ENTRY_ONE_DELETE_ONE_ALREADY_MISSING');
  phase='PARALLEL_ADD_AND_DELETE';const fresh=await Promise.all([addPetWeightEntry(pet.id,user.id,16,new Date('2025-02-01T00:00:00Z')),deletePetWeightEntry(pet.id,user.id,entries[0].id)]);check(Boolean(fresh[0])&&fresh[1]===true,'ONE_ADD_ONE_DELETE');const leftFresh=await state(pet.id,16,1);check(leftFresh[0].weightKg===16,'NEWEST_ADD_PRESERVED');pass('SIMULTANEOUS_NEW_ENTRY_AND_LAST_DELETE_NO_LOST_RECALCULATION');
  phase='LAST_REMOVE';const final=await deletePetWeightEntry(pet.id,user.id,(fresh[0] as {id:string}).id);check(final===true,'DELETE_LAST_TRUE');await state(pet.id,null,0);pass('DELETE_LAST_NULL_CURRENT_WEIGHT_TARGET_UNCHANGED');
  phase='CLEANUP';await cleanup();check(await prisma.user.count()===usersBefore&&await prisma.pet.count()===petsBefore&&await prisma.petWeightEntry.count()===weightsBefore,'WORK_AGGREGATE_COUNTS_RESTORED');pass('EXACT_OWN_CLEANUP_RESTORED_WORK_COUNTS');pass('SOURCE_OWNER_LOCK_REAL_WORK_PARALLEL_WEIGHT_DELETE_AND_ADD_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_WEIGHT_CORE_REAL_WORK_FAILED_PHASE='+phase+' CAUSE='+(e instanceof Error&&e.message.startsWith('PET_CORE_CONCURRENT_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();});
