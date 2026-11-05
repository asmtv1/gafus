import { describe, expect, it } from 'vitest';
import { checkChat2MobileVersion as gate } from './chat2-mobile-version-gate';
const config = { iosMinimum:'1.7.3',androidMinimum:'1.8.0' };
describe('proxy-only Chat2 rejects old Mobile before authorization or room token requests',()=>{
  it.each([
    ['ios','1.7.2'],['android','1.7.2'],['ios','0.0.1'],
    ['android','1.7.99'],['ios',undefined],['ios','future'],
  ])('requires published upgrade for old/malformed %s %s',(platform,version)=>{
    expect(gate({...config,platform,version})).toEqual({
      allowed:false,status:426,code:'CHAT2_MOBILE_UPDATE_REQUIRED',
    });
  });
  it.each([
    ['ios','1.7.3'],['ios','2.0.0'],['android','1.8.0'],['android','1.9.0'],
  ])('allows published new mobile version %s %s',(platform,version)=>{
    expect(gate({...config,platform,version})).toEqual({allowed:true});
  });
  it.each(['ios','android'])('fails closed without a minimum version for %s',platform=>{
    expect(gate({platform,version:'999.0.0'})).toEqual({
      allowed:false,status:503,code:'CHAT2_MOBILE_POLICY_UNAVAILABLE',
    });
  });
  it('Web and internal apps cannot rely on version headers as Chat2 authorization',()=>{
    expect(gate({platform:'web',version:'1.0.0'})).toEqual({allowed:true});
    expect(gate({platform:'unknown',version:'1.0.0'})).toEqual({allowed:true});
  });
});
