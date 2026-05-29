import type { ChecklistQuestion } from "@gafus/types";

const SUPPORTED_STEP_TYPES = new Set(["TRAINING", "EXAMINATION", "THEORY", "PRACTICE", "SURVEY"]);
const EXAMINATION_FLAG_FIELDS = [
  "requiresWrittenFeedback",
  "hasTestQuestions",
  "requiresVideoReport",
] as const;

export type DailyCourseImportStepType = "TRAINING" | "EXAMINATION" | "THEORY" | "PRACTICE" | "SURVEY";

export interface DailyCourseImportQuestion extends ChecklistQuestion {
  comment?: string;
}

export interface ParsedDailyCourseImportStep {
  order: number;
  title: string;
  type: DailyCourseImportStepType | string;
  durationSec: number | null;
  estimatedDurationSec: number | null;
  description: string;
  requiresWrittenFeedback: boolean | null;
  hasTestQuestions: boolean | null;
  requiresVideoReport: boolean | null;
  surveySlug: string | null;
  questions: DailyCourseImportQuestion[];
  errors: string[];
}

export interface ParsedDailyCourseImportDay {
  date: string;
  bundleTitle: string;
  type: string;
  equipment: string;
  description: string;
  steps: ParsedDailyCourseImportStep[];
  isEmpty: boolean;
  errors: string[];
}

export interface ParsedDailyCourseImportFile {
  days: ParsedDailyCourseImportDay[];
  hasErrors: boolean;
}

export function parseDailyCourseImportFile(content: string): ParsedDailyCourseImportFile {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const dayMatches = Array.from(normalized.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})(?:[,\s].*)?$/gim));

  const days = dayMatches.map((match, index): ParsedDailyCourseImportDay => {
    const next = dayMatches[index + 1];
    const block = normalized.slice(match.index! + match[0].length, next?.index).trim();
    return parseDayBlock(match[1], block);
  });

  return {
    days,
    hasErrors: days.some(
      (day) => day.errors.length > 0 || day.steps.some((step) => step.errors.length > 0),
    ),
  };
}

function parseDayBlock(date: string, block: string): ParsedDailyCourseImportDay {
  const bundleTitle = getBundleField(block, "Bundle title");
  const type = getBundleField(block, "type") || "daily_course";
  const equipment = getBundleField(block, "equipment");
  const description = getBundleField(block, "description");
  const steps = parseStepBlocks(block);
  const hasBundleFields = Boolean(
    bundleTitle || equipment || description || getBundleField(block, "type"),
  );
  const isEmpty = !hasBundleFields && steps.length === 0;
  const errors: string[] = [];

  if (!isEmpty) {
    if (!bundleTitle) errors.push("Название связки обязательно");
    if (!description) errors.push("Описание связки обязательно");
    if (steps.length < 2 || steps.length > 5) {
      errors.push("В дне должно быть от 2 до 5 шагов");
    }
  }

  return {
    date,
    bundleTitle,
    type,
    equipment,
    description,
    steps,
    isEmpty,
    errors,
  };
}

function parseStepBlocks(dayBlock: string): ParsedDailyCourseImportStep[] {
  const stepMatches = Array.from(dayBlock.matchAll(/^\*\*Шаг\s+(\d+)\*\*\s*$/gim));
  return stepMatches.map((match, index): ParsedDailyCourseImportStep => {
    const next = stepMatches[index + 1];
    const block = dayBlock.slice(match.index! + match[0].length, next?.index).trim();
    return parseStepBlock(Number(match[1]) || index + 1, block);
  });
}

function parseStepBlock(order: number, block: string): ParsedDailyCourseImportStep {
  const title = getScalarField(block, "title");
  const rawType = getScalarField(block, "type");
  const type = normalizeStepType(rawType);
  const durationSec = parseOptionalPositiveInt(getScalarField(block, "durationSec"));
  const estimatedDurationSec = parseOptionalPositiveInt(
    getScalarField(block, "estimatedDurationSec"),
  );
  const description = getStepDescription(block);
  const requiresWrittenFeedback = parseOptionalBoolean(
    getScalarField(block, "requiresWrittenFeedback"),
  );
  const hasTestQuestions = parseOptionalBoolean(getScalarField(block, "hasTestQuestions"));
  const requiresVideoReport = parseOptionalBoolean(getScalarField(block, "requiresVideoReport"));
  const surveySlug = getScalarField(block, "surveySlug") || null;
  const questions = parseQuestions(block);
  const errors: string[] = [];

  if (!title) errors.push("Название шага обязательно");
  if (!rawType) {
    errors.push("Тип шага обязателен");
  } else if (!SUPPORTED_STEP_TYPES.has(type)) {
    errors.push(`Тип ${rawType} не поддерживается`);
  }
  if (!description) errors.push("Описание шага обязательно");

  if (type === "TRAINING") {
    if (!durationSec) errors.push("Для тренировочного шага нужен durationSec");
    if (estimatedDurationSec)
      errors.push("Для TRAINING используйте durationSec, а не estimatedDurationSec");
  } else if (SUPPORTED_STEP_TYPES.has(type)) {
    if (!estimatedDurationSec) errors.push("Для этого типа шага нужен estimatedDurationSec");
    if (durationSec) errors.push("durationSec поддерживается только для TRAINING");
  }

  if (type === "SURVEY" && !surveySlug) {
    errors.push("Для анкетного шага нужен surveySlug");
  }

  const hasAnyExamFlagField = EXAMINATION_FLAG_FIELDS.some((field) => hasScalarField(block, field));
  if (type === "EXAMINATION") {
    if (!EXAMINATION_FLAG_FIELDS.every((field) => hasScalarField(block, field))) {
      errors.push(
        "Для экзаменационного шага нужны requiresWrittenFeedback, hasTestQuestions и requiresVideoReport",
      );
    }
    if (![requiresWrittenFeedback, hasTestQuestions, requiresVideoReport].some(Boolean)) {
      errors.push(
        "Экзаменационный шаг должен содержать хотя бы один тип проверки: тестовые вопросы, письменный ответ или видеоотчёт",
      );
    }
    if (hasTestQuestions && questions.length === 0) {
      errors.push("Для hasTestQuestions: true нужен блок questions");
    }
    if (hasTestQuestions === false && questions.length > 0) {
      errors.push("Блок questions нельзя указывать при hasTestQuestions: false");
    }
  } else if (hasAnyExamFlagField) {
    errors.push("Поля экзамена разрешены только для EXAMINATION");
  }

  for (const [index, question] of questions.entries()) {
    if (!question.question) errors.push(`Вопрос ${index + 1}: текст обязателен`);
    if (question.options.length < 2) errors.push(`Вопрос ${index + 1}: нужно минимум 2 варианта`);
    if (
      !Number.isInteger(question.correctAnswer) ||
      question.correctAnswer < 0 ||
      question.correctAnswer >= question.options.length
    ) {
      errors.push(`Вопрос ${index + 1}: correctAnswer должен указывать на существующий вариант`);
    }
  }

  return {
    order,
    title,
    type,
    durationSec,
    estimatedDurationSec,
    description,
    requiresWrittenFeedback,
    hasTestQuestions,
    requiresVideoReport,
    surveySlug,
    questions,
    errors,
  };
}

