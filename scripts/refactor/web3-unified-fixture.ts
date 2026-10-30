/** WEB3-only synthetic WORK fixture. Never reads production secrets or another DB. */
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { prisma } from '@gafus/prisma';
import bcrypt from 'bcryptjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const lease=ROOT+'/.local-pg-scratch/web3-unified-private.json';
const cuid=()=> 'c'+randomBytes(12).toString('hex');
const u=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
if(process.cwd()!==ROOT+'/apps/api'||process.env.GAFUS_WEB3_REAL_BROWSER!=='1'||
 u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='55921'||
 u.pathname!=='/gafus_refactor_real_work_20261024'||u.username!=='gafus_refactor_local_real'||
 !u.password||u.search!=='?schema=public'||process.env.GAFUS_LOCAL_ISOLATED_API!=='1')
 throw Error('WEB3_FIXTURE_DENIED');
if(existsSync(lease)&&lstatSync(lease).isSymbolicLink())throw Error('WEB3_LEASE_SYMLINK_DENIED');
const cmd=process.argv[2];
if(!['create','cleanup','assert-clean'].includes(cmd))throw Error('WEB3_FIXTURE_CMD_DENIED');
type L={ users:{id:string;username:string;password:string}[];courseType:string;paidType:string;
  courseIds:string[];dayId:string;dayOnCourseId:string;stepIds:string[];stepOnDayIds:string[];
  articleSlugs:string[];articleIds:string[] };
