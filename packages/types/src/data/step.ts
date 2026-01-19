// Данные шагов тренировок (БЕЗ UI-специфичных полей)

export interface StepData {
  id: string;
  title: string;
  description: string;
  durationSec: number | null;
  estimatedDurationSec: number | null;
  videoUrl: string | null;
  imageUrls: string[];
  pdfUrls: string[];
  type: string;
  requiresVideoReport: boolean;
  requiresWrittenFeedback: boolean;
  hasTestQuestions: boolean;
}

export interface StepFormData {
  title: string;
  description: string;
  durationSec: number;
  imageUrls: string[];
  pdfUrls: string[];
  videoUrl?: string;
}

// Типы для работы со шагами в панели тренера
export type Order = "asc" | "desc";

export interface TrainerStep {
  id: string;
  title: string;
  description: string;
  type: string;
  timer?: number | null;
  embedUrl?: string | null;
  repetitions?: number | null;
  content?: string | null;
  createdAt: Date;
  createdBy: string;
  isPublic: boolean;
  createdByUsername?: string;
}
