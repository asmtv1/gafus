import { prisma, Prisma } from "@gafus/prisma";

/**
 * Admin partner balances. Applications supply an actor ID; the core checks
 * the current database role before returning financial and referral details.
 */
const partnerAdminInclude = {
  user: { select: { id: true, username: true, email: true, profile: { select: { fullName: true } } } },
  promoCode: { select: { code: true } },
  referrals: { select: { id: true, buyerId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  commissions: { select: { id: true, amountKopecks: true, kind: true, paymentId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  payouts: { select: { id: true, amountKopecks: true, status: true, requestedAt: true, processedAt: true, note: true }, orderBy: { requestedAt: "desc" } },
} as const satisfies Prisma.PartnerProfileInclude;

type PartnerAdminRecord = Prisma.PartnerProfileGetPayload<{ include: typeof partnerAdminInclude }>;

function rub(kopecks: number): number {
  return Math.round(kopecks) / 100;
}

function summarize(profile: PartnerAdminRecord) {
  const earned = profile.commissions.reduce((sum, row) => sum + row.amountKopecks, 0);
  const reserved = profile.payouts
    .filter(row => row.status === "PENDING" || row.status === "PAID")
    .reduce((sum, row) => sum + row.amountKopecks, 0);
  return {
    id: profile.id,
    userId: profile.user.id,
    username: profile.user.username,
    fullName: profile.user.profile?.fullName ?? null,
    email: profile.user.email,
    isActive: profile.isActive,
    referralCode: profile.promoCode?.code ?? profile.referralCode,
    referrals: profile.referrals.length,
    earnedKopecks: earned,
    reservedKopecks: reserved,
    availableKopecks: earned - reserved,
    earnedRub: rub(earned),
    reservedRub: rub(reserved),
    availableRub: rub(earned - reserved),
  };
}

/** Admin-panel user editor may show free codes to ADMIN and MODERATOR. */
export async function getFreePartnerPromoCodesForAdminPanel(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  if (actor?.role !== "ADMIN" && actor?.role !== "MODERATOR") throw new Error("FORBIDDEN");
  return prisma.appSubscriptionPromoCode.findMany({
    where: { isActive: true, archivedAt: null, partnerProfile: null },
    select: { id: true, code: true, discountPercent: true },
    orderBy: { code: "asc" },
  });
}

async function assertAdminActor(actorId: string): Promise<void> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
}

export async function listPartnerAdminBalances(actorId: string) {
  await assertAdminActor(actorId);
  const profiles = await prisma.partnerProfile.findMany({ include: partnerAdminInclude });
  return profiles.map(summarize).sort((a, b) => b.availableKopecks - a.availableKopecks);
}

export type PartnerAdminPageQuery = { page: number; pageSize: number; search: string };
type PartnerPageRow = {
  id: string; userId: string; username: string; fullName: string | null; email: string | null;
  isActive: boolean; referralCode: string | null; referrals: bigint; earned: bigint; reserved: bigint;
};

/** The ledger remains authoritative. Aggregate signed commissions and only
 * reserved/paid payouts in SQL; no historical ledger rows leave the DB. */
export async function listPartnerAdminBalancePage(actorId: string, query: PartnerAdminPageQuery) {
  if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 10000 ||
      ![25,50,100].includes(query.pageSize) || query.search.length > 128) throw Error("INVALID_PAGE");
  const search = query.search.trim();
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "ADMIN") throw Error("FORBIDDEN");
    const where = search ? Prisma.sql`WHERE strpos(lower(concat_ws(' ',u.username,
      COALESCE(up."fullName",''),COALESCE(u.email,''),COALESCE(pc.code,p."referralCode",'null'))),
      lower(${search})) > 0` : Prisma.empty;
    const matched = Prisma.sql`FROM "PartnerProfile" p
      JOIN "User" u ON u.id=p."userId"
      LEFT JOIN "UserProfile" up ON up."userId"=u.id
      LEFT JOIN "AppSubscriptionPromoCode" pc ON pc.id=p."promoCodeId" ${where}`;
    const [count] = await tx.$queryRaw<{total:bigint}[]>`SELECT count(*) AS total ${matched}`;
    const total = Number(count?.total ?? 0);
    const page = Math.min(query.page, Math.max(1,Math.ceil(total/query.pageSize)));
    const rows = await tx.$queryRaw<PartnerPageRow[]>`
      WITH matched AS (
        SELECT p.id,p."userId",u.username,up."fullName",u.email,p."isActive",
          COALESCE(pc.code,p."referralCode") AS "referralCode" ${matched}
      ), earned AS (
        SELECT c."partnerId",SUM(c."amountKopecks") AS total
        FROM "PartnerCommission" c JOIN matched m ON m.id=c."partnerId" GROUP BY c."partnerId"
      ), reserved AS (
        SELECT q."partnerId",SUM(q."amountKopecks") AS total
        FROM "PartnerPayout" q JOIN matched m ON m.id=q."partnerId"
        WHERE q.status IN ('PENDING','PAID') GROUP BY q."partnerId"
      ), selected AS (
        SELECT m.*, COALESCE(e.total,0) AS earned,COALESCE(r.total,0) AS reserved
        FROM matched m LEFT JOIN earned e ON e."partnerId"=m.id LEFT JOIN reserved r ON r."partnerId"=m.id
        ORDER BY COALESCE(e.total,0)-COALESCE(r.total,0) DESC,m.id ASC
        LIMIT ${query.pageSize} OFFSET ${(page-1)*query.pageSize}
      )
      SELECT s.*, (SELECT COUNT(*) FROM "PartnerReferral" r WHERE r."partnerId"=s.id) AS referrals
      FROM selected s ORDER BY s.earned-s.reserved DESC,s.id ASC
    `;
    return { items: rows.map(({earned,reserved,referrals,...row})=>{
      const earnedKopecks=Number(earned), reservedKopecks=Number(reserved);
      if (![earnedKopecks,reservedKopecks,earnedKopecks-reservedKopecks].every(Number.isSafeInteger))
        throw Error("PARTNER_BALANCE_OUT_OF_RANGE");
      return {...row,referrals:Number(referrals),earnedKopecks,reservedKopecks,
        availableKopecks:earnedKopecks-reservedKopecks,earnedRub:rub(earnedKopecks),
        reservedRub:rub(reservedKopecks),availableRub:rub(earnedKopecks-reservedKopecks)};
    }), pagination:{page,pageSize:query.pageSize,search,total} };
  },{isolationLevel:"RepeatableRead"});
}

