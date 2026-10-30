/** Isolated WEB1 synthetic account lease: local WORK DB only, fail closed. */
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@gafus/prisma';
import bcrypt from 'bcryptjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const lease=ROOT+'/.local-pg-scratch/web1-unified-private.json';
const u=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
if(process.cwd()!==ROOT+'/apps/api' || process.env.GAFUS_WEB1_REAL_BROWSER!=='1' ||
  u.protocol!=='postgresql:' || u.hostname!=='127.0.0.1' || u.port!=='55921' ||
  u.pathname!=='/gafus_refactor_real_work_20261024' || u.username!=='gafus_refactor_local_real' ||
  !u.password || u.search!=='?schema=public' ||
  process.env.GAFUS_LOCAL_ISOLATED_API!=='1') throw Error('WEB1_FIXTURE_WRONG_DB_DENIED');
if(existsSync(lease)&&lstatSync(lease).isSymbolicLink()) throw Error('WEB1_FIXTURE_SYMLINK_DENIED');
const cmd=process.argv[2];
if(!['create','cleanup','assert-clean','first-login','public-identity'].includes(cmd)) throw Error('WEB1_FIXTURE_CMD_DENIED');
type Lease={users:{id:string;username:string;password:string}[]};
// Reserved deterministic keys belong ONLY to the verified second synthetic
// account. Existing WEB1 ordinary fixtures never create these records.
const publicIdentityKeys=(foreignId:string)=>{
 const suffix=foreignId.replaceAll('-', '');
 return {visiblePet:`web1pet_${suffix}_visible`,
   hiddenPet:`web1pet_${suffix}_hidden`,diploma:`web1diploma_${suffix}`};
};
const read=():Lease=>{
 if(!existsSync(lease)||lstatSync(lease).isSymbolicLink())throw Error('WEB1_FIXTURE_LEASE_MISSING');
 const data=JSON.parse(readFileSync(lease,'utf8')) as Lease;
 if(!Array.isArray(data.users)||data.users.length!==2||!data.users.every(x=>
  /^[0-9a-f-]{36}$/.test(x.id)&&x.username==='web1_unified_'+x.id.replaceAll('-','')&&
  typeof x.password==='string'&&x.password.length>12))throw Error('WEB1_FIXTURE_LEASE_INVALID');
 return data;
};
async function main(){
try{
 const actual=await prisma.$queryRaw<{db:string;actor:string}[]>`SELECT current_database() AS db,current_user AS actor`;
 if(actual.length!==1||actual[0]?.db!=='gafus_refactor_real_work_20261024'||
  actual[0]?.actor!=='gafus_refactor_local_real')throw Error('WEB1_FIXTURE_DB_IDENTITY');
 if(cmd==='create'){
  if(existsSync(lease))throw Error('WEB1_FIXTURE_LEASE_ALREADY_EXISTS_CLEANUP_FIRST');
  const data:Lease={users:[0,1].map(()=>{
   const id=randomUUID();return {id,username:'web1_unified_'+id.replaceAll('-',''),
    password:'Web1Synthetic!'+randomUUID()};
  })};
  // Write lease before the first SQL mutation so a crashed child can be cleaned.
  writeFileSync(lease,JSON.stringify(data),{mode:0o600,flag:'wx'});
  for(const [index,item] of data.users.entries()){
   await prisma.user.create({data:{id:item.id,username:item.username,
    email:`${item.username}@example.test`,password:await bcrypt.hash(item.password,10),
    passwordSetAt:new Date('2026-01-01'),role:'USER',registrationPending:false,
    onboardingTourCompletedAt:new Date('2026-01-01'),
    profile:{create:{fullName:index===0?'WEB1 Собаковод А':'WEB1 Собаковод Б',
      city:'Самара',about:'Синтетический профиль для изолированного теста'}}}});
  }
  console.log('WEB1_FIXTURE_CREATED owner and foreign synthetic accounts');
 }else{
  const data=read();
  const ids=data.users.map(x=>x.id);
  const users=await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,username:true}});
  for(const user of users){
   if(!data.users.some(x=>x.id===user.id&&x.username===user.username))
    throw Error('WEB1_FIXTURE_OWNERSHIP_CHANGED_DENIED');
  }
  if(cmd==='public-identity'){
   if(users.length!==2)throw Error('WEB1_PUBLIC_IDENTITY_USERS_MISSING');
   const foreign=data.users[1];const keys=publicIdentityKeys(foreign.id);
   if(await prisma.pet.count({where:{ownerId:foreign.id}})!==0 ||
      await prisma.diploma.count({where:{userId:foreign.id}})!==0)
     throw Error('WEB1_PUBLIC_IDENTITY_PREEXISTING_RELATIONS_DENIED');
   const promoted=await prisma.user.updateMany({where:{id:foreign.id,
     username:foreign.username,role:'USER'},data:{role:'TRAINER'}});
   if(promoted.count!==1)throw Error('WEB1_PUBLIC_IDENTITY_ROLE_GUARD_DENIED');
   const contacts=await prisma.userProfile.updateMany({where:{userId:foreign.id},
     data:{telegram:'web1_synth_trainer',instagram:'web1_synth_trainer',
       website:'https://example.test/profile'}});
   if(contacts.count!==1)throw Error('WEB1_PUBLIC_IDENTITY_CONTACTS_GUARD_DENIED');
   await prisma.pet.create({data:{id:keys.visiblePet,ownerId:foreign.id,
     name:'WEB1 Тестовый кот',type:'CAT',breed:'Сфинкс',showInProfile:true,
     birthDate:new Date('2022-01-03T12:00:00.000Z'),photoUrl:null}});
   await prisma.pet.create({data:{id:keys.hiddenPet,ownerId:foreign.id,
     name:'WEB1_HIDDEN_PRIVATE_PET',type:'DOG',breed:'Личная информация',
     showInProfile:false,birthDate:new Date('2021-01-03T12:00:00.000Z')}});
   await prisma.diploma.create({data:{id:keys.diploma,userId:foreign.id,
     title:'WEB1 Тестовый диплом',issuedBy:'Изолированная школа',
     issuedAt:new Date('2025-05-08T12:00:00.000Z'),url:null}});
   console.log('WEB1_PUBLIC_IDENTITY_FIXTURE_CREATED trainer pet_visible=1 pet_hidden=1 diploma=1');
  }else if(cmd==='first-login'){
   const owner=data.users[0];
   const changed=await prisma.user.updateMany({where:{id:owner.id,username:owner.username},
    data:{onboardingTourCompletedAt:null}});
   if(changed.count!==1)throw Error('WEB1_FIRST_LOGIN_OWNER_IDENTITY_DENIED');
   const row=await prisma.user.findUnique({where:{id:owner.id},
    select:{onboardingTourCompletedAt:true}});
   if(row?.onboardingTourCompletedAt!==null)throw Error('WEB1_FIRST_LOGIN_NOT_PERSISTED');
   console.log('WEB1_FIRST_LOGIN_SQL_READY owner-only');
  } else if(cmd==='cleanup'){
   const foreign=data.users[1];const keys=publicIdentityKeys(foreign.id);
   await prisma.diploma.deleteMany({where:{id:keys.diploma,userId:foreign.id}});
   await prisma.pet.deleteMany({where:{ownerId:foreign.id,
     id:{in:[keys.visiblePet,keys.hiddenPet]}}});
   if(await prisma.pet.count({where:{id:{in:[keys.visiblePet,keys.hiddenPet]}}})!==0 ||
      await prisma.diploma.count({where:{id:keys.diploma}})!==0)
     throw Error('WEB1_PUBLIC_IDENTITY_CLEANUP_NOT_CONFIRMED');
   await prisma.refreshToken.deleteMany({where:{userId:{in:ids}}});
   await prisma.reminderMutationReceipt.deleteMany({where:{ownerUserId:{in:ids}}});
   await prisma.reminder.deleteMany({where:{userId:{in:ids},type:'training'}});
   await prisma.user.deleteMany({where:{id:{in:ids}}});
   const remaining=await prisma.user.count({where:{id:{in:ids}}});
   if(remaining!==0)throw Error('WEB1_FIXTURE_CLEANUP_NOT_CONFIRMED');
   const {unlinkSync}=await import('node:fs');unlinkSync(lease);
   console.log('WEB1_FIXTURE_CLEANUP_OK deleted=2');
  } else console.log('WEB1_FIXTURE_AUTHORIZED_USERS='+users.length);
 }
}finally{await prisma.$disconnect();}
}
void main().catch(error=>{console.error("WEB1_FIXTURE_ERROR",error instanceof Error?error.message:"unknown");process.exitCode=1;});
