import {afterEach,describe,expect,it,vi} from 'vitest';
import {isIsolatedRefactorBrowserOrigin} from './cors';
const alt='http://127.0.0.1:5373';
const normal='http://127.0.0.1:5173';
function env(){
 vi.stubEnv('NODE_ENV','development');
 vi.stubEnv('GAFUS_LOCAL_ISOLATED_API','1');
 vi.stubEnv('GAFUS_LOCAL_BROWSER_AUTH','1');
 vi.stubEnv('API_HOST','127.0.0.1');
}
afterEach(()=>vi.unstubAllEnvs());
describe('WEB1 isolated alternate loopback origin is opt-in and never production',()=>{
 it('allows legacy normal port without alt flag',()=>{
  env();vi.stubEnv('API_PORT','3001');
  expect(isIsolatedRefactorBrowserOrigin(normal)).toBe(true);
  expect(isIsolatedRefactorBrowserOrigin(alt)).toBe(false);
 });
 it('allows exact alternate loopback pair only with explicit isolated flag',()=>{
  env();vi.stubEnv('API_PORT','3301');
  expect(isIsolatedRefactorBrowserOrigin(alt)).toBe(false);
  vi.stubEnv('GAFUS_WEB1_ALT_HONO','1');
  expect(isIsolatedRefactorBrowserOrigin(alt)).toBe(true);
  expect(isIsolatedRefactorBrowserOrigin(normal)).toBe(false);
  expect(isIsolatedRefactorBrowserOrigin('http://localhost:5373')).toBe(false);
  expect(isIsolatedRefactorBrowserOrigin('http://127.0.0.1:5374')).toBe(false);
 });
 it('refuses alternate port in production or without isolated flags',()=>{
  env();vi.stubEnv('API_PORT','3301');vi.stubEnv('GAFUS_WEB1_ALT_HONO','1');
  vi.stubEnv('NODE_ENV','production');
  expect(isIsolatedRefactorBrowserOrigin(alt)).toBe(false);
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('GAFUS_LOCAL_ISOLATED_API','0');
  expect(isIsolatedRefactorBrowserOrigin(alt)).toBe(false);
  vi.stubEnv('GAFUS_LOCAL_ISOLATED_API','1');vi.stubEnv('API_HOST','0.0.0.0');
  expect(isIsolatedRefactorBrowserOrigin(alt)).toBe(false);
 });
});
