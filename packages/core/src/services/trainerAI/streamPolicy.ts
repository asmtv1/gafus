import { isSupportedTrainerAIModel, TRAINER_AI_SUPPORTED_MODELS } from "./modelPolicy";

const DEFAULT_MODEL: string = TRAINER_AI_SUPPORTED_MODELS[0];

export class TrainerAIStreamValidationError extends Error {
  constructor(message: string) { super(message); this.name = "TrainerAIStreamValidationError"; }
}

/** Validate requested model against the exact allowlist used by settings. */
export function resolveTrainerAIStreamModel(requested: unknown, configured?: string | null): string {
  if (requested !== null && requested !== undefined && requested !== "") {
    if (typeof requested !== "string" || !isSupportedTrainerAIModel(requested)) {
      throw new TrainerAIStreamValidationError("Неподдерживаемая модель OpenRouter");
    }
    return requested;
  }
  const fallback = configured || DEFAULT_MODEL;
  if (!isSupportedTrainerAIModel(fallback)) {
    throw new TrainerAIStreamValidationError("Неподдерживаемая модель OpenRouter");
  }
  return fallback;
}

/** Core owns message/attachment business validation; transport handles streaming. */
export function normalizeTrainerAIStreamMessages(input: unknown) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new TrainerAIStreamValidationError("Некорректная история сообщений");
  }
  const messages = input.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new TrainerAIStreamValidationError("Некорректное сообщение");
    }
    const message = raw as Record<string, unknown>;
    if (message.role !== "user" && message.role !== "assistant") {
      throw new TrainerAIStreamValidationError("Недопустимая роль сообщения");
    }
    if (typeof message.content !== "string" && !Array.isArray(message.content)) {
      throw new TrainerAIStreamValidationError("Некорректное содержимое сообщения");
    }
    const { experimental_attachments: rawAttachments, ...rest } = message;
    if (index !== input.length - 1 || rawAttachments === undefined) return rest;
    if (!Array.isArray(rawAttachments) || rawAttachments.length > 10) {
      throw new TrainerAIStreamValidationError("Некорректные вложения");
    }
    const attachments = rawAttachments.filter((attachment: unknown) => {
      if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) return false;
      const a = attachment as Record<string, unknown>;
      return typeof a.url === "string" && a.url.length > 0;
    });
    for (const rawAttachment of attachments) {
      const attachment = rawAttachment as Record<string, unknown>;
      if (typeof attachment.contentType !== "string"
        || !attachment.contentType.startsWith("image/")) {
        throw new TrainerAIStreamValidationError("Разрешены только изображения");
      }
      try {
        const url = new URL(attachment.url as string);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("URL protocol");
      } catch {
        throw new TrainerAIStreamValidationError("Некорректная ссылка на изображение");
      }
    }
    return attachments.length > 0 ? { ...rest, experimental_attachments: attachments } : rest;
  });
  if (messages.at(-1)?.role !== "user") {
    throw new TrainerAIStreamValidationError("Последнее сообщение должно быть от пользователя");
  }
  return messages;
}

/** Supported models currently have no vision capability. Keep policy explicit. */
export function trainerAIModelSupportsImages(_model: string): boolean {
  // No model is currently approved for image input; fail closed.
  return false;
}
