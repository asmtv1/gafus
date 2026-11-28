import { prisma, Prisma } from "@gafus/prisma";

import type { ConsultationBookingDto } from "@gafus/consultation-shared/types";

/**
 * Список броней для админки (без зависимостей от очередей — безопасно для Next bundle).
 */
export async function listAdminBookings(): Promise<ConsultationBookingDto[]> {
  const rows = await prisma.consultationBooking.findMany({
    orderBy: { createdAt: "desc" }, take: 500, include: adminBookingInclude,
  });
  return rows.map(projectBooking);
}

const adminBookingInclude = {
  slot: true,
  client: { select: { username: true } },
  cynologist: { select: { userId: true, user: { select: { profile: { select: { fullName: true } } } } } },
} as const satisfies Prisma.ConsultationBookingInclude;

function projectBooking(b: Prisma.ConsultationBookingGetPayload<{include:typeof adminBookingInclude}>): ConsultationBookingDto {
  return {
    id: b.id,
    status: b.status,
    slot: {
      id: b.slot.id,
      startAtUtc: b.slot.startAt.toISOString(),
      endAtUtc: b.slot.endAt.toISOString(),
      status: b.slot.status,
    },
    cynologistUserId: b.cynologist.userId,
    cynologistDisplayName: b.cynologist.user.profile?.fullName ?? null,
    clientUsername: b.client.username,
    clientOwnerName: b.clientOwnerName,
    clientPhone: b.clientPhone,
    petName: b.petName,
    petGender: b.petGender,
    petAge: b.petAge,
    petBreed: b.petBreed,
    clientProblem: b.clientProblem,
    clientSelfHelpAttempt: b.clientSelfHelpAttempt,
    cancelReason: b.cancelReason,
    confirmationDeadlineAt: b.confirmationDeadlineAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  };
}

export const ADMIN_BOOKING_STATUSES = ["ALL","PENDING_TRAINER_CONFIRMATION","CONFIRMED",
  "CANCELLED_BY_TRAINER","CANCELLED_BY_USER","CANCELLED_BY_SLA","CANCELLED_BY_SYSTEM","COMPLETED","NO_SHOW"] as const;
export type AdminBookingPageQuery = {page:number;pageSize:number;search:string;status:typeof ADMIN_BOOKING_STATUSES[number]};
export async function listAdminBookingPage(actorId: string, query: AdminBookingPageQuery) {
  if (!Number.isSafeInteger(query.page) || query.page<1 || query.page>10000 ||
      ![25,50,100].includes(query.pageSize) || query.search.length>128 ||
      !ADMIN_BOOKING_STATUSES.includes(query.status)) throw Error("INVALID_PAGE");
  const search=query.search.trim();
  const conditions = [
    query.status==="ALL" ? Prisma.sql`TRUE` : Prisma.sql`b.status::text=${query.status}`,
    search ? Prisma.sql`strpos(lower(concat_ws(' ',COALESCE(p."fullName",''),u.username,COALESCE(b."petName",''))),lower(${search}))>0` : Prisma.sql`TRUE`,
  ];
  const match=Prisma.sql`FROM "ConsultationBooking" b
    JOIN "User" u ON u.id=b."clientId"
    JOIN "ConsultationCynologist" c ON c.id=b."cynologistId"
    LEFT JOIN "UserProfile" p ON p."userId"=c."userId"
    WHERE ${Prisma.join(conditions," AND ")}`;
  return prisma.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId},select:{role:true}});
    if(actor?.role!=="ADMIN")throw Error("FORBIDDEN");
    const [count]=await tx.$queryRaw<{total:bigint}[]>`SELECT count(*) AS total ${match}`;
    const total=Number(count?.total??0);
    const page=Math.min(query.page,Math.max(1,Math.ceil(total/query.pageSize)));
    const ids=await tx.$queryRaw<{id:string}[]>`SELECT b.id ${match}
      ORDER BY b."createdAt" DESC,b.id DESC LIMIT ${query.pageSize} OFFSET ${(page-1)*query.pageSize}`;
    const rows=await tx.consultationBooking.findMany({where:{id:{in:ids.map(r=>r.id)}},include:adminBookingInclude});
    const byId=new Map(rows.map(row=>[row.id,projectBooking(row)]));
    return {items:ids.flatMap(({id})=>byId.has(id)?[byId.get(id)!]:[]),
      pagination:{page,pageSize:query.pageSize,search,status:query.status,total}};
  },{isolationLevel:"RepeatableRead"});
}
