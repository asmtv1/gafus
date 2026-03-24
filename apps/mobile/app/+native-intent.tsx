/**
 * Перехват native intents/deep links.
 * VK OAuth возвращает vk{clientId}://vk.ru/... — expo-router пытается навигировать по этому URL
 * и показывает 404. Возвращаем /(auth)/welcome чтобы остаться на auth экране;
 * useVkLogin обрабатывает redirect через Linking.
 */
import { reportClientError } from "@/shared/lib/tracer";

/* eslint-disable @gafus/require-client-catch-tracer -- защитный обёрточный catch + явный warning в Tracer */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (!path || typeof path !== "string") return path;
    // VK redirect: vk54472653://vk.ru/blank.html или vk123://vk.ru?code=...
    if (path.includes("vk.ru")) {
      return "/(auth)/welcome";
    }
    return path;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "nativeIntent",
      severity: "warning",
      keys: { operation: "redirect_system_path" },
    });
    return "/(auth)/welcome";
  }
}
/* eslint-enable @gafus/require-client-catch-tracer */
