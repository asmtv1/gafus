import { z } from "zod";

import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { updateUserAdmin } from "@gafus/core/services/adminUser";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const logger = createAdminPanelLogger("api-users");

const updateUserBodySchema = z.object({
  username: z.string().min(1).optional(),
  email: z
    .union([
      z.string().email("Некорректный email").max(255),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === "" || v === null) return null;
      return v.toLowerCase().trim();
    }),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "MODERATOR", "TRAINER", "PARTNER", "USER"]).optional(),
  newPassword: z.string().min(6).optional(),
  partnerPromoCodeId: z.string().min(1).optional(),
});

async function partnerChangeRequiresAdmin(actorId: string, userId: string, input: z.infer<typeof updateUserBodySchema>) {
  if (input.partnerPromoCodeId === undefined && input.role === undefined) return false;

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  const changesPartnerRole = input.role !== undefined && input.role !== target?.role &&
    (input.role === "PARTNER" || target?.role === "PARTNER");

  return (input.partnerPromoCodeId !== undefined || changesPartnerRole) && actor?.role !== "ADMIN";
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getServerSession(authOptions)) as {
      user: { id: string; username: string; role: string };
    } | null;

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
      return NextResponse.json({ success: false, error: "Недостаточно прав" }, { status: 403 });
    }

    const params = await context.params;
    const userId = params.id;

    const body = await request.json();
    const parsed = updateUserBodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors;
      const errorMsg = Object.entries(msg)
        .map(([k, v]) => `${k}: ${(v || []).join(", ")}`)
        .join("; ");
      return NextResponse.json(
        { success: false, error: errorMsg || "Невалидные данные" },
        { status: 400 },
      );
    }

    if (await partnerChangeRequiresAdmin(session.user.id, userId, parsed.data)) {
      return NextResponse.json({ success: false, error: "Только администратор может управлять ролью и промокодом партнёра" }, { status: 403 });
    }

    const result = await updateUserAdmin(userId, parsed.data);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Ошибка при обновлении пользователя:", error as Error);
    return NextResponse.json(
      { success: false, error: "Не удалось обновить пользователя" },
      { status: 500 },
    );
  }
}
