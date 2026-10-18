import {
  createQuestionsClient,
  type QuestionPhotoDto,
  type QuestionsTransport,
} from "@gafus/types";
import { apiClient, apiClientMultipart } from "./client";
const transport: QuestionsTransport = async <T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
) => {
  const response = await apiClient<T>(
    `/api/v1/questions${path && !path.startsWith("?") ? "/" : ""}${path}`,
    { ...options, suppressSubscriptionPaywall: true },
  );
  if (!response.success || response.data === undefined)
    throw new Error(response.error ?? "Не удалось выполнить запрос");
  return response.data;
};
export const questionsApi = createQuestionsClient(transport);
export async function uploadQuestionPhoto(uri: string) {
  const result = await apiClientMultipart<QuestionPhotoDto>("/api/v1/questions/photos", () => {
    const form = new FormData();
    form.append("file", { uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
    return form;
  }, { "X-Gafus-Questions-Async": "1" });
  if (!result.success || !result.data) throw new Error(result.error ?? "Не удалось загрузить фото");
  if (result.data.url) return result.data;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const ready = await transport<QuestionPhotoDto>(`photos/${encodeURIComponent(result.data.id)}`);
    if (ready.url) return ready;
  }
  throw new Error("Обработка фото задерживается. Попробуйте загрузить его позже");
}
export const discardQuestionPhoto = (id: string) => transport(`photos/${id}`, { method: "DELETE" });
