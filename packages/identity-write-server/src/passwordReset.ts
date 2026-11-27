/** Server-only password reset receipt consumption and session revocation.
 * Core owns password policy, hashing, response errors and post-commit mail.
 */
import {prisma} from "@gafus/prisma";

export class ResetReceiptUnavailableError extends Error {
  constructor(){super("RESET_RECEIPT_UNAVAILABLE");this.name="ResetReceiptUnavailableError";}
}

export type ResetReceiptProof =
  | {kind:"token";tokenHash:string;legacyRawToken?:string}
  | {kind:"shortCode";shortCode:string};

/** Single-use credential mutation. Owner SELECT FOR UPDATE serializes racing redeems;
 * the same transaction changes the password, revokes sessions, consumes token.
 */
export async function consumePasswordResetReceipt(proof:ResetReceiptProof,passwordHash:string):Promise<string|null>{
  if(!passwordHash || (proof.kind==="token"?!proof.tokenHash:!proof.shortCode))
    throw new ResetReceiptUnavailableError();
  return prisma.$transaction(async tx=>{
    // Lookup is not authorization. Lock the owner first, then re-read the
    // exact receipt so issuer, retirement, email changes and redemption have
    // one lock order. No token from the old email can race the email change.
    const lookup = async () => {
      if (proof.kind === "shortCode") return tx.passwordResetToken.findUnique({
        where: { shortCode: proof.shortCode },
      });
      const hashed = await tx.passwordResetToken.findUnique({ where: { token: proof.tokenHash } });
      return hashed ?? (proof.legacyRawToken
        ? await tx.passwordResetToken.findUnique({ where: { token: proof.legacyRawToken } })
        : null);
    };
    const seen = await lookup();
    if (!seen) throw new ResetReceiptUnavailableError();
    const locked = await tx.$queryRaw<{id:string}[]>`
      SELECT "id" FROM "User" WHERE "id" = ${seen.userId} FOR UPDATE
    `;
    if (!locked.length) throw new ResetReceiptUnavailableError();
    const record = await tx.passwordResetToken.findUnique({where:{id:seen.id}});
    if (!record || record.userId !== seen.userId || record.expiresAt <= new Date())
      throw new ResetReceiptUnavailableError();
    const at=new Date();
    // Multiple reset mails may be pending or delivered out of order.
    // The conditional UPDATE serializes all receipts for the same owner:
    // a receipt issued before a successful password change can never be used.
    const updated=await tx.user.updateMany({
      where:{id:record.userId,OR:[{passwordSetAt:null},{passwordSetAt:{lt:record.createdAt}}]},
      data:{password:passwordHash,passwordSetAt:at,sessionsRevokedAt:at},
    });
    if(updated.count!==1)throw new ResetReceiptUnavailableError();
    const user=await tx.user.findUniqueOrThrow({
      where:{id:record.userId},select:{email:true},
    });
    await tx.refreshToken.updateMany({
      where:{userId:record.userId,revokedAt:null},data:{revokedAt:at},
    });
    await tx.passwordResetToken.delete({where:{id:record.id}});
    return user.email;
  });
}

/** Legacy caller still has to enforce its own route-level exposure policy. */
export async function lookupPhoneByNormalizedUsername(username:string):Promise<string|null>{
  if(!username.trim())return null;
  const user=await prisma.user.findUnique({
    where:{username:username.toLowerCase().trim()},select:{phone:true},
  });
  return user?.phone??null;
}
