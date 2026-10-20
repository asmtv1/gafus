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
  const uploaded = await questionsTransport<QuestionPhotoDto & {processing?: boolean}>(
    "photos", { method: "POST", body: form });
  if (uploaded.url) return uploaded;
  // A private source is never rendered. Only completed WebP may be attached.
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const result = await questionsTransport<QuestionPhotoDto & {processing?: boolean}>(
      `photos/${encodeURIComponent(uploaded.id)}`);
    if (result.url) return result;
  }
  throw new Error("Обработка фото задерживается. Попробуйте загрузить его позже");
}
export const discardQuestionPhoto = (id: string) =>
  questionsTransport(`photos/${id}`, { method: "DELETE" });
