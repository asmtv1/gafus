import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname,'../..');
const pg = createRequire(join(root,'packages/worker/package.json'))('pg');
const bcrypt = createRequire(join(root,'apps/api/package.json'))('bcryptjs');

export async function seedTrainingFixture(database){
 const project = process.env.GAFUS_QA_PROJECT || '';
 if (process.env.GAFUS_QA_ISOLATED !== '1' || !/^gafusqa[a-f0-9]{12}$/.test(project) ||
     database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' ||
     database.pathname !== '/'+project || database.username !== project.replace(/^gafusqa/,'qa') ||
     !/^[a-f0-9]{48}$/.test(database.password) || Number(database.port) < 1024) {
   throw Error('Training fixtures require a disposable Compose PostgreSQL role and database');
 }
 const db=new pg.Client({connectionString:database.toString()});await db.connect();try{
 const suffix=randomBytes(5).toString('hex');const password='E2ETest-'+randomBytes(9).toString('hex')+'!';
 const cuid=()=> 'c'+randomBytes(12).toString('hex');
 const ids={trainer:cuid(),learner:cuid(),step:cuid(),day:cuid(),stepOnDay:cuid(),course:cuid(),dayOnCourse:cuid()};
 const username='qa_learner_'+suffix,type='qa-training-'+suffix;
 const stepName='QA: тренировочный шаг '+suffix;
 const trainer='qa_trainer_'+suffix;
 const hash=await bcrypt.hash(password,8);
 await db.query('BEGIN');try{
  await db.query('INSERT INTO "User" (id,username,email,password,"passwordSetAt",role,"registrationPending") VALUES ($1,$2,$3,$4,NOW(),$5,false),($6,$7,$8,$9,NOW(),$10,false)',[ids.learner,username,username+'@example.test',hash,'USER',ids.trainer,trainer,trainer+'@example.test',hash,'TRAINER']);
  await db.query('INSERT INTO "Step" (id,title,description,type,"authorId") VALUES ($1,$2,$3,$4,$5)',[ids.step,stepName,'E2E only practice without external files','PRACTICE',ids.trainer]);
  await db.query('INSERT INTO "TrainingDay" (id,title,description,"authorId","updatedAt") VALUES ($1,$2,$3,$4,NOW())',[ids.day,'QA: день '+suffix,'Synthetic single step',ids.trainer]);
  await db.query('INSERT INTO "StepOnDay" (id,"dayId","stepId","order") VALUES ($1,$2,$3,0)',[ids.stepOnDay,ids.day,ids.step]);
  await db.query('INSERT INTO "Course" (id,name,type,description,"shortDesc",duration,"logoImg","trainingLevel","authorId","updatedAt","isPrivate","isPaid") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),false,false)',[ids.course,'QA: курс '+suffix,type,'Synthetic course, no external services','Local E2E','1 мин','', 'BEGINNER',ids.trainer]);
  await db.query('INSERT INTO "DayOnCourse" (id,"courseId","dayId","order") VALUES ($1,$2,$3,0)',[ids.dayOnCourse,ids.course,ids.day]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
 return {ids,username,password,stepName,type,trainer,createdAt:new Date().toISOString()};
}finally{await db.end();}}
