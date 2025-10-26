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
export interface EnhancedStepsTableProps {
    steps: TrainerStep[];
    onStepUpdated: () => void;
}
