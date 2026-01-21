/**
 * Training Service
 * Сервис для работы с тренировками
 */
import { prisma, isPrismaUniqueConstraintError } from "@gafus/prisma";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { checkCourseAccess, checkCourseAccessById } from "../course";
const logger = createWebLogger("core-training");
// Типы дней, которые не нумеруются (не считаются тренировочными днями)
const NON_NUMBERED_DAY_TYPES = ["instructions", "introduction", "diagnostics", "summary"];
/**
 * Пересчитывает номер дня для отображения, исключая не-тренировочные типы дней
 */
function calculateDisplayDayNumber(dayLinks, currentIndex) {
    const currentDay = dayLinks[currentIndex];
    if (NON_NUMBERED_DAY_TYPES.includes(currentDay.day.type)) {
        return null;
    }
    let displayNumber = 0;
    for (let i = 0; i <= currentIndex; i++) {
        if (!NON_NUMBERED_DAY_TYPES.includes(dayLinks[i].day.type)) {
            displayNumber++;
        }
    }
    return displayNumber;
}
function mapCourseToTrainingDays(firstCourse) {
    const dayStatuses = firstCourse.dayLinks.map((link) => {
        const ut = link.userTrainings[0];
        const allStepStatuses = [];
        for (const stepLink of link.day.stepLinks) {
            const userStep = ut?.steps?.find((s) => s.stepOnDayId === stepLink.id);
            allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
        }
        const computed = calculateDayStatusFromStatuses(allStepStatuses);
        return {
            id: link.id,
            type: link.day.type,
            status: ut ? computed : TrainingStatus.NOT_STARTED,
        };
    });
    return firstCourse.dayLinks.map((link, index) => {
        const displayDay = calculateDisplayDayNumber(firstCourse.dayLinks, index);
        const ut = link.userTrainings[0];
        const allStepStatuses = [];
        for (const stepLink of link.day.stepLinks) {
            const userStep = ut?.steps?.find((s) => s.stepOnDayId === stepLink.id);
            allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
        }
        const computed = calculateDayStatusFromStatuses(allStepStatuses);
        const userStatus = ut ? computed : TrainingStatus.NOT_STARTED;
        let isLocked = false;
        if (link.day.type === "summary") {
            const allOtherDaysCompleted = dayStatuses.every((dayStatus) => {
                if (dayStatus.id === link.id)
                    return true;
                return dayStatus.status === TrainingStatus.COMPLETED;
            });
            isLocked = !allOtherDaysCompleted;
        }
        let trainingSeconds = 0;
        let theoryExamSeconds = 0;
        for (const sl of link.day.stepLinks) {
            const step = sl.step;
            if (step.type === "TRAINING") {
                trainingSeconds += step.durationSec ?? 0;
            }
            else if (step.type === "PRACTICE") {
                trainingSeconds += step.estimatedDurationSec ?? 0;
            }
            else if (step.type === "BREAK") {
                continue;
            }
            else {
                theoryExamSeconds += step.estimatedDurationSec ?? 0;
            }
        }
        const estimatedDuration = Math.ceil(trainingSeconds / 60);
        const theoryMinutes = Math.ceil(theoryExamSeconds / 60);
        return {
            trainingDayId: link.id,
            dayOnCourseId: link.id,
            title: link.day.title,
            type: link.day.type,
            courseId: firstCourse.id,
            userStatus,
            estimatedDuration,
            theoryMinutes,
            equipment: link.day.equipment || "",
            isLocked,
        };
    });
}
/**
 * Получить дни тренировок курса
 */
