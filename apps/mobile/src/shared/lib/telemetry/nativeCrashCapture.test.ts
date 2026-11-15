import {describe,expect,it,vi} from 'vitest';
vi.mock('expo-constants',()=>({default:{expoConfig:{extra:{}}}}));
vi.mock('react-native',()=>({Platform:{OS:'ios'}}));
vi.mock('./mobileTelemetryClient',()=>({enqueueMobileTelemetryError:vi.fn()}));
import {nativeCrashCaptureOptions} from './nativeCrashCapture';

describe('SDK57 native crash dispatch configuration',()=>{
 it('captures every production iOS/Android native crash after JS boot',()=>{
  for(const platform of ['ios','android']){
   const config=nativeCrashCaptureOptions({platform,enabled:true,nativeEnvironment:'production'});
   expect(config).toEqual({environment:'production',sampleRate:1,
    dispatchingEnabled:true,dispatchInDebug:false});
  }
 });
 it('preview never goes to production environment',()=>{
  expect(nativeCrashCaptureOptions({platform:'ios',enabled:true,nativeEnvironment:'preview'}).environment).toBe('preview');
 });
 it('does not export from Expo Go/web or builds without telemetry consent',()=>{
  for(const platform of ['web','ios','android']){
   expect(nativeCrashCaptureOptions({platform,enabled:false}).dispatchingEnabled).toBe(false);
  }
  expect(nativeCrashCaptureOptions({platform:'web',enabled:true}).dispatchingEnabled).toBe(false);
 });
});
