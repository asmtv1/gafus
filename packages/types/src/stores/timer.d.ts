export interface TimerStore {
    timers: Map<string, NodeJS.Timeout>;
    getActiveStep: () => string | null;
    canStartStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => boolean;
    startTimer: (courseId: string, dayOnCourseId: string, stepIndex: number, onTimeUpdate: (timeLeft: number) => void, onFinish: () => void, isRestore?: boolean) => boolean;
    stopTimer: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
    stopAllTimers: () => void;
    cleanupTimers: () => void;
    startStepWithServer: (courseId: string, dayOnCourseId: string, stepIndex: number, durationSec: number) => Promise<void>;
    finishStepWithServer: (courseId: string, dayOnCourseId: string, stepIndex: number, stepTitle: string, stepOrder: number) => Promise<void>;
    resetStepWithServer: (courseId: string, dayOnCourseId: string, stepIndex: number, durationSec: number) => Promise<void>;
    pauseNotification: (courseId: string, dayOnCourseId: string, stepIndex: number) => Promise<void>;
    resumeNotification: (courseId: string, dayOnCourseId: string, stepIndex: number, durationSec: number) => Promise<void>;
    pauseStepOffline: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
    resumeStepOffline: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
    pauseStepWithServer: (courseId: string, dayOnCourseId: string, stepIndex: number) => Promise<void>;
    resumeStepWithServer: (courseId: string, dayOnCourseId: string, stepIndex: number, durationSec: number) => Promise<void>;
}
//# sourceMappingURL=timer.d.ts.map