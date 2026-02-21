import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { DOCUMENT_VERSIONS } from "../../config/documentVersions";

const logger = createWebLogger("oferta-acceptance");

export interface RecordOfertaAcceptanceParams {
  userId: string;
  courseId: string;
  paymentId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  source: "web" | "mobile";
}

export async function recordOfertaAcceptance(
  params: RecordOfertaAcceptanceParams,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await prisma.ofertaAcceptance.create({
      data: {
        userId: params.userId,
        courseId: params.courseId,
        paymentId: params.paymentId ?? null,
        acceptedAt: new Date(),
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        documentVersions: DOCUMENT_VERSIONS,
        source: params.source,
      },
    });
    return { success: true };
  } catch (error) {
    logger.error("Ошибка записи согласия с офертой", error as Error, {
      userId: params.userId,
      courseId: params.courseId,
      paymentId: params.paymentId,
    });
    return { success: false, error: "Не удалось записать согласие" };
  }
}
