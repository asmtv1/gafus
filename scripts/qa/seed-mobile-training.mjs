#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { seedTrainingFixture } from '../../tests/support/training-fixture.mjs';

const root = resolve(import.meta.dirname,'../..');
const destination = process.argv[2] && resolve(root,process.argv[2]);
const base = join(root,'.qa/testing');
if (!destination?.startsWith(base+'/') || !destination.endsWith('.json')) {
  throw Error('Write the synthetic fixture to a new .qa/testing/*.json file');
}
const database = new URL(process.env.DATABASE_URL);
mkdirSync(dirname(destination),{recursive:true,mode:0o700});
const { ids, username, password, type, stepName } = await seedTrainingFixture(database);
writeFileSync(destination,JSON.stringify({
  username,password,databaseUrl:database.href, userId:ids.learner, dayOnCourseId:ids.dayOnCourse,
  stepOnDayId:ids.stepOnDay, courseType:type, trainingLink:'gafus:///trainings/'+type+'/'+ids.dayOnCourseId,
  stepTitle:stepName,
},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('Synthetic training fixture written to '+destination);
