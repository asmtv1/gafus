"use server";

import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";

import { getArticleImagePath, uploadFileToCDN } from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { validateImageUpload } from "@gafus/core/services/common";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

const logger = createTrainerPanelLogger("trainer-panel-upload-article-logo");

export async function uploadArticleLogoServerAction(
  formData: FormData,
  articleId: string,
): Promise<string> {
  try {
    const file = formData.get("image") as File | null;
    if (!file || file.size === 0) {
      throw new Error("Файл не получен или пуст");
    }

    const validation = validateImageUpload(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error("Не авторизован");
    }

    const ext = file.name.split(".").pop() || "jpg";
    const uuid = randomUUID();
    const relativePath = getArticleImagePath(session.user.id, articleId, uuid, ext);

    const fileUrl = await uploadFileToCDN(file, relativePath);
    logger.info("Логотип статьи загружен в CDN", { path: relativePath });
    return fileUrl;
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "uploadArticleLogoServerAction failed",
      error instanceof Error ? error : new Error(String(error)),
      { articleId },
    );
    throw error;
  }
}
