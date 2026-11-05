import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('global registration for headless GPS execution',()=>{
 it('registers task from actual Metro entrypoint before Expo Router and widgets',()=>{
  const entry=readFileSync(new URL('../../../widget-entry.ts',import.meta.url),'utf8');
  const gps=entry.indexOf('import "./src/features/walk/walkGpsTask";');
  const router=entry.indexOf('import "expo-router/entry";');
  expect(gps).toBeGreaterThan(-1);
  expect(router).toBeGreaterThan(gps);
  const task=readFileSync(new URL('./walkGpsTask.ts',import.meta.url),'utf8');
  expect(task).toContain('TaskManager.defineTask(DOG_WALK_GPS_TASK');
  expect(task).toContain('await persistGpsBatch(');
 });
});
