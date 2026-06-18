import { z } from "zod";

import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/server";
import {
  adminClearManualGrant,
  adminGrantLifetime,
  adminGrantPaidUntil,
  cancelYookassaAppSubscription,
  getUserAppSubscriptionAdminSummary,
} from "@gafus/core/services/appSubscription";
import { createAdminPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const logger = createAdminPanelLogger("api-users-app-subscription");

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("paid_until"),
    paidUntil: z.string().min(1),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("lifetime"),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("clear"),
  }),
  z.object({
    action: z.literal("cancel_yookassa_renewal"),
  }),
]);

async function getSessionUser() {
  return (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }
    if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await context.params;
    const data = await getUserAppSubscriptionAdminSummary(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error("GET app-subscription summary failed", error as Error);
    return NextResponse.json({ success: false, error: "Внутренняя ошибка" }, { status: 500 });
  }
}

export const POST = withCSRFProtection(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    const session = await getSessionUser();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Невалидный payload" }, { status: 400 });
    }

    if (parsed.data.action === "paid_until") {
      const paidUntil = new Date(parsed.data.paidUntil);
      if (Number.isNaN(paidUntil.getTime())) {
        return NextResponse.json({ success: false, error: "Некорректная дата" }, { status: 400 });
      }
      await adminGrantPaidUntil({
        userId: id,
        adminUserId: session.user.id,
        paidUntil,
        reason: parsed.data.reason,
      });
    } else if (parsed.data.action === "lifetime") {
      await adminGrantLifetime({
        userId: id,
        adminUserId: session.user.id,
        reason: parsed.data.reason,
      });
    } else if (parsed.data.action === "clear") {
      await adminClearManualGrant({ userId: id, adminUserId: session.user.id });
    } else {
      await cancelYookassaAppSubscription(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("POST app-subscription grant failed", error as Error);
    return NextResponse.json({ success: false, error: "Внутренняя ошибка" }, { status: 500 });
  }
});
