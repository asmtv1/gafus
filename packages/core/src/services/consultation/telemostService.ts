import { createWebLogger } from "@gafus/logger";

import { TelemostUnavailableError } from "./errors";

const logger = createWebLogger("core-consultation-telemost");

/** Ответ API Яндекс Телемост (поля могут отличаться — см. актуальную документацию). */
interface TelemostConferenceResponse {
  id?: string;
  join_url?: string;
  watch_url?: string;
}

function telemostConferencesUrl(): string {
  const base = (
    process.env.YANDEX_TELEMOST_API_BASE_URL ?? "https://cloud-api.yandex.net/v1"
  ).replace(/\/+$/, "");
  return `${base}/telemost-api/conferences`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Создать конференцию Телемост. Ретраи только на 429/502/503/504.
 */
export async function createTelemostConference(options?: {
  requestId?: string;
}): Promise<{ id: string; joinUrl: string; watchUrl: string | null }> {
  const token = process.env.YANDEX_TELEMOST_OAUTH_TOKEN;
  if (!token) {
    logger.error("YANDEX_TELEMOST_OAUTH_TOKEN не задан", new Error("missing token"));
    throw new TelemostUnavailableError("Видеоконференция временно недоступна");
  }

  const waitingRoom = process.env.YANDEX_TELEMOST_WAITING_ROOM_LEVEL ?? "PUBLIC";

  const headers: Record<string, string> = {
    Authorization: `OAuth ${token}`,
    "Content-Type": "application/json",
  };
  if (options?.requestId) {
    headers["X-Request-Id"] = options.requestId;
  }

  const body = JSON.stringify({
    waiting_room_level: waitingRoom,
  });

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const backoff = attempt === 1 ? 500 : 1500;
      await sleep(backoff);
    }

    let res: Response;
    try {
      res = await fetch(telemostConferencesUrl(), {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      logger.warn("Telemost fetch error", { attempt, error: String(e) });
      lastStatus = 0;
      continue;
    }

    lastStatus = res.status;
    if (res.status === 401 || res.status === 403) {
      logger.error("Telemost auth error", new Error(`HTTP ${res.status}`));
      throw new TelemostUnavailableError("Ошибка авторизации Телемост");
    }

    if ([429, 502, 503, 504].includes(res.status)) {
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("Telemost HTTP error", { status: res.status, text: text.slice(0, 200) });
      throw new TelemostUnavailableError("Не удалось создать видеоконференцию");
    }

    const json = (await res.json()) as TelemostConferenceResponse;
    const id = json.id;
    const joinUrl = json.join_url;
    if (!id || !joinUrl) {
      logger.error("Telemost unexpected body", new Error("missing id or join_url in response"));
      throw new TelemostUnavailableError("Не удалось создать видеоконференцию");
    }

    return {
      id,
      joinUrl,
      watchUrl: json.watch_url ?? null,
    };
  }

  logger.warn("Telemost retries exhausted", { lastStatus });
  throw new TelemostUnavailableError("Не удалось создать видеоконференцию, попробуйте позже");
}
