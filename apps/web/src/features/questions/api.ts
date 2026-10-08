import { useCSRFStore } from "@gafus/csrf";
import {
  createQuestionsClient,
  type QuestionPhotoDto,
  type QuestionsTransport,
} from "@gafus/types";
export const questionsTransport: QuestionsTransport = async <T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
) => {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const store = useCSRFStore.getState();
    if (!store.isTokenValid()) await store.fetchToken();
    const token = useCSRFStore.getState().token;
    if (!token) throw new Error("Обновите страницу и попробуйте ещё раз");
    headers["X-CSRF-Token"] = token;
  }
  const form = options.body instanceof FormData;
  if (options.body && !form) headers["Content-Type"] = "application/json";
  const response = await fetch(
    `/api/v1/questions${path && !path.startsWith("?") ? "/" : ""}${path}`,
    {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: options.body
        ? form
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
    },
  );
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(result.error ?? "Не удалось выполнить запрос");
  return result.data as T;
};
export const questionsApi = createQuestionsClient(questionsTransport);
export async function uploadQuestionPhoto(file: File) {
  const form = new FormData();
  form.append("file", file);
  return questionsTransport<QuestionPhotoDto>("photos", { method: "POST", body: form });
}
export const discardQuestionPhoto = (id: string) =>
  questionsTransport(`photos/${id}`, { method: "DELETE" });
