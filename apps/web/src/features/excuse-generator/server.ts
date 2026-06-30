import { findExcuseSituation, type ExcuseSituation } from "./situations";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";
const DEFAULT_PLAUSIBILITY = 72;
const MIN_PLAUSIBILITY = 35;
const MAX_PLAUSIBILITY = 96;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

export interface GeneratedExcuse {
  excuse: string;
  plausibility: number;
  tone: string;
}

export type ExcuseGeneratorErrorCode =
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "UPSTREAM_ERROR";

export class ExcuseGeneratorError extends Error {
  constructor(
    public readonly code: ExcuseGeneratorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExcuseGeneratorError";
  }
}

export function normalizePlausibility(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_PLAUSIBILITY;
  return Math.min(MAX_PLAUSIBILITY, Math.max(MIN_PLAUSIBILITY, Math.round(numeric)));
}

export function parseOpenRouterContent(content: string): GeneratedExcuse {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ExcuseGeneratorError("UPSTREAM_ERROR", "OpenRouter вернул некорректный JSON.");
  }

  if (!isRecord(parsed)) {
    throw new ExcuseGeneratorError("UPSTREAM_ERROR", "OpenRouter вернул неожиданный формат.");
  }

  const excuse = typeof parsed.excuse === "string" ? parsed.excuse.trim() : "";
  const tone = typeof parsed.tone === "string" ? parsed.tone.trim() : "";

  if (excuse.length < 20) {
    throw new ExcuseGeneratorError("UPSTREAM_ERROR", "OpenRouter вернул слишком короткий ответ.");
  }

  return {
    excuse,
    plausibility: normalizePlausibility(parsed.plausibility),
    tone: tone || "убедительная",
  };
}

export async function generateExcuseForSituation(
  situationId: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<GeneratedExcuse> {
  const situation = findExcuseSituation(situationId);
  if (!situation) {
    throw new ExcuseGeneratorError("VALIDATION_ERROR", "Неизвестная ситуация.");
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ExcuseGeneratorError("CONFIGURATION_ERROR", "OpenRouter API key is not configured.");
  }

  const response = await fetchImpl(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://gafus.ru",
      "X-Title": "Gafus Excuse Generator",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Ты пишешь на русском языке. Верни только валидный JSON без markdown. Поля: excuse string, plausibility number от 1 до 100, tone string. Отмазка должна быть креативной, но бытовой и правдоподобной. Не советуй вредить людям, подделывать документы или обвинять других.",
        },
        {
          role: "user",
          content: buildPrompt(situation),
        },
      ],
      temperature: 0.85,
      max_tokens: 350,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new ExcuseGeneratorError(
      "UPSTREAM_ERROR",
      `OpenRouter request failed with status ${response.status}.`,
    );
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new ExcuseGeneratorError("UPSTREAM_ERROR", "OpenRouter вернул пустой ответ.");
  }

  return parseOpenRouterContent(content);
}

function buildPrompt(situation: ExcuseSituation): string {
  return [
    `Ситуация: пользователь ${situation.promptLabel}.`,
    situation.description,
    "Сгенерируй одну максимально убедительную и креативную отмазку в 2-4 предложениях.",
    "Тон: живой, взрослый, без канцелярита. Не делай отмазку слишком трагичной.",
    "plausibility оцени как развлекательную оценку убедительности.",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
