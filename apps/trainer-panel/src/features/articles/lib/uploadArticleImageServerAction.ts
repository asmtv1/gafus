"use server";

import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";

import { getArticleImagePath, uploadFileToCDN } from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { validateImageUpload } from "@gafus/core/services/common";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("trainer-panel-upload-article-image");

export async function uploadArticleImageServerAction(
  formData: FormData,
  articleId?: string,
): Promise<string> {
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
  const articleIdOrDraft = articleId ?? "draft";
  const relativePath = getArticleImagePath(session.user.id, articleIdOrDraft, uuid, ext);

  const fileUrl = await uploadFileToCDN(file, relativePath);
  logger.info("Изображение статьи загружено в CDN", { path: relativePath });
  return fileUrl;
}
