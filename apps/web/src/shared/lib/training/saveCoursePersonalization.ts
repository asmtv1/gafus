"use server";

import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";
import { saveCoursePersonalization as saveCoursePersonalizationService } from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

const logger = createWebLogger("web-save-course-personalization");

const savePersonalizationSchema = z.object({
  userDisplayName: z.string().min(1, "Укажите имя").transform((s) => s.trim()),
  userGender: z.enum(["male", "female"]),
  petName: z.string().min(1, "Укажите имя питомца").transform((s) => s.trim()),
  petGender: z.enum(["male", "female"]).optional().nullable(),
  petNameGen: z
    .string()
    .optional()
    .transform((s) => (s?.trim() === "" ? null : s?.trim() ?? null)),
  petNameDat: z
    .string()
    .optional()
    .transform((s) => (s?.trim() === "" ? null : s?.trim() ?? null)),
  petNameAcc: z
    .string()
    .optional()
    .transform((s) => (s?.trim() === "" ? null : s?.trim() ?? null)),
  petNameIns: z
    .string()
    .optional()
    .transform((s) => (s?.trim() === "" ? null : s?.trim() ?? null)),
  petNamePre: z
    .string()
    .optional()
    .transform((s) => (s?.trim() === "" ? null : s?.trim() ?? null)),
});

export type SaveCoursePersonalizationData = z.infer<typeof savePersonalizationSchema>;

export async function saveCoursePersonalization(
  courseId: string,
  data: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const userId = await getCurrentUserIdFromAuth();
    if (!userId) {
      return { success: false, error: "Не авторизован" };
    }

    const parsed = savePersonalizationSchema.safeParse(data);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = first.userDisplayName?.[0] ?? first.petName?.[0] ?? "Проверьте поля";
      return { success: false, error: msg };
    }

    const result = await saveCoursePersonalizationService(userId, courseId, parsed.data);

    if (result.success) {
      revalidateTag("training");
      revalidateTag("days");
      revalidateTag(`user-${userId}`);
      revalidatePath("/trainings/[courseType]", "page");
      revalidatePath("/trainings/[courseType]/[dayId]", "page");
    }
    return result;
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Ошибка saveCoursePersonalization",
      error instanceof Error ? error : new Error(String(error)),
      { courseId },
    );
    return { success: false, error: "Не удалось сохранить персонализацию" };
  }
}