export async function getPartnerAdminBalanceDetail(actorId: string, partnerId: string) {
  await assertAdminActor(actorId);
  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    include: partnerAdminInclude,
  });
  if (!profile) return null;
  return {
    ...summarize(profile),
    referrals: profile.referrals,
    commissions: profile.commissions,
    payouts: profile.payouts,
  };
}

/** Bounded detail projection. Financial totals are calculated over the full
 * ledger; history page lengths must never affect available balance. */
export async function getPartnerAdminBalanceDetailPage(actorId:string,partnerId:string,
  query:{referralsPage:number;payoutsPage:number;pageSize:number}) {
  if (![query.referralsPage,query.payoutsPage].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=10000) ||
      ![25,50,100].includes(query.pageSize)) throw Error("INVALID_PAGE");
  return prisma.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId},select:{role:true}});
    if(actor?.role!=="ADMIN")throw Error("FORBIDDEN");
    const profile=await tx.partnerProfile.findUnique({where:{id:partnerId},include:{
      user:partnerAdminInclude.user,promoCode:partnerAdminInclude.promoCode,
    }});
    if(!profile)return null;
    const where={partnerId};
    const [earned,reserved,referralsTotal,payoutsTotal]=await Promise.all([
      tx.partnerCommission.aggregate({where,_sum:{amountKopecks:true}}),
      tx.partnerPayout.aggregate({where:{...where,status:{in:["PENDING","PAID"]}},_sum:{amountKopecks:true}}),
      tx.partnerReferral.count({where}),tx.partnerPayout.count({where}),
    ]);
    const earnedKopecks=earned._sum.amountKopecks??0,reservedKopecks=reserved._sum.amountKopecks??0;
    if(![earnedKopecks,reservedKopecks,earnedKopecks-reservedKopecks].every(Number.isSafeInteger))
      throw Error("PARTNER_BALANCE_OUT_OF_RANGE");
    const clamp=(page:number,total:number)=>Math.min(page,Math.max(1,Math.ceil(total/query.pageSize)));
    const referralsPage=clamp(query.referralsPage,referralsTotal),payoutsPage=clamp(query.payoutsPage,payoutsTotal);
    const [referrals,payouts]=await Promise.all([
      tx.partnerReferral.findMany({where,select:partnerAdminInclude.referrals.select,
        orderBy:[{createdAt:"desc"},{id:"asc"}],skip:(referralsPage-1)*query.pageSize,take:query.pageSize}),
      tx.partnerPayout.findMany({where,select:partnerAdminInclude.payouts.select,
        orderBy:[{requestedAt:"desc"},{id:"asc"}],skip:(payoutsPage-1)*query.pageSize,take:query.pageSize}),
    ]);
    return {id:profile.id,userId:profile.user.id,username:profile.user.username,
      fullName:profile.user.profile?.fullName??null,email:profile.user.email,isActive:profile.isActive,
      referralCode:profile.promoCode?.code??profile.referralCode,
      earnedKopecks,reservedKopecks,availableKopecks:earnedKopecks-reservedKopecks,
      earnedRub:rub(earnedKopecks),reservedRub:rub(reservedKopecks),availableRub:rub(earnedKopecks-reservedKopecks),
      referrals,payouts,history:{referralsPage,payoutsPage,pageSize:query.pageSize,referralsTotal,payoutsTotal}};
  },{isolationLevel:"RepeatableRead"});
}

