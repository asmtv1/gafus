import { z } from "zod";

import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { updateUserAdmin } from "@gafus/core/services/adminUser";
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const logger = createAdminPanelLogger("api-users");

const updateUserBodySchema = z.object({
  username: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "MODERATOR", "TRAINER", "USER"]).optional(),
  newPassword: z.string().min(6).optional(),
});

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
