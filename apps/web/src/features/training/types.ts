// Feature-level типы для training

export interface TrainingStepListProps {
  steps: {
    id: string;
    title: string;
    description: string;
    durationSec: number;
    videoUrl?: string | null;
    imageUrls: string[];
    pdfUrls: string[];
  }[];
  onStepStart: (stepId: string) => void;
  onStepComplete: (stepId: string) => void;
  activeStepId?: string;
  completedStepIds: string[];
}

export interface TrainingDayListProps {
  days: {
    id: string;
    title: string;
    order: number;
    steps: {
      id: string;
      title: string;
      description: string;
      durationSec: number;
    }[];
  }[];
  onDaySelect: (dayId: string) => void;
  selectedDayId?: string;
}

export interface CourseStepProps {
  step: {
    id: string;
    title: string;
    description: string;
  };
  onStepComplete: (stepId: string) => void;
  isCompleted: boolean;
}
