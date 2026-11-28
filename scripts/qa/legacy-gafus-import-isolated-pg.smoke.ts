/** Real PostgreSQL operator-only import: role revocation, pending liabilities,
 * idempotent ledger, and atomic rollback. Never touches real wallets/providers. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {
 getLegacyGafusImportPreflight as corePreflight,
 importLegacyRewardedBatch as coreImport,
 type LegacyGafusImportPorts,
} from "../../packages/core/src/services/gafus/legacyImportService.js";
import {gafusWallet} from "../../apps/api/src/modules/gafus/composition/wallet-instance.js";
const {changeGafusBalanceTx}=gafusWallet;
import {
 readLegacyImportActorRole,readLegacyImportPreflightRows,
 readLegacyImportCandidates,runOneLegacyImportTransaction,
} from "@gafus/gafus-server/legacy-import-records";
const ports: LegacyGafusImportPorts={
 readActorRole:readLegacyImportActorRole,readPreflightRows:readLegacyImportPreflightRows,
 readCandidates:readLegacyImportCandidates,runOneTransaction:runOneLegacyImportTransaction,
};
const getLegacyGafusImportPreflight=(actorId:string)=>corePreflight(actorId,ports);
const importLegacyRewardedBatch=(input:Parameters<typeof coreImport>[0])=>coreImport(input,ports,changeGafusBalanceTx);

const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||process.env.GAFUS_LEGACY_IMPORT_REAL_PG!=="1"||
 url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||url.pathname!=="/gafus_refactor_legacy_import_h")
 throw Error("REFUSING_NON_DISPOSABLE_LEGACY_GAFUS_PG");
async function main(){
 process.env.GAFUS_LEGACY_REWARDED_DISABLED="true";
 process.env.GAFUS_LEGACY_IMPORT_ENABLED="true";
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,"Pacific/Auckland");
 const admin=await prisma.user.create({data:{username:"legacy_admin_h",password:"fictional",role:"ADMIN"}});
 const userA=await prisma.user.create({data:{username:"legacy_a_h",password:"fictional"}});
 const userB=await prisma.user.create({data:{username:"legacy_b_h",password:"fictional"}});
 const userC=await prisma.user.create({data:{username:"legacy_c_h",password:"fictional"}});
 await prisma.rewardedCreditWallet.createMany({data:[
  {userId:userA.id,balance:4,pendingRefundCredits:0},
  {userId:userB.id,balance:2,pendingRefundCredits:1},
  {userId:userC.id,balance:3,pendingRefundCredits:0},
 ]});
 const before=await getLegacyGafusImportPreflight(admin.id);
 assert.equal(before.credits,9);
 assert.equal(before.pendingRefundCredits,1);
 await assert.rejects(importLegacyRewardedBatch({actorId:admin.id,confirmed:true}),/LEGACY_IMPORT_UNSETTLED_STATE/);
 assert.equal(await prisma.gafusTransaction.count(),0);
 await prisma.rewardedCreditWallet.update({where:{userId:userB.id},data:{pendingRefundCredits:0}});
 const pending=await prisma.rewardedAdSession.create({data:{userId:userA.id,platform:"ANDROID",placementId:"synthetic-only",status:"SHOWN",requestNonceHash:"synthetic-nonce-h",expiresAt:new Date(Date.now()+60_000)}});
 await assert.rejects(importLegacyRewardedBatch({actorId:admin.id,confirmed:true}),/LEGACY_IMPORT_UNSETTLED_STATE/);
 await prisma.rewardedAdSession.update({where:{id:pending.id},data:{status:"EXPIRED"}});
 await assert.rejects(importLegacyRewardedBatch({actorId:userA.id,confirmed:true}),/FORBIDDEN/);
 await assert.rejects(importLegacyRewardedBatch({actorId:admin.id,confirmed:false}),/LEGACY_IMPORT_CONFIRMATION_REQUIRED/);
 process.env.GAFUS_LEGACY_IMPORT_ENABLED="false";
 await assert.rejects(importLegacyRewardedBatch({actorId:admin.id,confirmed:true}),/LEGACY_IMPORT_DISABLED/);
 process.env.GAFUS_LEGACY_IMPORT_ENABLED="true";
 const aWallet=await prisma.rewardedCreditWallet.findUniqueOrThrow({where:{userId:userA.id}});
 await assert.rejects(runOneLegacyImportTransaction(admin.id,{userId:userA.id,balance:5},changeGafusBalanceTx),/LEGACY_IMPORT_BALANCE_CHANGED/);
 assert.equal(await prisma.gafusTransaction.count(),0);
 await assert.rejects(runOneLegacyImportTransaction(admin.id,{userId:userA.id,balance:aWallet.balance},
  async(tx,input)=>{await changeGafusBalanceTx(tx,input);throw Error("SYNTHETIC_WALLET_ABORT");}),/SYNTHETIC_WALLET_ABORT/);
 assert.equal(await prisma.gafusTransaction.count(),0,"transaction and audit must roll back together");
 assert.equal(await prisma.gafusWallet.count(),0);
 const batch=await importLegacyRewardedBatch({actorId:admin.id,confirmed:true,batchSize:20});
 assert.equal(batch.processed,3);
 assert.equal(batch.imported,3);
 assert.equal(batch.credits,9);
 assert.equal(batch.replays,0);
 assert.equal(await prisma.gafusTransaction.count({where:{kind:"LEGACY_IMPORT"}}),3);
 assert.equal(await prisma.gafusAdminAudit.count({where:{action:"LEGACY_BALANCE_IMPORTED"}}),3);
 for(const [u,amount] of [[userA,4],[userB,2],[userC,3]] as const){
  assert.equal((await prisma.gafusWallet.findUniqueOrThrow({where:{userId:u.id}})).balance,amount);
  assert.equal((await prisma.rewardedCreditWallet.findUniqueOrThrow({where:{userId:u.id}})).balance,amount,"original credit wallet must be retained for audit");
 }
 const replay=await importLegacyRewardedBatch({actorId:admin.id,confirmed:true,batchSize:20});
 assert.equal(replay.imported,0);
 assert.equal(replay.replays,3);
 assert.equal(await prisma.gafusTransaction.count({where:{kind:"LEGACY_IMPORT"}}),3);
 await prisma.user.update({where:{id:admin.id},data:{role:"USER"}});
 await assert.rejects(importLegacyRewardedBatch({actorId:admin.id,confirmed:true}),/FORBIDDEN/);
 await assert.rejects(runOneLegacyImportTransaction(admin.id,{userId:userA.id,balance:4},changeGafusBalanceTx),/FORBIDDEN/);
 assert.equal(await prisma.gafusTransaction.count({where:{kind:"LEGACY_IMPORT"}}),3);
 console.log("LEGACY_IMPORT_PHASE_H_REAL_PG_PASS: unsettled refunds and ad sessions deny, explicit cutover and admin, 3 credits+3 audit, retained old wallet, replay no double-credit, stale balance denies, callback rollback, post-preflight role revoke denies in same locked tx");
}
main().then(async()=>prisma.$disconnect()).catch(async err=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
