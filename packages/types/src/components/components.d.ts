import type { BaseUser } from "./common";
import type { TrainingDay } from "../data/training";
export type UserSearchSelectorUser = BaseUser;
export interface TrainingDayFormProps {
    dayId?: string;
    onDayCreated?: (day: TrainingDay) => void;
}
export interface CreateDayClientStep {
    id: string;
    title: string;
    description: string;
    type: string;
}
export interface CreateDayClientProps {
    visibleSteps: CreateDayClientStep[];
    onDayCreated?: (day: TrainingDay) => void;
}
//# sourceMappingURL=components.d.ts.map