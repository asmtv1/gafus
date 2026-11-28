/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */

/** Core-facing public use case contract, derived from the existing server
 * return signatures at migration checkpoint. Keep matching via TypeScript at
 * the API composition boundary; no Core import of server implementation. */
import type { TrainingStatus, TrainingDetail, UserCoursePersonalization } from "@gafus/types";
export type MonetizedAccessPlatform = "ANDROID" | "IOS" | "WEB_DESKTOP" | "WEB_TOUCH";
export type RewardedTargetInput = {
    targetType: "ARTICLE" | "COURSE_STEP" | "DAILY_COURSE_STEP" | "CONSULTATION_BOOKING";
    targetId: string;
    cost?: number;
};
export type PremiumOrRewardedAccessDto = {
    allowed: boolean;
    source: "GATING_DISABLED" | "PREMIUM" | "REWARDED" | "GAFUS";
    skippedDueToPremium: boolean;
    target: RewardedTargetInput;
};
export type StepOperation = {
    type: "start";
    remainingSec?: number;
} | {
    type: "pause";
    remainingSec: number;
} | {
    type: "resume";
} | {
    type: "reset";
} | {
    type: "complete";
};
export type StepOccurrenceBinding = {
    expectedStepOnDayId: string;
    expectedStepId: string;
    expectedCourseId: string;
    /** Internal journal policy, never supplied by an untrusted HTTP body. */
    allowedStepTypes?: readonly string[];
    journal?: { expectedVersion?: string; recordedAt?: number };
};
export type TrainingServiceApi = {
    getTrainingDays: (userId: string, courseType?: string) => Promise<{
        trainingDays: {
            trainingDayId: string;
            dayOnCourseId: string;
            title: string;
            type: string;
            courseId: string;
            userStatus: TrainingStatus;
            estimatedDuration: number;
            theoryMinutes: number;
            equipment: string;
            isLocked: boolean;
            showCoursePathExport: boolean;
        }[];
        courseDescription: string | null;
        courseId: string | null;
        courseVideoUrl: string | null;
        courseEquipment: string | null;
        courseTrainingLevel: string | null;
        courseIsPersonalized: boolean;
        userCoursePersonalization: UserCoursePersonalization | null;
    }>;
    getTrainingDayWithUserSteps: (userId: string | undefined, courseType: string, dayOnCourseId: string, options?: {
        createIfMissing?: boolean;
        allowPaywalledPreview?: boolean;
    }) => Promise<TrainingDetail | null>;
    resolveCourseStepRewardedTarget: (input: {
        userId: string;
        courseType?: string;
        dayOnCourseId: string;
        stepIndex: number;
    }) => Promise<RewardedTargetInput | null>;
    getTrainingDayWithMonetizedSteps: (userId: string, courseType: string, dayOnCourseId: string, options: {
        platform: MonetizedAccessPlatform;
        createIfMissing?: boolean;
    }) => Promise<TrainingDetail | null>;
    requireCourseStepPremiumOrRewardedUnlock: (input: {
        userId: string;
        platform: MonetizedAccessPlatform;
        courseType?: string;
        dayOnCourseId: string;
        stepIndex: number;
    }) => Promise<PremiumOrRewardedAccessDto | null>;
    requireCourseStepOperationAccess: (input: {
        userId: string;
        platform: MonetizedAccessPlatform;
        dayOnCourseId: string;
        stepIndex: number;
        expectedCourseId?: string;
        expectedStepOnDayId?: string;
        expectedStepId?: string;
    }) => Promise<{
        courseId: string;
        courseType: string;
        binding: StepOccurrenceBinding;
    }>;
    validateTheoryStepForCompletion: (dayOnCourseId: string, stepIndex: number, binding?: {
        expectedStepOnDayId: string;
        expectedStepId: string;
    }) => Promise<{
        valid: boolean;
        error?: string;
        code?: string;
    }>;
    getCourseTypeByDayOnCourseId: (dayOnCourseId: string) => Promise<string | null>;
    getStepInfoByIndex: (dayOnCourseId: string, stepIndex: number) => Promise<{
        stepTitle: string;
        stepOrder: number;
        stepType: string;
    } | null>;
    validateStepTypeAndGetInfo: (dayOnCourseId: string, stepIndex: number, allowedTypes: string[]) => Promise<{
        valid: boolean;
        error?: string;
        stepTitle?: string;
        stepOrder?: number;
    }>;
    checkDayAccess: (userId: string, dayOnCourseId: string) => Promise<{
        allowed: boolean;
        reason?: string;
    }>;
    updateStepAndDay: (userId: string, dayOnCourseId: string, stepIndex: number, operation: StepOperation, binding?: StepOccurrenceBinding) => Promise<{
        courseId: string;
        allCompleted: boolean;
        stepJustCompleted: boolean;
        stepJustStarted: boolean;
        stepOnDayId: string;
        stepId: string;
        progressVersion?: string;
    }>;
    applyStepAndDayTx: (tx: unknown, userId: string, dayOnCourseId: string, stepIndex: number, operation: StepOperation, binding?: StepOccurrenceBinding) => Promise<{
        courseId: string;
        allCompleted: boolean;
        stepJustCompleted: boolean;
        stepJustStarted: boolean;
        stepOnDayId: string;
        stepId: string;
        progressVersion?: string;
    }>;
    applyStepDayAndCourseTx: (tx: unknown, userId: string, dayOnCourseId: string, stepIndex: number, operation: StepOperation, binding?: StepOccurrenceBinding) => Promise<{
        courseId: string;
        allCompleted: boolean;
        stepJustCompleted: boolean;
        stepJustStarted: boolean;
        stepOnDayId: string;
        stepId: string;
        progressVersion?: string;
    }>;
    syncUserCourseStatusFromDays: (userId: string, courseId: string) => Promise<void>;
    syncUserCourseStatusFromDaysTx: (tx: unknown, userId: string, courseId: string) => Promise<void>;
};
