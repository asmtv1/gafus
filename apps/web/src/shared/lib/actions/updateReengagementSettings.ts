"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  updateReengagementSettings as updateReengagementSettingsCore,
  getReengagementSettings as getReengagementSettingsCore,
} from "@gafus/core/services/reengagement";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("update-reengagement-settings");

export async function updateReengagementSettings(
  enabled: boolean,
  preferredTime?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Необходимо войти в систему" };
    }
    return await updateReengagementSettingsCore(
      session.user.id,
      enabled,
      preferredTime ?? null,
    );
  } catch (error) {
    logger.error("Ошибка обновления настроек re-engagement", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

export async function getReengagementSettings(): Promise<{
  success: boolean;
  data?: { enabled: boolean; preferredTime: string | null };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Необходимо войти в систему" };
    }
    return await getReengagementSettingsCore(session.user.id);
  } catch (error) {
    logger.error("Ошибка получения настроек re-engagement", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