const read=():L=>{
 if(!existsSync(lease))throw Error('WEB3_LEASE_MISSING');
 const v=JSON.parse(readFileSync(lease,'utf8')) as L;
 if(v.users?.length!==2||!v.users.every(x=>
   /^[a-f0-9-]{36}$/.test(x.id)&&
   x.username==='web3_parity_'+x.id.replaceAll('-','')&&
   x.password?.startsWith('Web3Synthetic!'))||
  !/^WEB3_PARITY_[0-9a-f]{8}$/.test(v.courseType)||
  !/^WEB3_PAID_[0-9a-f]{8}$/.test(v.paidType)||
  v.courseIds?.length!==2||v.stepIds?.length!==2||
  v.stepOnDayIds?.length!==2||v.articleIds?.length!==2||
  v.articleSlugs?.length!==2)throw Error('WEB3_LEASE_INVALID');
 return v;
};
async function identity(){
 const row=await prisma.$queryRaw<{db:string;actor:string}[]>`SELECT current_database() AS db,current_user AS actor`;
 if(row.length!==1||row[0].db!=='gafus_refactor_real_work_20261024'||
   row[0].actor!=='gafus_refactor_local_real') throw Error('WEB3_WRONG_DB');
}
async function cleanup(v:L){
 const ids=v.users.map(x=>x.id);
 // Never delete anything by LIKE or a global user search. Validate each ID.
 const users=await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,username:true}});
 for(const x of users)if(!v.users.some(y=>x.id===y.id&&x.username===y.username))
   throw Error('WEB3_OWNER_MISMATCH');
 const ownCourses=await prisma.course.findMany({where:{id:{in:v.courseIds}},select:{id:true,type:true}});
 for(const x of ownCourses)if(![v.courseType,v.paidType].includes(x.type))throw Error('WEB3_COURSE_MISMATCH');
 const ownArticles=await prisma.article.findMany({where:{id:{in:v.articleIds}},select:{id:true,slug:true}});
 for(const x of ownArticles)if(!v.articleSlugs.includes(x.slug))throw Error('WEB3_ARTICLE_MISMATCH');
 await prisma.gafusTargetAccess.deleteMany({where:{userId:{in:ids}}});
 await prisma.gafusTransaction.deleteMany({where:{userId:{in:ids}}});
 await prisma.gafusRewardEvent.deleteMany({where:{userId:{in:ids}}});
 await prisma.gafusWallet.deleteMany({where:{userId:{in:ids}}});
 await prisma.examResult.deleteMany({ where: { userStep: { userTraining: { userId: { in: ids } } } } });
 await prisma.userStep.deleteMany({ where: { userTraining: { userId: { in: ids } } } });
 await prisma.userTraining.deleteMany({where:{userId:{in:ids}}});
 await prisma.userCourse.deleteMany({where:{userId:{in:ids}}});
 await prisma.articleLike.deleteMany({where:{articleId:{in:v.articleIds}}});
 await prisma.articleViewer.deleteMany({where:{articleId:{in:v.articleIds}}});
 await prisma.articleGuestView.deleteMany({where:{articleId:{in:v.articleIds}}});
 await prisma.article.deleteMany({where:{id:{in:v.articleIds}}});
 await prisma.stepOnDay.deleteMany({where:{id:{in:v.stepOnDayIds}}});
 await prisma.dayOnCourse.deleteMany({where:{id:v.dayOnCourseId}});
 await prisma.step.deleteMany({where:{id:{in:v.stepIds}}});
 await prisma.trainingDay.deleteMany({where:{id:v.dayId}});
 await prisma.course.deleteMany({where:{id:{in:v.courseIds}}});
 await prisma.refreshToken.deleteMany({where:{userId:{in:ids}}});
 await prisma.user.deleteMany({where:{id:{in:ids}}});
 for(const [name,count] of [['users',await prisma.user.count({where:{id:{in:ids}}})],
    ['courses',await prisma.course.count({where:{id:{in:v.courseIds}}})],
    ['articles',await prisma.article.count({where:{id:{in:v.articleIds}}})]])
   if(count!==0)throw Error('WEB3_CLEANUP_INCOMPLETE_'+name);
 unlinkSync(lease);
 console.log('WEB3_FIXTURE_CLEANUP_OK synthetic owners/courses/articles');
}
async function run(){
 try{
  await identity();
  if(cmd==='create'){
   if(existsSync(lease))throw Error('WEB3_LEASE_ALREADY_EXISTS');
   const tag=randomUUID().replaceAll('-','').slice(0,8);
   const v:L={users:[0,1].map(()=>{const id=randomUUID();return {id,
    username:'web3_parity_'+id.replaceAll('-',''),password:'Web3Synthetic!'+randomUUID()};}),
    courseType:'WEB3_PARITY_'+tag,paidType:'WEB3_PAID_'+tag,
    courseIds:[cuid(),cuid()],dayId:cuid(),dayOnCourseId:cuid(),
    stepIds:[cuid(),cuid()],stepOnDayIds:[cuid(),cuid()],
    articleSlugs:['web3-public-'+tag,'web3-paid-'+tag],articleIds:[cuid(),cuid()]};
   writeFileSync(lease,JSON.stringify(v),{mode:0o600,flag:'wx'});
   for(let i=0;i<v.users.length;i++){
    const x=v.users[i];await prisma.user.create({data:{id:x.id,username:x.username,
      email:`${x.username}@example.test`,password:await bcrypt.hash(x.password,10),
      passwordSetAt:new Date('2026-01-01'),role:'USER',registrationPending:false,
      onboardingTourCompletedAt:new Date('2026-01-01'),
      profile:{create:{fullName:i?'WEB3 Тестовый Б':'WEB3 Тестовый А',city:'Самара'}}}});
   }
   const author=v.users[0].id;
   await prisma.course.create({data:{id:v.courseIds[0],name:'WEB3 Синтетический курс: команды',
     type:v.courseType,description:'Шаг за шагом учим собаку слушаться',equipment:'Поводок',
     trainingLevel:'BEGINNER',duration:'10 минут',logoImg:'',authorId:author}});
   await prisma.course.create({data:{id:v.courseIds[1],name:'WEB3 Синтетический курс: подписка',
     type:v.paidType,description:'Платная программа обучения',equipment:'Игрушка',
     trainingLevel:'BEGINNER',duration:'7 дней',logoImg:'',authorId:author,isPaid:true}});
   await prisma.trainingDay.create({data:{id:v.dayId,title:'День 1. Спокойная прогулка',
     description:'Учимся идти спокойно',authorId:author}});
   await prisma.dayOnCourse.create({data:{id:v.dayOnCourseId,courseId:v.courseIds[0],
     dayId:v.dayId,order:0}});
   await prisma.step.create({data:{id:v.stepIds[0],title:'Теория: команда рядом',
     description:'Попросите собаку идти рядом и наградите за спокойствие',
     type:'THEORY',durationSec:120,authorId:author}});
   await prisma.step.create({data:{id:v.stepIds[1],title:'Экзамен: послушание',
     description:'Ответьте на вопросы о тренировке',type:'EXAMINATION',authorId:author,
     hasTestQuestions:true,requiresWrittenFeedback:true,
     checklist:[{id:'web3_question_1',question:'Когда награждать собаку?',
       options:['Когда тянет','Когда идёт рядом'],correctAnswer:1}]}});
   await prisma.stepOnDay.createMany({data:v.stepOnDayIds.map((id,i)=>({id,
     dayId:v.dayId,stepId:v.stepIds[i],order:i}))});
   await prisma.userCourse.create({data:{userId:author,courseId:v.courseIds[0]}});
   await prisma.article.createMany({data:[
     {id:v.articleIds[0],slug:v.articleSlugs[0],authorId:author,title:'WEB3 Статья о прогулках',
      content:'Тренируйтесь короткими подходами',contentType:'TEXT',description:'Советы собаководам',visibility:'PUBLIC'},
     {id:v.articleIds[1],slug:v.articleSlugs[1],authorId:author,title:'WEB3 Платная статья',
      content:'Секретные упражнения для теста',contentType:'TEXT',description:'Курс для подписчиков',visibility:'PAID'},
   ]});
   console.log('WEB3_FIXTURE_CREATED SYNTHETIC course/day/two steps/articles; no existing records changed');
  }else if(cmd==='cleanup')await cleanup(read());
  else {const v=read();console.log('WEB3_FIXTURE_VALIDATED users='+v.users.length+' courses='+v.courseIds.length);}
 } finally{await prisma.$disconnect();}
}
void run().catch(e=>{console.error('WEB3_FIXTURE_ERROR',e instanceof Error?e.message:'unknown');process.exitCode=1;});
