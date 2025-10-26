export interface TrainingOverviewProps {
    title: string;
    description: string;
    duration: number;
}
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
export interface CourseDescriptionWithVideoProps {
    embedUrl?: string;
    description: string;
}
