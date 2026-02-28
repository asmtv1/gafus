import { createWorkerLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import type { PushSubscriptionJSON } from "./partitionPushSubscriptions";

const logger = createWorkerLogger("rustore-push");

const SERVICE_TOKEN = process.env.RUSTORE_PUSH_SERVICE_TOKEN;
const PROJECT_ID = process.env.RUSTORE_PROJECT_ID;

const RUSTORE_API_URL = "https://vkpns-universal.rustore.ru/v1/send";

const DELETABLE_ERROR_CODES = new Set(["DeviceNotRegistered", "InvalidCredentials", "invalid"]);

function shouldDeleteByCode(code?: string): boolean {
  return Boolean(code && DELETABLE_ERROR_CODES.has(code));
}

export interface RustoreSendResult {
  successCount: number;
  failureCount: number;
  deletedCount: number;
  temporaryFailureCount: number;
}

async function deleteInvalidSubscriptions(endpoints: string[]): Promise<number> {
  if (endpoints.length === 0) return 0;
  const result = await prisma.pushSubscription.deleteMany({
    where: { endpoint: { in: endpoints } },
  });
  return result.count;
}

export async function sendRustorePushNotifications(
  subscriptions: PushSubscriptionJSON[],
  payload: { title: string; body: string; url: string },
): Promise<RustoreSendResult> {
  const endpoints = subscriptions
    .map((s) => s.endpoint)
    .filter((e) => e != null && String(e).trim() !== "");

  if (endpoints.length === 0) {
    return { successCount: 0, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0 };
  }

  if (!SERVICE_TOKEN || !PROJECT_ID) {
    logger.warn("RuStore push не настроен: RUSTORE_PUSH_SERVICE_TOKEN или RUSTORE_PROJECT_ID отсутствуют");
    return { successCount: 0, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0 };
  }

  let successCount = 0;
  let failureCount = 0;
  let temporaryFailureCount = 0;
  const invalidEndpoints = new Set<string>();

  try {
    const response = await fetch(RUSTORE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providers: { rustore: { project_id: PROJECT_ID, auth_token: SERVICE_TOKEN } },
        tokens: { rustore: endpoints },
        message: {
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url },
        },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const bodyText = await response.text();
      logger.error("RuStore API ошибка", new Error(`HTTP ${status}`), {
        status,
        bodyPreview: bodyText.substring(0, 200),
        endpointCount: endpoints.length,
      });
      if (status === 401) {
        logger.warn("RuStore 401 — проверьте RUSTORE_PUSH_SERVICE_TOKEN");
      }
      return {
        successCount: 0,
        failureCount: endpoints.length,
        deletedCount: 0,
        temporaryFailureCount: endpoints.length,
      };
    }

    const data = (await response.json()) as {
      results?: Array<{ token?: string; status?: string; error?: string }>;
    };

    const results = data?.results ?? [];
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const token = item?.token ?? endpoints[i];
      if (item?.status === "ok" || item?.status === "success") {
        successCount++;
      } else {
        failureCount++;
        const code = item?.error ?? item?.status;
        if (shouldDeleteByCode(code)) {
          invalidEndpoints.add(token);
        } else {
          temporaryFailureCount++;
        }
      }
    }

    if (results.length === 0 && endpoints.length > 0) {
      failureCount = endpoints.length;
      temporaryFailureCount = endpoints.length;
    }
  } catch (networkError) {
    logger.error("RuStore API network error", networkError as Error);
    return {
      successCount: 0,
      failureCount: endpoints.length,
      deletedCount: 0,
      temporaryFailureCount: endpoints.length,
    };
  }

  const deletedCount = await deleteInvalidSubscriptions(Array.from(invalidEndpoints));

  logger.info("RuStore push batch completed", {
    total: endpoints.length,
    successCount,
    failureCount,
    temporaryFailureCount,
    deletedCount,
  });

  return {
    successCount,
    failureCount,
    deletedCount,
    temporaryFailureCount,
  };
}
