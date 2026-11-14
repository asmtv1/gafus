/** Real disposable PG transaction-level advisory lock and wallet serializability. */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
import {prisma} from "@gafus/prisma";
import {lockGafusUser,withGafusUserLock} from "@gafus/gafus-server/wallet-lock";
import {changeGafusBalanceTx} from "../../packages/core/src/services/gafus/walletService.js";
import {registerGafusLedgerRowsPort, type GafusLedgerRowsPort} from "../../packages/core/src/services/gafus/gafusLedgerPort.js";
import {ensureWalletRow,findLedgerEntry,updateWalletBalanceRow,appendLedgerEntry,readWalletBalanceRow,readWalletLedgerRows} from "@gafus/gafus-server/wallet-records";
// Isolated smoke does not load the API composition root: bind the exact
// production SQL adapter explicitly, preserving lock/CAS/unique semantics.
const ledgerRows: GafusLedgerRowsPort = {
  ensureWalletRow: ensureWalletRow as unknown as GafusLedgerRowsPort["ensureWalletRow"],
  findLedgerEntry: findLedgerEntry as unknown as GafusLedgerRowsPort["findLedgerEntry"],
  updateWalletBalanceRow: updateWalletBalanceRow as unknown as GafusLedgerRowsPort["updateWalletBalanceRow"],
  appendLedgerEntry: appendLedgerEntry as unknown as GafusLedgerRowsPort["appendLedgerEntry"],
  readWalletBalanceRow,readWalletLedgerRows,
};
registerGafusLedgerRowsPort(ledgerRows);
const db=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_WALLET_LOCK_REAL_PG!=="1" ||
  db.protocol!=="postgresql:" || db.hostname!=="127.0.0.1" ||
  db.pathname!=="/gafus_refactor_wallet_lock")throw Error("REFUSING_NON_DISPOSABLE_WALLET_DB");
async function main(){
  const [actor,other]=await Promise.all([
    prisma.user.create({data:{username:"wallet_lock_actor",password:"synthetic-disposable"}}),
    prisma.user.create({data:{username:"wallet_lock_other",password:"synthetic-disposable"}}),
  ]);
  await withGafusUserLock(actor.id,tx=>changeGafusBalanceTx(tx,{
    userId:actor.id,amount:4,kind:"ADMIN_CREDIT",idempotencyKey:"wallet-initial-four",
  }));
  const results=await Promise.allSettled(Array.from({length:8},(_,i)=>
    prisma.$transaction(async tx=>{
      await lockGafusUser(tx,actor.id);
      return changeGafusBalanceTx(tx,{
        userId:actor.id,amount:-1,kind:"SPEND",idempotencyKey:`wallet-spend-${i}`,
      });
    }),
  ));
  assert.equal(results.filter(x=>x.status==="fulfilled").length,4);
  assert.equal(results.filter(x=>x.status==="rejected").length,4);
  assert.equal((await prisma.gafusWallet.findUniqueOrThrow({where:{userId:actor.id}})).balance,0);
  const ledger=await prisma.gafusTransaction.findMany({where:{userId:actor.id}});
  assert.equal(ledger.filter(x=>x.kind==="SPEND").length,4);
  assert.equal(ledger.reduce((sum,x)=>sum+x.delta,0),0);
  await assert.rejects(withGafusUserLock("",async()=>"bad"),/GAFUS_WALLET_OWNER_REQUIRED/);
  const otherBalance=await prisma.gafusWallet.findUnique({where:{userId:other.id}});
  assert.equal(otherBalance,null,"no wallet data may leak across owners");
  const oldBalance=(await prisma.gafusWallet.findUniqueOrThrow({where:{userId:actor.id}})).balance;
  await assert.rejects(withGafusUserLock(actor.id,async tx=>{
    await changeGafusBalanceTx(tx,{
      userId:actor.id,amount:2,kind:"ADMIN_CREDIT",idempotencyKey:"rolled-back-wallet-credit",
    });
    throw Error("synthetic-rollback");
  }),/synthetic-rollback/);
  assert.equal((await prisma.gafusWallet.findUniqueOrThrow({where:{userId:actor.id}})).balance,oldBalance);
  assert.equal(await prisma.gafusTransaction.count({where:{idempotencyKey:"rolled-back-wallet-credit"}}),0);
  // Two independent Prisma connections remain exclusive until the first tx commits.
  let firstEntered!:()=>void;
  const opened=new Promise<void>(resolve=>{firstEntered=resolve});
  const first=withGafusUserLock(actor.id,async()=>{
    firstEntered();
    await sleep(180);
    return "first";
  });
  await opened;
  let secondEntered=false;
  const second=withGafusUserLock(actor.id,async()=>{
    secondEntered=true;
    return "second";
  });
  await sleep(35);
  assert.equal(secondEntered,false,"second tx must not enter callback during first wallet lock");
  assert.equal(await first,"first");
  assert.equal(await second,"second");
  assert.equal(secondEntered,true);
  console.log("GAFUS_WALLET_LOCK_REAL_PG_PASS: 8 racing spends -> 4 committed/4 denied, zero negative balance, full rollback, cross-connection serial lock, second actor isolated");
}
main().then(async()=>prisma.$disconnect())
 .catch(async(err)=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
