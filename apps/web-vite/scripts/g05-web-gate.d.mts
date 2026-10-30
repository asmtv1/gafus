/** Test-runner-only typed contract; no application/runtime import from AG4 tools. */
export type G05ActorFixture = Readonly<{
  ownerId:string;
  accessToken:string;
  authEpoch:number;
  sessionScope:string;
}>;
export type G05AdmittedWebResource = Readonly<{
  grantId:string;
  leaseId:string;
  honoOrigin:string;
  allowedCases:readonly string[];
  expiresAt:number;
  actors:Readonly<Record<"A"|"B",G05ActorFixture>>;
}>;
export declare function readG05WebGate(grantRelative:string):G05AdmittedWebResource;
