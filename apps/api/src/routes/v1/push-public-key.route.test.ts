/** Private authenticated VAPID *public* key projection, no DB or provider. */
import {randomBytes} from "node:crypto";
import {Hono} from "hono";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";

vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn()}),
}));
vi.mock("@gafus/prisma",()=>({
  prisma:{user:{findUnique:async()=>({sessionsRevokedAt:null,registrationPending:false})}},
}));
vi.mock("@gafus/core/services/auth",()=>({isRegistrationCompleted:async()=>true}));
vi.mock("@gafus/core/services/auth/identityReadService",()=>({
  sessionIsCurrent:async()=>true,
}));
vi.mock("../../../../../packages/core/src/services/subscriptions/pushSubscriptionService.js",()=>({
  savePushSubscription:vi.fn(),
  PushEndpointOwnerConflictError:class extends Error{},
  PushSessionStaleError:class extends Error{},
}));
import {generateAccessToken} from "@gafus/auth/jwt";
import {authMiddleware} from "../../middleware/auth";
import {subscriptionsRoutes} from "./subscriptions";
const app=new Hono();
app.use("/api/v1/subscriptions/*",authMiddleware);
app.route("/api/v1/subscriptions",subscriptionsRoutes);
const url="/api/v1/subscriptions/push/public-key";
let jwt:string;
const oldKey=process.env.VAPID_PUBLIC_KEY;
const oldJwt=process.env.JWT_SECRET;
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  jwt=await generateAccessToken({id:"synthetic",username:"test",role:"USER"});
});
afterAll(()=>{
  if(oldJwt===undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET=oldJwt;
  if(oldKey===undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY=oldKey;
});
async function get(auth=true){return app.request(url,{
  headers:auth?{authorization:`Bearer ${jwt}`}:{},
});}
describe("VAPID public key is auth-owned and fail closed",()=>{
  it("rejects guest access",async()=>{
    process.env.VAPID_PUBLIC_KEY=Buffer.from([4,...randomBytes(64)]).toString("base64url");
    expect((await get(false)).status).toBe(401);
  });
  it("rejects missing or invalid configuration",async()=>{
    delete process.env.VAPID_PUBLIC_KEY;
    const absent=await get();
    expect(absent.status).toBe(503);
    expect(await absent.json()).toMatchObject({success:false,code:"WEB_PUSH_NOT_CONFIGURED"});
    process.env.VAPID_PUBLIC_KEY="invalid";
    expect((await get()).status).toBe(503);
  });
  it("returns only public key with no-store, never private key",async()=>{
    const publicKey=Buffer.from([4,...randomBytes(64)]).toString("base64url");
    process.env.VAPID_PUBLIC_KEY=publicKey;
    const res=await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({success:true,data:{publicKey}});
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
