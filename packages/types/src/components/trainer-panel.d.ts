export interface TrainerUser {
    id: string;
    username: string;
}
export interface TrainerDay {
    id: string;
    title: string;
}
export interface TrainerCourseFormData {
    name: string;
    shortDesc: string;
    description: string;
    duration: string;
    videoUrl: string;
    logoImg: string;
    isPublic: boolean;
    trainingDays: string[];
    allowedUsers: string[];
    equipment: string;
    trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}
export interface TrainerStepTableRow {
    id: string;
    title: string;
    description: string;
    durationSec: number;
    stepLinks: {
        order: number;
        day: {
            id: string;
            title: string;
            dayLinks: {
                course: {
                    id: string;
                    name: string;
                };
            }[];
        };
    }[];
}
export interface TrainerDayTableRow {
    id: string;
    title: string;
    description?: string;
    type: string;
    stepLinks?: {
        step: {
            id: string;
            title: string;
        };
    }[];
    dayLinks?: {
        course: {
            id: string;
            name: string;
        };
    }[];
}
export type UserSearchItem = TrainerUser;
export interface IdTitleItem {
    id: string;
    title: string;
}
//# sourceMappingURL=trainer-panel.d.ts.map