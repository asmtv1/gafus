import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getServerSession } from "next-auth";
import {
  saveTrainerAIExchange, getTrainerAIConfigForStream,
  resolveTrainerAIStreamModel, normalizeTrainerAIStreamMessages,
  trainerAIModelSupportsImages, TrainerAIStreamValidationError,
} from "@gafus/core";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { decryptApiKey } from "@/features/ai-chat/lib/encryption";

const logger = createTrainerPanelLogger("api-chat-stream");

// Обработка OPTIONS запросов для CORS preflight
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: Request) {
  // CORS заголовки для безопасности (хотя same-origin запросы не требуют CORS)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const { messages, model: selectedModel } = await req.json();
    const processedMessages = normalizeTrainerAIStreamMessages(messages);
    const lastMessage = processedMessages[processedMessages.length - 1];
    const lastAttachments = "experimental_attachments" in lastMessage
      ? lastMessage.experimental_attachments as Record<string, unknown>[]
      : [];
    const hasAttachments = lastAttachments.length > 0;
    const attachmentsInfo = lastAttachments.map(attachment => ({
      name: attachment.name, contentType: attachment.contentType, size: attachment.size,
    }));

    const trainerId = session.user.id;

    // 1. Получаем конфигурацию
    const config = await getTrainerAIConfigForStream(trainerId);

    const hasCommonApiKey = !!process.env.OPENROUTER_API_KEY;
    const isEnabled = config ? config.enabled : true;

    if (!isEnabled && !hasCommonApiKey) {
      return new Response("AI Chat is disabled", { status: 403, headers: corsHeaders });
    }

    // 2. Получаем API ключ
    let apiKey: string;
    if (config?.apiKey) {
      try {
        apiKey = decryptApiKey(config.apiKey);
      } catch (error) {
        logger.error("Failed to decrypt individual API key", error as Error, { trainerId });
        return new Response("Encryption error", { status: 500, headers: corsHeaders });
      }
    } else {
      apiKey = process.env.OPENROUTER_API_KEY || "";
      if (!apiKey) {
        logger.error("API key not configured", new Error("OPENROUTER_API_KEY is missing"), { trainerId });
        return new Response("API Key not configured", { status: 500, headers: corsHeaders });
      }
    }

    // 3. Настраиваем провайдер OpenRouter через createOpenAI с baseURL
    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });

    const useModel = resolveTrainerAIStreamModel(selectedModel, config?.model);
    if (hasAttachments && !trainerAIModelSupportsImages(useModel)) {
      return new Response(
        JSON.stringify({ error: "Выбранная модель не поддерживает изображения" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    try {
      const result = streamText({
        model: openrouter(useModel),
        system: "Ты - помощник для кинолога (тренера собак). Отвечай профессионально и по делу. Ты можешь анализировать изображения и PDF документы, если они приложены к сообщению.",
        messages: processedMessages as unknown as Parameters<typeof streamText>[0]["messages"],
        maxSteps: 1,
        providerOptions: {
          openrouter: {
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://gafus.ru",
            "X-Title": "Gafus Trainer Panel",
          },
        },
        onFinish: async ({ text, usage }) => {
        try {
          const lastMessage = processedMessages[processedMessages.length - 1];
          const userContent = lastMessage?.content;
          
          const attachmentsMetadata = hasAttachments
            ? attachmentsInfo.map(att => ({
                name: typeof att.name === "string" ? att.name : undefined,
                contentType: typeof att.contentType === "string" ? att.contentType : undefined,
                size: typeof att.size === "number" ? att.size : undefined,
              }))
            : null;
          
          await saveTrainerAIExchange({
            trainerId,
            content: typeof userContent === "string" ? userContent : JSON.stringify(userContent ?? ""),
            reply: text,
            model: useModel,
            tokensUsed: usage.totalTokens,
            attachments: attachmentsMetadata,
          });
          
          logger.success("Stream finished and messages saved", {
            trainerId,
            model: useModel,
            tokensUsed: usage.totalTokens,
            hasAttachments: !!attachmentsMetadata,
          });
        } catch (error) {
          logger.error("Failed to save chat history after stream", error as Error, { trainerId });
        }
      },
      });

      try {
        const response = result.toDataStreamResponse();
        
        if (!response.body) {
          logger.error("Stream body is missing", new Error("Response body is null"), { model: useModel, hasAttachments });
          return new Response(
            JSON.stringify({ error: "Ошибка: stream body отсутствует" }),
            { 
              status: 500, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders,
              } 
            }
          );
        }
        
        // Добавляем CORS заголовки к stream response
        const headers = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value);
        });
        
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      } catch (responseError) {
        logger.error("Error creating stream response", responseError as Error, {
          model: useModel,
          hasAttachments,
        });
        throw responseError;
      }
    } catch (streamError) {
      logger.error("Error in streamText", streamError as Error, {
        hasAttachments,
        attachmentsCount: attachmentsInfo.length,
      });
      
      return new Response(
        JSON.stringify({ 
          error: "Ошибка при обработке запроса с вложениями. Проверьте формат и размер файлов." 
        }),
        { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders,
          }
        }
      );
    }
  } catch (error) {
    if (error instanceof TrainerAIStreamValidationError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    logger.error("Error in chat route", error as Error);
    return new Response("Internal Server Error", { 
      status: 500,
      headers: corsHeaders,
    });
  }
}