/**
 * Mark the currently available amount as paid. This transaction shares the
 * same partner-payout:userId advisory lock as requestPartnerPayout, so a
 * concurrent self-service request and an admin payout cannot reserve twice.
 */
export async function markPartnerBalancePaidAdmin(input: {
  actorId: string;
  partnerId: string;
}) {
  return prisma.$transaction(async tx => {
    // Protect the authorization decision against a concurrent role change.
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${input.actorId} FOR UPDATE`;
    const actor = await tx.user.findUnique({
      where: { id: input.actorId },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN") {
      return { success: false as const, error: "Недостаточно прав" };
    }

    const partner = await tx.partnerProfile.findUnique({
      where: { id: input.partnerId },
      select: { userId: true },
    });
    if (!partner) return { success: false as const, error: "Партнёр не найден" };

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-payout:${partner.userId}`}))`;
    const [earned, paidOrPending] = await Promise.all([
      tx.partnerCommission.aggregate({
        where: { partnerId: input.partnerId },
        _sum: { amountKopecks: true },
      }),
      tx.partnerPayout.aggregate({
        where: { partnerId: input.partnerId, status: { in: ["PENDING", "PAID"] } },
        _sum: { amountKopecks: true },
      }),
    ]);
    const availableKopecks =
      (earned._sum.amountKopecks ?? 0) - (paidOrPending._sum.amountKopecks ?? 0);
    if (availableKopecks <= 0) {
      return { success: false as const, error: "Доступный баланс уже выплачен или отсутствует" };
    }

    const payout = await tx.partnerPayout.create({
      data: {
        partnerId: input.partnerId,
        amountKopecks: availableKopecks,
        status: "PAID",
        processedAt: new Date(),
        note: `Выплата отмечена администратором ${input.actorId}`,
      },
    });
    return {
      success: true as const,
      payoutId: payout.id,
      amountKopecks: availableKopecks,
    };
  });
}
