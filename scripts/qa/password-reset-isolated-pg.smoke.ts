/** Disposable local PG: real token consumption, concurrency, rollback and session revocation. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import bcrypt from "bcryptjs";
import {prisma} from "@gafus/prisma";
import {
 consumePasswordResetReceipt,ResetReceiptUnavailableError,lookupPhoneByNormalizedUsername,
} from "@gafus/identity-write-server/password-reset";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_PASSWORD_RESET_REAL_PG!=="1" ||
  url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
  url.pathname!=="/gafus_refactor_password_reset") throw Error("REFUSING_NON_DISPOSABLE_RESET_DB");
async function main(){
 const [owner,other]=await Promise.all([
  prisma.user.create({data:{username:"reset_owner",password:"synthetic-old",email:"owner@example.test",phone:"+79001234567"}}),
  prisma.user.create({data:{username:"reset_other",password:"synthetic-other",email:"other@example.test"}}),
 ]);
 const expiry=new Date("2030-01-01T00:00:00Z");
 await prisma.refreshToken.createMany({data:[
  {userId:owner.id,tokenHash:"synthetic-refresh-owner-1",expiresAt:expiry},
  {userId:owner.id,tokenHash:"synthetic-refresh-owner-2",expiresAt:expiry},
  {userId:other.id,tokenHash:"synthetic-refresh-other",expiresAt:expiry},
 ]});
 const raw="synthetic-reset-raw";
 const hashed=`sha256:${createHash("sha256").update(raw).digest("hex")}`;
 await prisma.passwordResetToken.create({data:{userId:owner.id,token:hashed,shortCode:"111222",expiresAt:expiry}});
 const newHash=await bcrypt.hash("SafePassword42",4);
 const races=await Promise.allSettled(Array.from({length:2},()=>
  consumePasswordResetReceipt({kind:"token",tokenHash:hashed},newHash),
 ));
 assert.equal(races.filter(x=>x.status==="fulfilled").length,1,"only one racing request may use a token");
 assert.equal(races.filter(x=>x.status==="rejected").length,1);
 assert.equal((races.find(x=>x.status==="fulfilled") as PromiseFulfilledResult<string|null>).value,"owner@example.test");
 const changed=await prisma.user.findUniqueOrThrow({where:{id:owner.id}});
 assert.equal(await bcrypt.compare("SafePassword42",changed.password),true);
 assert.equal(changed.passwordSetAt?.getTime(),changed.sessionsRevokedAt?.getTime());
 assert.equal(await prisma.refreshToken.count({where:{userId:owner.id,revokedAt:null}}),0);
 assert.equal(await prisma.refreshToken.count({where:{userId:other.id,revokedAt:null}}),1);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:other.id}})).password,"synthetic-other");
 assert.equal(await prisma.passwordResetToken.count({where:{userId:owner.id}}),0);
 assert.equal(await lookupPhoneByNormalizedUsername("  RESET_OWNER "),"+79001234567");
 await assert.rejects(consumePasswordResetReceipt({kind:"shortCode",shortCode:"111222"},newHash),ResetReceiptUnavailableError);
 const legacy="a".repeat(43);
 await prisma.passwordResetToken.create({data:{userId:owner.id,token:legacy,shortCode:"333444",expiresAt:expiry}});
 assert.equal(await consumePasswordResetReceipt({kind:"token",tokenHash:"sha256:missing",legacyRawToken:legacy},newHash),"owner@example.test");
 assert.equal(await prisma.passwordResetToken.count({where:{userId:owner.id}}),0);
 const short=await prisma.passwordResetToken.create({data:{userId:owner.id,token:"sha256:short",shortCode:"555666",expiresAt:expiry}});
 assert.equal(await consumePasswordResetReceipt({kind:"shortCode",shortCode:"555666"},newHash),"owner@example.test");
 assert.equal(await prisma.passwordResetToken.findUnique({where:{id:short.id}}),null);
 const expired=await prisma.passwordResetToken.create({data:{userId:owner.id,token:"sha256:expired",shortCode:"777888",expiresAt:new Date("2020-01-01")}});
 await assert.rejects(consumePasswordResetReceipt({kind:"shortCode",shortCode:"777888"},newHash),ResetReceiptUnavailableError);
 assert.ok(await prisma.passwordResetToken.findUnique({where:{id:expired.id}}),"invalid token must not be consumed with new credential state");
 const rollbackToken=await prisma.passwordResetToken.create({data:{userId:owner.id,token:"sha256:rollback",shortCode:"999000",expiresAt:expiry}});
 const before=await prisma.user.findUniqueOrThrow({where:{id:owner.id}});
 const beforeRevoked=await prisma.refreshToken.count({where:{userId:owner.id,revokedAt:null}});
 await prisma.$executeRawUnsafe(`CREATE FUNCTION deny_reset_receipt_delete() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'synthetic-fail-before-delete'; END; $$;`);
 await prisma.$executeRawUnsafe(`CREATE TRIGGER deny_reset_receipt BEFORE DELETE ON "PasswordResetToken"
  FOR EACH ROW EXECUTE FUNCTION deny_reset_receipt_delete();`);
 await assert.rejects(consumePasswordResetReceipt({kind:"shortCode",shortCode:"999000"},"synthetic-new-hash"));
 const after=await prisma.user.findUniqueOrThrow({where:{id:owner.id}});
 assert.equal(after.password,before.password,"credential update must roll back on receipt delete failure");
 assert.equal(after.sessionsRevokedAt?.getTime(),before.sessionsRevokedAt?.getTime());
 assert.equal(await prisma.refreshToken.count({where:{userId:owner.id,revokedAt:null}}),beforeRevoked);
 assert.ok(await prisma.passwordResetToken.findUnique({where:{id:rollbackToken.id}}));
 await prisma.$executeRawUnsafe('DROP TRIGGER deny_reset_receipt ON "PasswordResetToken"');
 await prisma.$executeRawUnsafe('DROP FUNCTION deny_reset_receipt_delete()');
 console.log("PASSWORD_RESET_REAL_PG_PASS: exactly-one winner under race, hashed+legacy+short-code, owner-only refresh revocation, no replay, expired token reject, complete rollback on forced DELETE failure");
}
main().then(async()=>prisma.$disconnect()).catch(async(err)=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
