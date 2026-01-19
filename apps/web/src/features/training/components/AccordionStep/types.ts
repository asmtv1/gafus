// UI-специфичные типы для AccordionStep

export interface AccordionStepProps {
  step: {
    id: string;
    title: string;
    description: string;
    durationSec: number;
    videoUrl?: string | null;
    imageUrls: string[];
    pdfUrls: string[];
  };
  isExpanded: boolean;
  onToggle: () => void;
  onStart: () => void;
  onComplete: () => void;
  isActive: boolean;
  isCompleted: boolean;
  timeLeft: number;
  isPaused: boolean;
}
