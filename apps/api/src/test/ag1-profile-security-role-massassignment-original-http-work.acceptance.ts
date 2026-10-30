/** AG1 signed original user/profile Hono + permanent WORK PG18. No external media. */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_profile_security_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const people: Actor[] = [];
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function ensure(v: unknown, k: string): asserts v {
  if (!v) throw Error("ASSERT_" + k);
}
function pass(k: string) {
  console.warn("AG1_PROFILE_SECURITY_HTTP " + k + "=PASS");
}
async function request(path: string, method = "GET", actor?: Actor, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(actor?.token ? { Authorization: "Bearer " + actor.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: res.status, data: obj(await res.json()), headers: res.headers };
}
async function create(suffix: string) {
  const pwd = randomBytes(30).toString("base64url");
  const row = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      role: "USER",
      password: await bcrypt.hash(pwd, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
    },
  });
  const a: Actor = { id: row.id, username: row.username, password: pwd };
  people.push(a);
  const logged = await request("/auth/login", "POST", undefined, {
    username: a.username,
    password: a.password,
  });
  ensure(logged.status === 200 && logged.data.success === true, "ACTUAL_LOGIN");
  const token = obj(logged.data.data).accessToken;
  ensure(typeof token === "string" && token.length > 35, "ACTUAL_JWT");
  a.token = token;
  return a;
}
async function cleanup() {
  for (const a of people) {
    const current = await prisma.user.findUnique({
      where: { id: a.id },
      select: { username: true },
    });
    if (current?.username === a.username && a.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: a.id } });
  }
}
async function main() {
  ensure(process.env.AG1_PROFILE_SECURITY_HTTP === "1", "SCOPED_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(u.hostname === "127.0.0.1" && u.port === "55921" &&
    u.username === "gafus_refactor_local_real" &&
    u.pathname === "/gafus_refactor_real_work_20261024", "RESTRICTED_WORK_ONLY");
  ensure(process.env.NODE_ENV === "development" &&
    process.env.GAFUS_LOCAL_ISOLATED_API === "1", "LOCAL_ORIGINAL_HONO_ONLY");
  ensure((await fetch("http://127.0.0.1:3001/ready", {signal:AbortSignal.timeout(4000)})).status===200,"READY200");
  const baseline = await prisma.user.count();
  const owner = await create("owner"), foreign = await create("foreign");
  const contactEmail=prefix+"@example.invalid";
  const fakePhone="+70000000001";
  const initialHash = await prisma.user.findUnique({where:{id:owner.id},select:{password:true}});
  ensure(initialHash!==null,"OWN_PASSWORD_EXISTS");
  // Set ONLY our freshly created own user's private contact markers for strict
  // guest/public whitelist tests. No mail delivery/provider invoked.
  await prisma.user.update({where:{id:owner.id},data:{email:contactEmail,phone:fakePhone}});
  await prisma.userProfile.create({data:{userId:foreign.id,fullName:"FOREIGN_ONLY_SECRET_PROFILE",city:"Казань",about:"NEVER_MUTATE_FOREIGN"}});
  pass("OWN_TWO_STOCK_JWT_ACTORS_SENSITIVE_CONTACT_MARKERS_AND_FOREIGN_BASELINE");
  const pubPath="/user/profile/public?username="+encodeURIComponent(owner.username);
  const publicBefore=await request(pubPath);
  ensure(publicBefore.status===200&&publicBefore.headers.get("cache-control")==="no-store","PUBLIC_GUEST_CACHE_NO_STORE");
  ensure(obj(publicBefore.data.data).role==="USER","USER_ROLE_ORIGINAL_WIRE");
  ensure(!JSON.stringify(publicBefore.data).includes(contactEmail)&&
    !JSON.stringify(publicBefore.data).includes(fakePhone)&&
    !JSON.stringify(publicBefore.data).includes("password"),"PUBLIC_BEFORE_NO_PRIVATE_CONTACTS");
  const naked=await request("/user/profile","PUT",undefined,{fullName:"NO_AUTH"});
  ensure(naked.status===401,"UNAUTH_WRITE401");
  pass("PUBLIC_NO_STORE_WHITELIST_AND_UNAUTH_MUTATION_401");
  // THIS is a deliberate malicious body: Zod must project only editable fields,
  // and the server MUST derive target user from the signed JWT, not from body.
  const massAssignment={fullName:"OWN_ONLY_UPDATED",about:"OWN_VERIFIED_EDIT",
    city:"Самара",userId:foreign.id,id:foreign.id,username:"admin",role:"ADMIN",
    email:"stolen-"+prefix+"@example.invalid",phone:"+79999999999",
    password:"forced-change",passwordSetAt:"2020-01-01",avatarUrl:"https://malicious.invalid/override.png",
    onboardingTourCompletedAt:"2020-01-01",accounts:[{provider:"vk",providerAccountId:"attacker"}],
    profile:{fullName:"OVERRIDE_NESTED_FOREIGN"},isPrivate:false,registrationPending:true};
  const write=await request("/user/profile","PUT",owner,massAssignment);
  ensure(write.status===200&&write.data.success===true&&
    write.headers.get("cache-control")==="private, no-store","MASS_PAYLOAD_OWNER_PUT200_NO_STORE");
  const ownerUser=await prisma.user.findUnique({where:{id:owner.id},select:{id:true,username:true,role:true,email:true,phone:true,password:true,registrationPending:true,passwordSetAt:true,onboardingTourCompletedAt:true}});
  const ownerProfile=await prisma.userProfile.findUnique({where:{userId:owner.id}});
  const foreignProfile=await prisma.userProfile.findUnique({where:{userId:foreign.id}});
  ensure(ownerUser?.username===owner.username&&ownerUser.role==="USER"&&
    ownerUser.email===contactEmail&&ownerUser.phone===fakePhone&&ownerUser.password===initialHash.password&&
    ownerUser.registrationPending===false&&ownerUser.onboardingTourCompletedAt===null,
    "MASS_ASSIGNMENT_PROTECTED_CORE_USER_SQL");
  ensure(ownerProfile?.fullName==="OWN_ONLY_UPDATED"&&ownerProfile.city==="Самара"&&
    ownerProfile.about==="OWN_VERIFIED_EDIT"&&ownerProfile.avatarUrl===null&&
    foreignProfile?.fullName==="FOREIGN_ONLY_SECRET_PROFILE"&&foreignProfile.about==="NEVER_MUTATE_FOREIGN",
    "MASS_ASSIGNMENT_ONLY_OWN_ALLOWED_PROFILE_FIELDS_SQL");
  ensure(await prisma.userProfile.count({where:{userId:owner.id}})===1,"ONE_OWNER_PROFILE");
  pass("JWT_OWNER_FENCED_MASS_ASSIGNMENT_ROLE_EMAIL_PASSWORD_AVATAR_FOREIGN_SQL_UNCHANGED");
  const ownerPrivate=await request("/user/profile","GET",owner);
  const foreignPrivate=await request("/user/profile","GET",foreign);
  const publicAfter=await request(pubPath);
  ensure(ownerPrivate.status===200&&ownerPrivate.headers.get("cache-control")==="private, no-store"&&
    obj(obj(ownerPrivate.data.data).profile).about==="OWN_VERIFIED_EDIT","PRIVATE_LATEST_SQL_NO_CACHE");
  ensure(foreignPrivate.status===200&&obj(obj(foreignPrivate.data.data).profile).fullName==="FOREIGN_ONLY_SECRET_PROFILE"&&
    !JSON.stringify(foreignPrivate.data).includes("OWN_VERIFIED_EDIT"),"FOREIGN_GET_SELF_ONLY");
  ensure(publicAfter.status===200&&publicAfter.headers.get("cache-control")==="no-store"&&
    obj(obj(publicAfter.data.data).profile).about==="OWN_VERIFIED_EDIT"&&
    !JSON.stringify(publicAfter.data).includes(contactEmail)&&!JSON.stringify(publicAfter.data).includes(fakePhone)&&
    !JSON.stringify(publicAfter.data).includes("password")&&
    !JSON.stringify(publicAfter.data).includes("FOREIGN_ONLY_SECRET_PROFILE"),"PUBLIC_LATEST_SQL_NO_CREDENTIALS_OR_FOREIGN");
  pass("PRIVATE_PUBLIC_NO_STORE_IMMEDIATE_SQL_REFRESH_FOREIGN_PRIVATE_ISOLATION");
  const retry=await request("/user/profile","PUT",owner,massAssignment);
  ensure(retry.status===200&&await prisma.userProfile.count({where:{userId:owner.id}})===1,"RETRY_NO_DUPLICATE_PROFILE");
  const failed=await request("/user/profile","PUT",foreign,{birthDate:{bad:"injected"},userId:owner.id,role:"ADMIN"});
  ensure(failed.status===400,"SCHEMA_BAD_TYPE400");
  const afterReject=await prisma.userProfile.findUnique({where:{userId:owner.id}});
  ensure(afterReject?.about==="OWN_VERIFIED_EDIT","BAD_TYPE_CANNOT_TOUCH_OWNER");
  pass("RETRY_ONE_OWNER_PROFILE_SCHEMA_400_ERROR_NO_OTHER_WRITES");
  // Role/identity source-of-truth test is deliberately synthetic only: a role
  // change made by a trusted server/DB admin must appear in public/private GET,
  // not permit arbitrary role elevation through PUT or cached JWT roles.
  await prisma.user.update({where:{id:owner.id},data:{role:"TRAINER"}});
  const rolePublic=await request(pubPath);
  const rolePrivate=await request("/user/profile","GET",owner);
  ensure(rolePublic.status===200&&obj(rolePublic.data.data).role==="TRAINER"&&
    rolePublic.headers.get("cache-control")==="no-store","PUBLIC_ROLE_LATEST_DB");
  ensure(rolePrivate.status===200&&obj(rolePrivate.data.data).role==="TRAINER"&&
    rolePrivate.headers.get("cache-control")==="private, no-store","OWNER_PRIVATE_ROLE_LATEST_DB");
  const forgedAgain=await request("/user/profile","PUT",owner,{role:"ADMIN",about:"ROLE_RETRY_NO_ELEVATION"});
  ensure(forgedAgain.status===200,"FORGED_ROLE_PUT200_STRIPS_UNKNOWN");
  ensure((await prisma.user.findUnique({where:{id:owner.id},select:{role:true}}))?.role==="TRAINER","FORGED_ROLE_NOT_ELEVATED_AFTER_ADMIN_EDIT");
  pass("SOURCE_OF_TRUTH_PUBLIC_OWNER_ROLE_REFRESH_AFTER_SYNTHETIC_TRUSTED_ROLE_CHANGE");
  ensure((await prisma.userProfile.findUnique({where:{userId:foreign.id}}))?.fullName==="FOREIGN_ONLY_SECRET_PROFILE","FOREIGN_FINAL_STATE_UNCHANGED");
  pass("ORIGINAL_HONO_PROFILE_ROLE_MASS_ASSIGNMENT_CACHE_OWNER_SECURITY_ACCEPTED");
}
void (async()=>{try{await main();}catch(e){process.exitCode=1;console.error("AG1_PROFILE_SECURITY_FAILED",e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"UNEXPECTED_REDACTED");}finally{try{await cleanup();console.warn("AG1_PROFILE_SECURITY_OWN_SQL_CLEANUP=PASS");}catch{process.exitCode=1;console.error("AG1_PROFILE_SECURITY_CLEANUP_REVIEW_REQUIRED");}await prisma.$disconnect();}})();
