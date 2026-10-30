/** New original Hono JWT multi-DELETE on one synthetic pet: SQL weight invariants. */
import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const prefix='ag1_weight_parallel_'+randomBytes(6).toString('hex');
const base='http://127.0.0.1:3001/api/v1';
const own:{actors:{id:string;username:string}[],petId?:string}={actors:[]};
let phase='GUARDS';
function check(v:unknown,k:string):asserts v{if(!v)throw Error('WEIGHT_RACE_'+k);}
function obj(v:unknown):Record<string,unknown>{return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function pass(k:string){console.warn('AG1_PET_WEIGHT_ORIGINAL_HTTP_PARALLEL '+k+'=PASS');}
async function http(path:string,method='GET',token?:string,body?:unknown){const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});return{status:r.status,body:obj(await r.json())};}
async function actor(name:string){const password=randomBytes(24).toString('base64url');const u=await prisma.user.create({data:{username:prefix+'_'+name,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),role:'USER',registrationPending:false}});own.actors.push({id:u.id,username:u.username});const l=await http('/auth/login','POST',undefined,{username:u.username,password});check(l.status===200&&l.body.success,'STOCK_AUTH_LOGIN');const token=obj(l.body.data).accessToken;check(typeof token==='string','REAL_STOCK_JWT');return {id:u.id,token};}
async function cleanup(){if(own.petId&&own.actors[0]){const p=await prisma.pet.findUnique({where:{id:own.petId},select:{ownerId:true,name:true}});if(p?.ownerId===own.actors[0].id&&p.name.startsWith('AG1 parallel weight own'))await prisma.pet.delete({where:{id:own.petId}});}for(const a of own.actors){const r=await prisma.user.findUnique({where:{id:a.id},select:{username:true}});if(r?.username===a.username&&r.username.startsWith(prefix))await prisma.user.delete({where:{id:a.id}});}}
async function verify(petId:string,expected:number|null,ids:string[],target=12.5){const pet=await prisma.pet.findUnique({where:{id:petId},select:{weightKg:true,targetWeightKg:true}});check(pet?.weightKg===expected&&pet.targetWeightKg===target,'PET_SQL_CURRENT_WEIGHT_RECALCULATED');const rows=await prisma.petWeightEntry.findMany({where:{petId},orderBy:[{measuredAt:'asc'},{createdAt:'asc'}],select:{id:true}});check(rows.length===ids.length&&rows.every((r,i)=>r.id===ids[i]),'EXACT_HISTORY_SQL_NO_OTHER_ROWS');return rows;}
async function main(){
 check(process.env.AG1_PET_WEIGHT_PARALLEL_HTTP==='1'&&process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1','LOCAL_OPTIN');
 const u=new URL(process.env.DATABASE_URL??'');check((u.hostname==='127.0.0.1')&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','ONLY_WORK');
 check((await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(4000)})).status===200,'TRUE_HONO_READY');
 const usersBefore=await prisma.user.count();const petCountBefore=await prisma.pet.count();const entriesBefore=await prisma.petWeightEntry.count();
 try{
  phase='GRAPH';const a=await actor('owner'),b=await actor('foreign');const pet=await prisma.pet.create({data:{ownerId:a.id,name:'AG1 parallel weight own '+prefix,type:'DOG',breed:'Метис',birthDate:new Date('2021-01-01T00:00:00.000Z'),weightKg:13,targetWeightKg:12.5}});own.petId=pet.id;
  const entries=[];for(let i=0;i<4;i++)entries.push(await prisma.petWeightEntry.create({data:{petId:pet.id,ownerId:a.id,weightKg:10+i,measuredAt:new Date(Date.UTC(2025,0,i+1))}}));
  const path=(id:string)=>'/pets/'+pet.id+'/weight/'+id;
  const listPath='/pets/'+pet.id+'/weight';
  await verify(pet.id,13,entries.map(e=>e.id));
  pass('SYNTHETIC_ONE_OWNER_FOUR_CHRONOLOGICAL_ENTRIES_TRUE_JWT');
  phase='OWNER_DENIES';
  const denied=await Promise.all([http(path(entries[3].id),'DELETE',b.token),http(listPath,'GET',b.token),http(path('nonexistententry'),'DELETE',a.token)]);
  check(denied[0].status===404&&denied[1].status===404&&denied[2].status===404,'FOREIGN_AND_NONEXISTENT_404');
  await verify(pet.id,13,entries.map(e=>e.id));
  pass('FOREIGN_SIGNED_JWT_AND_MISSING_ENTRY_CANNOT_DELETE_OWNER_SQL');
  phase='TWO_DIFFERENT_PARALLEL_DELETES';
  const [one,two]=await Promise.all([http(path(entries[3].id),'DELETE',a.token),http(path(entries[2].id),'DELETE',a.token)]);
  console.warn('AG1_WEIGHT_CONCURRENT_DIFFERENT_ENTRY_HTTP_STATUSES='+[one.status,two.status].sort().join(','));
  check(one.status===200&&two.status===200,'PARALLEL_TWO_OWN_DELETE_HTTP200');
  await verify(pet.id,11,entries.slice(0,2).map(e=>e.id));
  const history=await http(listPath,'GET',a.token);
  check(history.status===200&&obj(history.body.data).currentWeightKg===11&&Array.isArray(obj(history.body.data).entries)&&(obj(history.body.data).entries as unknown[]).length===2,'ORIGINAL_HTTP_HISTORY_AFTER_PARALLEL_DELETE');
  pass('PARALLEL_DELETE_TWO_LATEST_RECOMPUTES_EXACT_LAST_SURVIVING_WEIGHT11_SQL_GET');
  phase='DUPLICATE_DELETE_RACE';
  const [dupA,dupB]=await Promise.all([http(path(entries[1].id),'DELETE',a.token),http(path(entries[1].id),'DELETE',a.token)]);
  console.warn('AG1_WEIGHT_CONCURRENT_SAME_ENTRY_HTTP_STATUSES='+[dupA.status,dupB.status].sort().join(','));
  check([dupA.status,dupB.status].sort().join(',')==='200,404','CONCURRENT_SAME_ENTRY_ONE_SUCCESS_ONE_NOT_FOUND');
  await verify(pet.id,10,[entries[0].id]);
  pass('PARALLEL_DUPLICATE_DELETE_IDEMPOTENT_200_404_AND_LATEST10');
  phase='DELETE_LAST';const last=await http(path(entries[0].id),'DELETE',a.token);check(last.status===200,'LAST_ENTRY_DELETE200');await verify(pet.id,null,[]);
  const loaded=await http(listPath,'GET',a.token);check(loaded.status===200&&obj(loaded.body.data).currentWeightKg===null,'EMPTY_HISTORY_HTTP_NULL_WEIGHT');
  const replay=await http(path(entries[0].id),'DELETE',a.token);check(replay.status===404,'LAST_DELETE_REPLAY404');await verify(pet.id,null,[]);
  pass('LAST_DELETE_NULL_WEIGHT_TARGET_PRESERVED_EMPTY_HISTORY_AND_REPLAY404');
  phase='CLEANUP';await cleanup();check(await prisma.user.count()===usersBefore&&await prisma.pet.count()===petCountBefore&&await prisma.petWeightEntry.count()===entriesBefore,'AGGREGATE_WORK_BASELINE_RESTORED');
  pass('EXACT_OWN_PET_ENTRY_USERS_CLEANUP_AND_WORK_COUNTS_RESTORED');
  pass('TRUE_ORIGINAL_HONO_PARALLEL_PET_WEIGHT_DELETE_SQL_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_PET_WEIGHT_RACE_FAILED_PHASE='+phase+' CAUSE='+(e instanceof Error&&e.message.startsWith('WEIGHT_RACE_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();});