export async function getTrainingDays(userId, courseType) {
    try {
        const courseWhere = courseType ? { type: courseType } : {};
        const firstCourse = await prisma.course.findFirst({
            where: courseWhere,
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                description: true,
                videoUrl: true,
                equipment: true,
                trainingLevel: true,
                isPrivate: true,
                dayLinks: {
                    orderBy: { order: "asc" },
                    select: {
                        id: true,
                        order: true,
                        day: {
                            select: {
                                title: true,
                                type: true,
                                equipment: true,
                                stepLinks: {
                                    select: {
                                        id: true,
                                        order: true,
                                        step: {
                                            select: {
                                                durationSec: true,
                                                estimatedDurationSec: true,
                                                type: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        userTrainings: {
                            where: { userId },
                            select: {
                                status: true,
                                steps: {
                                    select: {
                                        stepOnDayId: true,
                                        status: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!firstCourse) {
            return {
                trainingDays: [],
                courseDescription: null,
                courseId: null,
                courseVideoUrl: null,
                courseEquipment: null,
                courseTrainingLevel: null,
            };
        }
        // Проверяем доступ к приватному курсу
        if (firstCourse.isPrivate) {
            const hasAccess = await checkCourseAccessById(firstCourse.id, userId);
            if (!hasAccess.hasAccess) {
                throw new Error("COURSE_ACCESS_DENIED");
            }
        }
        const trainingDays = mapCourseToTrainingDays(firstCourse);
        return {
            trainingDays,
            courseDescription: firstCourse.description,
            courseId: firstCourse.id,
            courseVideoUrl: firstCourse.videoUrl,
            courseEquipment: firstCourse.equipment,
            courseTrainingLevel: firstCourse.trainingLevel,
        };
    }
    catch (error) {
        logger.error("Ошибка в getTrainingDays", error);
        if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
            throw error;
        }
        throw new Error("Не удалось загрузить Тренировки");
    }
}
/** Создает UserTraining если его нет (идемпотентная операция) */
async function ensureUserTrainingExists(userId, dayOnCourseId) {
    try {
        const userTraining = await prisma.userTraining.upsert({
            where: {
                userId_dayOnCourseId: {
                    userId,
                    dayOnCourseId,
                },
            },
            create: {
                userId,
                dayOnCourseId,
                status: TrainingStatus.NOT_STARTED,
            },
            update: {},
            select: { id: true },
        });
        return userTraining.id;
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            const existing = await prisma.userTraining.findUnique({
                where: {
                    userId_dayOnCourseId: {
                        userId,
                        dayOnCourseId,
                    },
                },
                select: { id: true },
            });
            if (!existing?.id) {
                throw new Error("Failed to create or find UserTraining");
            }
            return existing.id;
        }
        throw error;
    }
}
/**
 * Получить детали дня тренировки с шагами пользователя
 */
export async function getTrainingDayWithUserSteps(userId, courseType, dayOnCourseId, options) {
    // Проверяем доступ к курсу
    const accessCheck = await checkCourseAccess(courseType, userId);
    if (!accessCheck.hasAccess) {
        return null;
    }
    const found = await prisma.dayOnCourse.findFirst({
        where: {
            id: dayOnCourseId,
            course: { type: courseType },
        },
        select: {
            id: true,
            order: true,
            courseId: true,
            course: {
                select: {
                    duration: true,
                },
            },
            day: {
                select: {
                    id: true,
                    title: true,
                    description: true,
                    type: true,
                    stepLinks: {
                        orderBy: { order: "asc" },
                        select: {
                            id: true,
                            order: true,
                            step: {
                                select: {
                                    id: true,
                                    title: true,
                                    description: true,
                                    durationSec: true,
                                    estimatedDurationSec: true,
                                    videoUrl: true,
                                    imageUrls: true,
                                    pdfUrls: true,
                                    type: true,
                                    checklist: true,
                                    requiresVideoReport: true,
                                    requiresWrittenFeedback: true,
                                    hasTestQuestions: true,
                                },
                            },
                        },
                    },
                },
            },
            userTrainings: {
                where: { userId },
                select: {
                    id: true,
                    status: true,
                    currentStepIndex: true,
                },
                take: 1,
            },
        },
    });
    if (!found)
        return null;
    const { id: foundDayOnCourseId, order: physicalOrder, courseId, course: { duration: courseDuration }, day: { id: trainingDayId, title, description, type, stepLinks }, userTrainings, } = found;
    // Пересчитываем номер дня для отображения
    const allDays = await prisma.dayOnCourse.findMany({
        where: { courseId },
        orderBy: { order: "asc" },
        select: {
            order: true,
            day: {
                select: {
                    type: true,
                },
            },
        },
    });
    const currentDayIndex = allDays.findIndex((d) => d.order === physicalOrder);
    const displayDayNumber = calculateDisplayDayNumber(allDays, currentDayIndex) ?? physicalOrder;
    const userTraining = userTrainings[0];
    let userTrainingId = userTraining?.id;
    if (!userTrainingId && options?.createIfMissing) {
        userTrainingId = await ensureUserTrainingExists(userId, foundDayOnCourseId);
    }
    if (!userTrainingId) {
        const steps = stepLinks.map(({ step, order }) => ({
            id: step.id,
            title: step.title,
            description: step.description,
            durationSec: step.durationSec ?? 0,
            estimatedDurationSec: step.estimatedDurationSec ?? null,
            videoUrl: step.videoUrl ?? "",
            imageUrls: step.imageUrls,
            pdfUrls: step.pdfUrls,
            status: TrainingStatus.NOT_STARTED,
            order: order,
            isPausedOnServer: false,
            remainingSecOnServer: undefined,
            type: step.type,
            checklist: step.checklist,
            requiresVideoReport: step.requiresVideoReport,
            requiresWrittenFeedback: step.requiresWrittenFeedback,
            hasTestQuestions: step.hasTestQuestions,
            userStepId: undefined,
        }));
        return {
            trainingDayId,
            dayOnCourseId: foundDayOnCourseId,
            displayDayNumber,
            title,
            type,
            courseId,
            description: description ?? "",
            duration: courseDuration ?? "",
            userStatus: TrainingStatus.NOT_STARTED,
            steps,
        };
    }
    let userSteps = [];
    try {
        userSteps = await prisma.userStep.findMany({
            where: { userTrainingId },
            select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
        });
    }
    catch {
        userSteps = await prisma.userStep.findMany({
            where: { userTrainingId },
            select: { id: true, stepOnDayId: true, status: true },
        });
    }
    // Создаем недостающие UserStep записи
    const existingStepOnDayIds = new Set(userSteps.map(us => us.stepOnDayId));
    const allStepOnDayIds = stepLinks.map(link => link.id);
    const missingStepOnDayIds = allStepOnDayIds.filter(id => !existingStepOnDayIds.has(id));
    if (missingStepOnDayIds.length > 0) {
        try {
            const newUserSteps = await prisma.$transaction(async (tx) => {
                const promises = missingStepOnDayIds.map((stepOnDayId) => tx.userStep.create({
                    data: {
                        userTrainingId,
                        stepOnDayId,
                        status: TrainingStatus.NOT_STARTED,
                    },
                    select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
                }));
                return await Promise.all(promises);
            }, { maxWait: 5000, timeout: 10000 });
            userSteps = [...userSteps, ...newUserSteps];
        }
        catch (creationError) {
            if (isPrismaUniqueConstraintError(creationError)) {
                const refreshedSteps = await prisma.userStep.findMany({
                    where: { userTrainingId },
                    select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
                });
                userSteps = refreshedSteps;
            }
            else {
                throw creationError;
            }
        }
    }
    const stepStatuses = Object.fromEntries(userSteps.map((record) => [
        record.stepOnDayId,
        TrainingStatus[record.status],
    ]));
    const userStepIds = Object.fromEntries(userSteps.map((record) => [record.stepOnDayId, record.id]));
    const pausedByStepId = Object.fromEntries(userSteps.map((record) => [record.stepOnDayId, Boolean(record.paused)]));
    const remainingByStepId = Object.fromEntries(userSteps.map((record) => [record.stepOnDayId, record.remainingSec ?? undefined]));
    const steps = stepLinks.map(({ id: stepOnDayId, step, order }) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        durationSec: step.durationSec ?? 0,
        estimatedDurationSec: step.estimatedDurationSec ?? null,
        videoUrl: step.videoUrl ?? "",
        imageUrls: step.imageUrls,
        pdfUrls: step.pdfUrls,
        status: stepStatuses[stepOnDayId] ?? TrainingStatus.NOT_STARTED,
        order: order,
        isPausedOnServer: pausedByStepId[stepOnDayId] ?? false,
        remainingSecOnServer: remainingByStepId[stepOnDayId] ?? undefined,
        type: step.type,
        checklist: Array.isArray(step.checklist) ? step.checklist : null,
        requiresVideoReport: step.requiresVideoReport,
        requiresWrittenFeedback: step.requiresWrittenFeedback,
        hasTestQuestions: step.hasTestQuestions,
        userStepId: userStepIds[stepOnDayId],
    }));
    const stepStatusesArr = stepLinks.map((stepLink) => stepStatuses[stepLink.id] ?? TrainingStatus.NOT_STARTED);
    const dayUserStatus = calculateDayStatusFromStatuses(stepStatusesArr);
    return {
        trainingDayId,
        dayOnCourseId: foundDayOnCourseId,
        displayDayNumber,
        title,
        type,
        courseId,
        description: description ?? "",
        duration: courseDuration ?? "",
        userStatus: userTraining ? dayUserStatus : TrainingStatus.NOT_STARTED,
        steps,
    };
}
//# sourceMappingURL=trainingService.js.map