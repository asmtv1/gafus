import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
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
    
    // Очищаем experimental_attachments из старых сообщений (они уже сохранены в БД)
    // Оставляем attachments только в последнем сообщении, если они есть и содержат url
    const processedMessages = messages.map((msg: any, index: number) => {
      const isLastMessage = index === messages.length - 1;
      // Для последнего сообщения проверяем, что attachments имеют url
      if (isLastMessage && msg.experimental_attachments) {
        // Фильтруем attachments, оставляя только те, у которых есть url
        const validAttachments = msg.experimental_attachments.filter((att: any) => att.url);
        if (validAttachments.length > 0) {
          return { ...msg, experimental_attachments: validAttachments };
        }
        // Если нет валидных attachments, убираем их
        const { experimental_attachments, ...rest } = msg;
        return rest;
      }
      // Для старых сообщений убираем attachments (они уже в БД)
      if (!isLastMessage && msg.experimental_attachments) {
        const { experimental_attachments, ...rest } = msg;
        return rest;
      }
      return msg;
    });
    
    // Логируем информацию о вложениях
    const lastMessage = processedMessages?.[processedMessages.length - 1];
    const hasAttachments = lastMessage?.experimental_attachments?.length > 0;
    const attachmentsInfo = hasAttachments ? lastMessage.experimental_attachments.map((att: any) => ({
      name: att.name,
      contentType: att.contentType,
      urlLength: att.url?.length || 0,
      urlPreview: att.url?.substring(0, 50) || "no url",
    })) : [];
    
    // Проверяем, что все вложения - изображения
    if (hasAttachments) {
      const nonImageAttachments = attachmentsInfo.filter((att: any) => !att.contentType?.startsWith("image/"));
      if (nonImageAttachments.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: "Разрешены только изображения. Файлы, которые не являются изображениями, не поддерживаются." 
          }),
          { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              ...corsHeaders,
            }
          }
        );
      }
    }
    
    const trainerId = session.user.id;

    // 1. Получаем конфигурацию
    const config = await prisma.trainerAIConfig.findUnique({
      where: { trainerId },
    });

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

    const useModel = selectedModel || config?.model || "meta-llama/llama-3.3-70b-instruct";
    
    // Проверяем, поддерживает ли модель изображения
    // Список моделей с поддержкой vision
    const visionModels = [
      "gpt-4-vision",
      "gpt-4o",
      "gpt-4-turbo",
      "claude-3",
      "claude-3.5",
      "claude-3-opus",
      "llama-3.2-vision",
      "llama-3.3-vision",
      "gemini-pro-vision",
      "gemini-1.5",
      "gemini-2.0-flash", // Gemini 2.0 Flash поддерживает vision
      "qwen-2.5-vl", // Qwen2.5-VL (Vision-Language)
      "qwen-2-vl", // Qwen2-VL
      "nemotron-nano", // Nemotron Nano с VL в названии
    ];
    const supportsVision = visionModels.some(vm => useModel.toLowerCase().includes(vm.toLowerCase()));
    
    // Модели без поддержки vision
    const nonVisionModels = [
      "llama", // Все модели Llama без vision в названии
      "deepseek-r1",
      "deepseek-chat",
      "mistral",
      "mixtral",
      "gemma", // Gemma без vision
      "molmo", // Molmo
    ];
    const isNonVisionModel = nonVisionModels.some(nvm => {
      const modelLower = useModel.toLowerCase();
      if (nvm === "llama") {
        return modelLower.includes("llama") && !modelLower.includes("vision");
      }
      return modelLower.includes(nvm.toLowerCase());
    });
    
    if (hasAttachments && (isNonVisionModel || !supportsVision)) {
      return new Response(
        JSON.stringify({ 
          error: `Модель ${useModel} не поддерживает работу с изображениями. Пожалуйста, выберите модель с поддержкой vision: Gemini 2.0 Flash (бесплатная)` 
        }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders,
          }
        }
      );
    }
    
    try {
      const result = streamText({
        model: openrouter(useModel),
        system: "Ты - помощник для кинолога (тренера собак). Отвечай профессионально и по делу. Ты можешь анализировать изображения и PDF документы, если они приложены к сообщению.",
        messages: processedMessages,
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
          
          const attachmentsMetadata = lastMessage?.experimental_attachments?.map((att: any) => ({
            name: att.name,
            contentType: att.contentType,
            size: att.size,
          })) || null;
          
          const userMessage = await prisma.trainerAIChat.create({
            data: {
              trainerId,
              role: "user",
              content: userContent,
              model: useModel,
              attachments: attachmentsMetadata || undefined,
            } as any,
          });
          
          await new Promise(resolve => setTimeout(resolve, 10));
          
          const assistantMessage = await prisma.trainerAIChat.create({
            data: {
              trainerId,
              role: "assistant",
              content: text,
              tokensUsed: usage.totalTokens,
              model: useModel,
            } as any,
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
    logger.error("Error in chat route", error as Error);
    return new Response("Internal Server Error", { 
      status: 500,
      headers: corsHeaders,
    });
  }
}
