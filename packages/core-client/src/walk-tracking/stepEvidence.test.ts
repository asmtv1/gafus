import {describe,it,expect} from "vitest";
import {stepEvidence,summarizeDistanceCoverage,type StepScope,type StepInterval} from "./stepEvidence";
const scope:StepScope={ownerId:"a",walkId:"w",epoch:"e",clockGeneration:"boot",source:"android-counter"};
const interval=(from:number,to:number,delta:number,identity:string,overrides:Partial<StepInterval>={}):StepInterval=>({
  ...scope,from,to,delta,identity,complete:true,...overrides,
});
describe("exact step evidence (experimental)",()=>{
  it("distinguishes zero steps from missing/denied/reset data",()=>{
    expect(stepEvidence(scope,0,10,[interval(0,10,0,"a")])).toEqual({kind:"no-steps",steps:0});
    expect(stepEvidence(scope,0,10,[]).kind).toBe("unknown");
    expect(stepEvidence(scope,0,10,[interval(0,10,0,"a",{complete:false})]).kind).toBe("unknown");
    expect(stepEvidence(scope,0,10,[interval(0,10,0,"a",{clockGeneration:"other"})]).kind).toBe("unknown");
  });
  it("never prorates or counts partial, overlapping, duplicated or foreign snapshots twice",()=>{
    const a=interval(0,5,4,"a"),b=interval(5,10,6,"b");
    expect(stepEvidence(scope,0,10,[a,b,a,{...a,ownerId:"other"}])).toEqual({kind:"steps-detected",steps:10});
    expect(stepEvidence(scope,2,10,[a,b]).kind).toBe("unknown");
    expect(stepEvidence(scope,0,10,[a,interval(4,10,6,"c")]).kind).toBe("unknown");
    expect(stepEvidence(scope,0,10,[a,{...a,delta:7},b]).kind).toBe("unknown");
  });
  it("only estimates fully covered gaps and never adds steps to GPS-covered meters",()=>{
    const steps={kind:"steps-detected" as const,steps:20};
    const gps={from:0,to:10,gpsMeters:100,steps,displacementCorroborated:true};
    const gap={from:10,to:20,gpsMeters:null,steps,displacementCorroborated:true};
    expect(summarizeDistanceCoverage([gps,gap],.7)).toEqual({
      confirmedGpsMeters:100,gapEstimatedMeters:14,unknownDurationMs:0,gpsCoverageMs:10,activeDurationMs:20,estimated:true,
    });
    expect(summarizeDistanceCoverage([gps,{...gap,displacementCorroborated:false}],.7)).toMatchObject({confirmedGpsMeters:100,gapEstimatedMeters:0,unknownDurationMs:10});
    expect(summarizeDistanceCoverage([{...gps,gpsMeters:0}],.7).confirmedGpsMeters).toBe(0);
    expect(summarizeDistanceCoverage([{...gap,displacementCorroborated:false}],.7).confirmedGpsMeters).toBeNull();
    expect(()=>summarizeDistanceCoverage([gps,{...gap,from:5}],.7)).toThrow("INVALID_COVERAGE_INTERVALS");
  });
});
