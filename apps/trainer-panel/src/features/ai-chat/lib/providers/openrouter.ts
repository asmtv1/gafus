import { retryWithBackoff } from "@gafus/core/utils/retry";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("ai-provider-openrouter");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const CONNECTION_TIMEOUT = 30000; // 30 секунд
const INFERENCE_TIMEOUT = 120000; // 2 минуты

// Поддерживаемые модели на OpenRouter
const SUPPORTED_MODELS = [
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-r1",
  "meta-llama/llama-3.1-405b-instruct",
] as const;

const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";

interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OpenRouterResponse {
  choices: {
    message: {
      role: string;
      content: string;
    };
  }[];
  usage?: {
    total_tokens: number;
  };
}

export async function callOpenRouterAPI(
  apiKey: string,
  messages: OpenRouterMessage[],
  model: string = DEFAULT_MODEL,
): Promise<{ content: string; tokensUsed?: number }> {
  // Если модель не из списка поддерживаемых, используем дефолтную
  const useModel = SUPPORTED_MODELS.includes(model as (typeof SUPPORTED_MODELS)[number])
    ? model
    : DEFAULT_MODEL;

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const connectionTimeoutId = setTimeout(() => {
        controller.abort();
      }, CONNECTION_TIMEOUT);

      const inferenceTimeoutId = setTimeout(() => {
        controller.abort();
      }, INFERENCE_TIMEOUT);

      try {
        const response = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://gafus.ru", // Для OpenRouter
            "X-Title": "Gafus Trainer Panel", // Для OpenRouter
          },
          body: JSON.stringify({
            model: useModel,
            messages,
            stream: false,
          }),
          signal: controller.signal,
        });

        clearTimeout(connectionTimeoutId);
        clearTimeout(inferenceTimeoutId);

        if (!response.ok) {
          let errorData: { error?: { message?: string } } = {};
          try {
            errorData = await response.json();
          } catch {
            // Игнорируем ошибки парсинга JSON
          }

          if (response.status === 401) {
            throw new Error("Неверный API ключ OpenRouter. Проверьте настройки.");
          }

          if (response.status === 400) {
            throw new Error(errorData.error?.message || "Некорректный запрос к OpenRouter API");
          }

          if (response.status === 429) {
            throw new Error("Превышен лимит запросов OpenRouter. Попробуйте позже.");
          }

          if (response.status >= 500) {
            throw new Error("Ошибка сервера OpenRouter API. Попробуйте позже.");
          }

          throw new Error(
            errorData.error?.message || `Ошибка API: ${response.status} ${response.statusText}`,
          );
        }

        const data: OpenRouterResponse = await response.json();

        if (!data || !data.choices || data.choices.length === 0) {
          throw new Error("Пустой ответ от OpenRouter API");
        }

        const content = data.choices[0]?.message?.content?.trim();
        if (!content) {
          throw new Error("Пустой ответ от OpenRouter API: нет content в message");
        }

        return {
          content,
          tokensUsed: data.usage?.total_tokens,
        };
      } catch (error) {
        clearTimeout(connectionTimeoutId);
        clearTimeout(inferenceTimeoutId);

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Превышено время ожидания ответа от OpenRouter API");
        }

        throw error;
      }
    },
    {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      onRetry: (attempt, error) => {
        logger.warn(`Retry ${attempt}/3 для OpenRouter API`, {
          attempt,
          error: error.message,
        });
      },
    },
  );
}
