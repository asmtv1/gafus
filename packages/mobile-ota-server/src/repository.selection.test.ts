import { describe, expect, it, vi } from "vitest";
import { otaRolloutIncludesInstallation } from "./rollout-policy";
import { mobileOtaManifestRepository, resolvePublishedOtaSelection } from "./repository";
vi.mock("./version-selection",()=>({selectVersionUpdate:vi.fn().mockResolvedValue(undefined)}));
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{$queryRaw:mocks.query}}));

const deploymentId="82882783-93be-4d66-9b5b-a79983af4720";
const installationId="7ba9c3db-d4b1-4cff-8d60-ce424d1706d5";
const key={appId:"gafus",environment:"production" as const,platform:"android" as const,
  runtimeVersion:"1.7.5",channel:"production",keyId:"gafus-production-20261115",
  nativeFingerprint:"b".repeat(64),installationId};
const rows=(percent:number)=>[
  {manifestBody:new Uint8Array([6]),signatureHeader:'signed',updateId:'active-id',revision:6,
    deploymentId,rolloutPercent:percent,releaseKind:'active' as const},
  {manifestBody:new Uint8Array([5]),signatureHeader:'signed',updateId:'previous-id',revision:5,
    deploymentId,rolloutPercent:percent,releaseKind:'previous' as const},
];

describe('mandatory gate and signed Expo manifest share one selected revision',()=>{
  it('selects active release for named testers and previous for ordinary users at rollout 0%',async()=>{
    mocks.query.mockResolvedValue(rows(0));
    expect((await resolvePublishedOtaSelection({...key,testerAllowed:false}))?.revision).toBe(5);
    const tester=await resolvePublishedOtaSelection({...key,testerAllowed:true});
    expect(tester?.revision).toBe(6);
    expect((await mobileOtaManifestRepository.findPublishedManifest({...key,testerAllowed:true}))?.updateId).toBe(tester?.updateId);
  });
  it('keeps rollout 1%, 10%, 50%, 100% aligned to the exact stable installation cohort',async()=>{
    for(const percent of [1,10,50,100]){
      mocks.query.mockResolvedValue(rows(percent));
      const shouldActive=otaRolloutIncludesInstallation(deploymentId,installationId,percent,false);
      const selected=await resolvePublishedOtaSelection({...key,testerAllowed:false});
      const manifest=await mobileOtaManifestRepository.findPublishedManifest({...key,testerAllowed:false});
      expect(selected?.releaseKind).toBe(shouldActive?'active':'previous');
      expect(manifest?.updateId).toBe(selected?.updateId);
      expect(selected?.revision).toBe(shouldActive?6:5);
    }
  });
  it('does not fabricate a mandatory release when there is no assigned READY manifest',async()=>{
    mocks.query.mockResolvedValue([]);
    expect(await resolvePublishedOtaSelection(key)).toBeNull();
  });
});