function getBundleField(block: string, field: string): string {
  const escaped = escapeRegExp(field);
  const match = block.match(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.*?)\\s*$`, "im"));
  return cleanInlineValue(match?.[1] ?? "");
}

function getScalarField(block: string, field: string): string {
  const escaped = escapeRegExp(field);
  const match = block.match(new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, "im"));
  return cleanInlineValue(match?.[1] ?? "");
}

function hasScalarField(block: string, field: string): boolean {
  return new RegExp(`^${escapeRegExp(field)}:\\s*`, "im").test(block);
}

function getStepDescription(block: string): string {
  const lines = block.split("\n");
  const descriptionIndex = lines.findIndex((line) => /^description:\s*$/i.test(line.trim()));
  if (descriptionIndex < 0) return "";
  const questionsIndex = lines.findIndex(
    (line, index) => index > descriptionIndex && /^questions:\s*$/i.test(line.trim()),
  );
  const raw = lines
    .slice(descriptionIndex + 1, questionsIndex < 0 ? undefined : questionsIndex)
    .join("\n");
  return stripMarkdownFence(raw.trim());
}

function parseQuestions(block: string): DailyCourseImportQuestion[] {
  const lines = block.split("\n");
  const questionsIndex = lines.findIndex((line) => /^questions:\s*$/i.test(line.trim()));
  if (questionsIndex < 0) return [];

  const questions: DailyCourseImportQuestion[] = [];
  let current: DailyCourseImportQuestion | null = null;
  let inOptions = false;

  const pushCurrent = () => {
    if (current) questions.push(current);
  };

  for (const rawLine of lines.slice(questionsIndex + 1)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    const questionMatch = trimmed.match(/^-\s+question:\s*(.*)$/i);
    if (questionMatch) {
      pushCurrent();
      current = {
        id: `q${questions.length + 1}`,
        question: cleanInlineValue(questionMatch[1]),
        options: [],
        correctAnswer: -1,
      };
      inOptions = false;
      continue;
    }

    if (!current) continue;

    if (/^options:\s*$/i.test(trimmed)) {
      inOptions = true;
      continue;
    }

    if (inOptions) {
      const optionMatch = trimmed.match(/^-\s+(.*)$/);
      if (optionMatch) {
        current.options.push(cleanInlineValue(optionMatch[1]));
        continue;
      }
    }

    const correctAnswerMatch = trimmed.match(/^correctAnswer:\s*(\d+)\s*$/i);
    if (correctAnswerMatch) {
      current.correctAnswer = Number(correctAnswerMatch[1]);
      inOptions = false;
      continue;
    }

    const commentMatch = trimmed.match(/^comment:\s*(.*)$/i);
    if (commentMatch) {
      current.comment = cleanInlineValue(commentMatch[1]);
      inOptions = false;
    }
  }

  pushCurrent();
  return questions;
}

function normalizeStepType(value: string): DailyCourseImportStepType | string {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "training":
    case "тренировочный":
    case "тренеровочный":
      return "TRAINING";
    case "examination":
    case "экзаменационный":
      return "EXAMINATION";
    case "theory":
    case "теоретический":
    case "теоритический":
      return "THEORY";
    case "practice":
    case "тренировочный без таймера":
    case "тренеровочный без таймера":
      return "PRACTICE";
    default:
      return value.trim().toUpperCase();
  }
}

function parseOptionalPositiveInt(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalBoolean(value: string): boolean | null {
  if (!value) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

function stripMarkdownFence(value: string): string {
  const trimmed = stripMatchingOuterQuote(value.trim(), { includeBacktick: false });
  const fenced = trimmed.match(/^```[a-z0-9_-]*\s*\n([\s\S]*?)\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function cleanInlineValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("\n")) return trimmed;
  return stripMatchingOuterQuote(trimmed);
}

function stripMatchingOuterQuote(
  value: string,
  options: { includeBacktick?: boolean } = { includeBacktick: true },
): string {
  if (
    value.length >= 2 &&
    (((options.includeBacktick ?? true) && value.startsWith("`") && value.endsWith("`")) ||
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
