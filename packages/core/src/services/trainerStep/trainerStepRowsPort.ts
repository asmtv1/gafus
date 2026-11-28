/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */
export type PortableJsonValue = null | string | number | boolean | { readonly [key: string]: PortableJsonValue } | readonly PortableJsonValue[];
export type PortableRowFields = Record<string, unknown>;
type TrainerTemplateSqlRow = Record<string, unknown>;
export type StepType = "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY" | "SURVEY";
export type StepMutationActor = {
    id: string;
    role: "TRAINER" | "ADMIN";
};
export interface TrainerStepRowsPort {
    readTrainerVideoRows: (selectedIds: string[], actorId: string) => Promise<{
        id: string;
        relativePath: string;
        hlsManifestPath: string | null;
    }[]>;
    readTrainerStepForEdit: (id: string, actor?: StepMutationActor) => Promise<{
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        videoUrls: string[];
        checklist: PortableJsonValue;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        isDailyCourse: boolean;
        estimatedDurationSec: number | null;
    } | null>;
    readTrainerStepMediaRow: (id: string) => Promise<{
        imageUrls: string[];
    } | null>;
    readTrainerStepImageRow: (stepId: string) => Promise<{
        imageUrls: string[];
    } | null>;
    readTrainerStepDeletionRows: (stepIds: string[]) => Promise<{
        id: string;
        imageUrls: string[];
    }[]>;
    readVisibleTrainerSteps: (where: PortableRowFields) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        author: {
            username: string;
            profile: {
                fullName: string | null;
            } | null;
        };
        title: string;
        stepLinks: ({
            day: {
                dayLinks: ({
                    course: {
                        name: string;
                        id: string;
                        shortDesc: string;
                        logoImg: string;
                    };
                } & {
                    courseId: string;
                    id: string;
                    dayId: string;
                    order: number;
                })[];
            } & {
                createdAt: Date;
                updatedAt: Date;
                id: string;
                type: string;
                description: string;
                equipment: string;
                authorId: string;
                title: string;
                showCoursePathExport: boolean;
                shareProgressAcrossCourses: boolean;
            };
        } & {
            id: string;
            dayId: string;
            order: number;
            stepId: string;
        })[];
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        videoUrls: string[];
        checklist: PortableJsonValue;
        surveySlug: string | null;
        isDailyCourse: boolean;
        estimatedDurationSec: number | null;
    }[]>;
    createTrainerStepRecord: (data: Omit<PortableRowFields, "checklist"> & {
        checklist: unknown;
    }) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        videoUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        isDailyCourse: boolean;
        estimatedDurationSec: number | null;
    }>;
    updateTrainerStepRecord: (where: PortableRowFields, data: Omit<PortableRowFields, "checklist"> & {
        checklist: unknown;
    }) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        videoUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        isDailyCourse: boolean;
        estimatedDurationSec: number | null;
    }>;
    updateTrainerStepImageRow: (stepId: string, nextUrls: string[]) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        videoUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        isDailyCourse: boolean;
        estimatedDurationSec: number | null;
    }>;
    deleteLegacyTrainerStepRows: (stepIds: string[]) => Promise<{
        count: number;
    }>;
    deleteOwnedTrainerStepRows: (where: PortableRowFields, uniqueIds: string[]) => Promise<{
        id: string;
        imageUrls: string[];
    }[]>;
    readTrainerTemplateForDisplay: (id: string) => Promise<({
        author: {
            id: string;
            username: string;
        };
        category: {
            name: string;
            id: string;
            icon: string | null;
        } | null;
    } & {
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        estimatedDurationSec: number | null;
        tags: string[];
        categoryId: string | null;
        isPublic: boolean;
        usageCount: number;
    }) | null>;
    readTrainerTemplateForCreation: (templateId: string) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        estimatedDurationSec: number | null;
        tags: string[];
        categoryId: string | null;
        isPublic: boolean;
        usageCount: number;
    } | null>;
    readPublicTrainerStepTemplates: (categoryId?: string) => Promise<({
        author: {
            id: string;
            username: string;
        };
        category: {
            name: string;
            id: string;
            icon: string | null;
        } | null;
    } & {
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        estimatedDurationSec: number | null;
        tags: string[];
        categoryId: string | null;
        isPublic: boolean;
        usageCount: number;
    })[]>;
    searchPublicTrainerStepTemplates: (query: string) => Promise<({
        author: {
            id: string;
            username: string;
        };
        category: {
            name: string;
            id: string;
            icon: string | null;
        } | null;
    } & {
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        estimatedDurationSec: number | null;
        tags: string[];
        categoryId: string | null;
        isPublic: boolean;
        usageCount: number;
    })[]>;
    readPublicTrainerStepCategories: () => Promise<({
        _count: {
            templates: number;
        };
    } & {
        name: string;
        createdAt: Date;
        updatedAt: Date;
        id: string;
        order: number;
        description: string | null;
        icon: string | null;
    })[]>;
    createStepFromTemplateRow: (template: TrainerTemplateSqlRow, input: {
        templateId: string;
        authorId: string;
    }) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        videoUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        isDailyCourse: boolean;
        estimatedDurationSec: number | null;
    }>;
    deleteTrainerTemplateRow: (templateId: string) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        estimatedDurationSec: number | null;
        tags: string[];
        categoryId: string | null;
        isPublic: boolean;
        usageCount: number;
    }>;
    createTrainerTemplateRow: (data: {
        title: string;
        description: string;
        durationSec: number | null;
        type: string;
        categoryId: string | null;
        tags: string[];
        videoUrl: string | null;
        authorId: string;
    }) => Promise<{
        createdAt: Date;
        updatedAt: Date;
        id: string;
        type: StepType;
        description: string;
        videoUrl: string | null;
        authorId: string;
        title: string;
        durationSec: number | null;
        imageUrls: string[];
        pdfUrls: string[];
        checklist: PortableJsonValue | null;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
        estimatedDurationSec: number | null;
        tags: string[];
        categoryId: string | null;
        isPublic: boolean;
        usageCount: number;
    }>;
    createTrainerStepCategoryRow: (data: {
        name: string;
        description: string | null;
        icon: string | null;
        order: number;
    }) => Promise<{
        name: string;
        createdAt: Date;
        updatedAt: Date;
        id: string;
        order: number;
        description: string | null;
        icon: string | null;
    }>;
}
export function requireTrainerStepRowsPort(port: TrainerStepRowsPort | undefined): Readonly<TrainerStepRowsPort> {
  if (!port) throw new Error("TRAINER_STEP_ROWS_PORT_UNBOUND");
  return port;
}
