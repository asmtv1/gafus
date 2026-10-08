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
  });
  if (!result.success || !result.data) throw new Error(result.error ?? "Не удалось загрузить фото");
  return result.data;
}
export const discardQuestionPhoto = (id: string) => transport(`photos/${id}`, { method: "DELETE" });
