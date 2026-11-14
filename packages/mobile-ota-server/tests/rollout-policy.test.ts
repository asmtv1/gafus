import { describe, expect, it } from "vitest";
import { installationInOtaCohort, parseOtaInstallationId, validOtaPercent } from "../src/rollout-policy";
const deployment="775574e6-dd11-4ff5-b20a-86bc1a42e873";
const installation="7ba9c3db-d4b1-4cff-8d60-ce424d1706d5";
describe("deterministic Expo OTA rollout",()=>{
  it("parses native expo-extra-params SFV, rejects invalid/injected IDs",()=>{
    expect(parseOtaInstallationId(`gafus-installation-id="${installation}"`)).toBe(installation);
    expect(parseOtaInstallationId(`foo="hello", gafus-installation-id="${installation}", bar="world"`)).toBe(installation);
    for(const bad of [undefined,"x",`gafus-installation-id=abc`,
      `gafus-installation-id="../attack"`,
      `gafus-installation-id="${installation}", gafus-installation-id="${installation}"`,
      `gafus-installation-id="${installation}"\r\nInjected: true`])
      expect(parseOtaInstallationId(bad)).toBeNull();
  });
  it("is stable and monotonic as staged rollout increases",()=>{
    const values=[1,10,50,100].map(percent=>installationInOtaCohort(deployment,installation,percent));
    expect(values[3]).toBe(true);
    for(let i=0;i<3;i++) if(values[i]) expect(values[i+1]).toBe(true);
    for(let i=0;i<7;i++) expect(installationInOtaCohort(deployment,installation,10)).toBe(values[1]);
  });
  it("does not send unregistered installations an early preview",()=>{
    expect(installationInOtaCohort(deployment,null,1)).toBe(false);
    expect(installationInOtaCohort(deployment,"not-a-uuid",50)).toBe(false);
    expect(installationInOtaCohort(deployment,null,100)).toBe(true);
    for(const percent of [0,-1,5,99,101,NaN]) expect(validOtaPercent(percent)).toBe(false);
  });
  it("roughly assigns 1/10/50 percent of 10000 distinct persistent installations",()=>{
    const ids=Array.from({length:10000},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,"0")}`);
    const sizes=[1,10,50].map(p=>ids.filter(id=>installationInOtaCohort(deployment,id,p)).length);
    expect(sizes[0]).toBeGreaterThan(45);expect(sizes[0]).toBeLessThan(150);
    expect(sizes[1]).toBeGreaterThan(850);expect(sizes[1]).toBeLessThan(1150);
    expect(sizes[2]).toBeGreaterThan(4750);expect(sizes[2]).toBeLessThan(5250);
  });
});
