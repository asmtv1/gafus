/** Opt-in only: disposable PostgreSQL, synthetic non-login accounts, no email provider. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readPasswordResetRequestUser, claimPasswordResetEmailToken,
  rollbackFailedPasswordResetEmailToken, retireOlderPasswordResetEmailTokens,
  readEmailChangeAccount, readEmailOwner, stageEmailChange,
  rollbackUndeliveredEmailChange, retireOlderEmailChangeTokens,
  consumeEmailChangeConfirmation,
} from "./emailAccountRows.js";

const url=process.env.DATABASE_URL??"";
const active=process.env.GAFUS_EMAIL_ACCOUNT_REAL_PG==='enabled' &&
  /^postgresql:\/\/emailrowsqa@127\.0\.0\.1:\d+\/gafus_email_rows_qa\?schema=public$/.test(url);
const suite=active?describe:describe.skip;
const ids={owner:"qa_email_owner",other:"qa_email_other"};
const email={owner:"qa-email-owner@example.test",other:"qa-email-other@example.test"};
const future=()=>new Date(Date.now()+3600_000);
let now:Date;

suite('real PostgreSQL email-account token ownership, replay and conflict',()=>{
  beforeAll(async()=>{
    await prisma.user.createMany({data:[
      {id:ids.owner,username:ids.owner,email:email.owner,password:"fake-hash",passwordSetAt:new Date("2026-11-01T00:00:00Z")},
      {id:ids.other,username:ids.other,email:email.other,password:"fake-hash-other"},
    ]});
  });
  beforeEach(async()=>{
    await prisma.emailChangeToken.deleteMany({where:{userId:{in:[ids.owner,ids.other]}}});
    await prisma.passwordResetToken.deleteMany({where:{userId:{in:[ids.owner,ids.other]}}});
    await prisma.user.update({where:{id:ids.owner},data:{email:email.owner,passwordResetRequestedAt:null}});
    now=new Date();
  });
  afterAll(async()=>{await prisma.$disconnect();});

  it('looks up only exact requested email, not the contents of another account',async()=>{
    expect((await readPasswordResetRequestUser(email.owner))?.id).toBe(ids.owner);
    expect(await readPasswordResetRequestUser('unknown@example.test')).toBeNull();
    expect((await readEmailChangeAccount(ids.owner))?.email).toBe(email.owner);
    expect((await readEmailOwner(email.other))?.id).toBe(ids.other);
  });

  it('atomically claims the 120s reset limit, preserves old links until provider ACK and retires only older tokens',async()=>{
    await prisma.passwordResetToken.create({data:{userId:ids.owner,token:'old-hash',expiresAt:future(),createdAt:new Date(now.getTime()-1000)}});
    const first={userId:ids.owner,expectedEmail:email.owner,tokenHash:'new-hash',requestedAt:now,expiresAt:future(),throttleMs:120000};
    expect(await claimPasswordResetEmailToken(first)).toBe(true);
    expect(await claimPasswordResetEmailToken({...first,tokenHash:'racing-hash'})).toBe(false);
    expect((await prisma.passwordResetToken.findMany({where:{userId:ids.owner}})).map(x=>x.token).sort()).toEqual(['new-hash','old-hash']);
    await retireOlderPasswordResetEmailTokens(ids.owner,'new-hash');
    expect((await prisma.passwordResetToken.findMany({where:{userId:ids.owner}})).map(x=>x.token)).toEqual(['new-hash']);
  });

  it('late ACK only retires older reset links; a changed email cannot claim a stale request',async()=>{
    const first={userId:ids.owner,expectedEmail:email.owner,tokenHash:'older',requestedAt:now,expiresAt:future(),throttleMs:120000};
    expect(await claimPasswordResetEmailToken(first)).toBe(true);
    expect(await claimPasswordResetEmailToken({...first,tokenHash:'newer',requestedAt:new Date(now.getTime()+121000)})).toBe(true);
    await retireOlderPasswordResetEmailTokens(ids.owner,'older');
    expect((await prisma.passwordResetToken.findMany({where:{userId:ids.owner}})).map(x=>x.token).sort()).toEqual(['newer','older']);
    await retireOlderPasswordResetEmailTokens(ids.owner,'newer');
    expect((await prisma.passwordResetToken.findMany({where:{userId:ids.owner}})).map(x=>x.token)).toEqual(['newer']);
    await prisma.user.update({where:{id:ids.owner},data:{email:'changed@example.test',passwordResetRequestedAt:null}});
    expect(await claimPasswordResetEmailToken({...first,tokenHash:'stale-address'})).toBe(false);
  });

  it('undelivered reset removes only the staged token, releases throttle and permits a real retry',async()=>{
    await prisma.passwordResetToken.create({data:{userId:ids.owner,token:'older-delivered',expiresAt:future()}});
    const first={userId:ids.owner,expectedEmail:email.owner,tokenHash:'failed-mail',requestedAt:now,expiresAt:future(),throttleMs:120000};
    expect(await claimPasswordResetEmailToken(first)).toBe(true);
    await rollbackFailedPasswordResetEmailToken({
      userId:ids.owner,tokenHash:first.tokenHash,requestedAt:first.requestedAt,previousRequestedAt:null,
    });
    const tokens=await prisma.passwordResetToken.findMany({where:{userId:ids.owner}});
    expect(tokens.map(x=>x.token)).toEqual(['older-delivered']);
    expect((await prisma.user.findUnique({where:{id:ids.owner},select:{passwordResetRequestedAt:true}}))?.passwordResetRequestedAt).toBeNull();
    expect(await claimPasswordResetEmailToken({...first,tokenHash:'new-retry'})).toBe(true);
  });

  it('requires immutable credential proof on a locked owner row and rejects staged email collisions',async()=>{
    const old=await readEmailChangeAccount(ids.owner);
    expect(old).not.toBeNull();
    const args={userId:ids.owner,newEmail:'new-email@example.test',token:'candidate-A',expiresAt:future(),
      expectedPassword:old!.password,expectedPasswordSetAt:old!.passwordSetAt};
    await expect(stageEmailChange({...args,expectedPassword:'not-current'})).rejects.toThrow('Неверный текущий пароль');
    await expect(stageEmailChange({...args,newEmail:email.other})).rejects.toThrow('Этот email уже занят');
    expect(await prisma.emailChangeToken.count()).toBe(0);
  });

  it('monotonic staged times distinguish simultaneous requests and preserve newer token',async()=>{
    const old=await readEmailChangeAccount(ids.owner);
    const base={userId:ids.owner,newEmail:'first@example.test',token:'first-token',expiresAt:future(),
      expectedPassword:old!.password,expectedPasswordSetAt:old!.passwordSetAt};
    const stagedA=await stageEmailChange(base);
    const stagedB=await stageEmailChange({...base,newEmail:'second@example.test',token:'second-token'});
    expect(stagedB.getTime()).toBeGreaterThan(stagedA.getTime());
    await rollbackUndeliveredEmailChange(ids.owner,'second-token');
    expect((await prisma.emailChangeToken.findMany({where:{userId:ids.owner}})).map(x=>x.token)).toEqual(['first-token']);
    const stagedC=await stageEmailChange({...base,newEmail:'third@example.test',token:'third-token'});
    await retireOlderEmailChangeTokens(ids.owner,'third-token',stagedC);
    expect((await prisma.emailChangeToken.findMany({where:{userId:ids.owner}})).map(x=>x.token)).toEqual(['third-token']);
  });

  it('exact token can confirm only once in competing requests; non-owner email unchanged',async()=>{
    const old=await readEmailChangeAccount(ids.owner);
    await stageEmailChange({userId:ids.owner,newEmail:'accepted@example.test',token:'single-use',expiresAt:future(),
      expectedPassword:old!.password,expectedPasswordSetAt:old!.passwordSetAt});
    await prisma.passwordResetToken.create({data:{userId:ids.owner,token:'former-address',expiresAt:future()}});
    const outcomes=await Promise.allSettled([
      consumeEmailChangeConfirmation('single-use'), consumeEmailChangeConfirmation('single-use'),
    ]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect((await prisma.user.findUnique({where:{id:ids.owner}}))?.email).toBe('accepted@example.test');
    expect((await prisma.user.findUnique({where:{id:ids.other}}))?.email).toBe(email.other);
    expect(await prisma.emailChangeToken.count({where:{userId:ids.owner}})).toBe(0);
    expect(await prisma.passwordResetToken.count({where:{userId:ids.owner}})).toBe(0);
  });

  it('expired or already occupied confirmation refuses mutation and preserves old email',async()=>{
    const old=await readEmailChangeAccount(ids.owner);
    const args={userId:ids.owner,newEmail:'unused@example.test',token:'expired-token',expiresAt:new Date(Date.now()+1000),
      expectedPassword:old!.password,expectedPasswordSetAt:old!.passwordSetAt};
    await stageEmailChange(args);
    await prisma.emailChangeToken.update({where:{token:args.token},data:{expiresAt:new Date(Date.now()-1000)}});
    await expect(consumeEmailChangeConfirmation(args.token)).rejects.toThrow('недействительна');
    await stageEmailChange({...args,token:'conflict-token',newEmail:'claimed-later@example.test',expiresAt:future()});
    await prisma.user.update({where:{id:ids.other},data:{email:'claimed-later@example.test'}});
    await expect(consumeEmailChangeConfirmation('conflict-token')).rejects.toThrow('уже занят');
    expect((await prisma.user.findUnique({where:{id:ids.owner}}))?.email).toBe(email.owner);
  });
});
