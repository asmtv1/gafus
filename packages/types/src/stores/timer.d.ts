export interface TimerStore {
    timers: Map<string, NodeJS.Timeout>;
    getActiveStep: () => string | null;
    canStartStep: (courseId: string, day: number, stepIndex: number) => boolean;
    startTimer: (courseId: string, day: number, stepIndex: number, onTimeUpdate: (timeLeft: number) => void, onFinish: () => void, isRestore?: boolean) => boolean;
    stopTimer: (courseId: string, day: number, stepIndex: number) => void;
    stopAllTimers: () => void;
    cleanupTimers: () => void;
    startStepWithServer: (courseId: string, day: number, stepIndex: number, durationSec: number) => Promise<void>;
    finishStepWithServer: (courseId: string, day: number, stepIndex: number, stepTitle: string, stepOrder: number) => Promise<void>;
    resetStepWithServer: (courseId: string, day: number, stepIndex: number, durationSec: number) => Promise<void>;
    pauseNotification: (courseId: string, day: number, stepIndex: number) => Promise<void>;
    resumeNotification: (courseId: string, day: number, stepIndex: number, durationSec: number) => Promise<void>;
    pauseStepOffline: (courseId: string, day: number, stepIndex: number) => void;
    resumeStepOffline: (courseId: string, day: number, stepIndex: number) => void;
    pauseStepWithServer: (courseId: string, day: number, stepIndex: number) => Promise<void>;
    resumeStepWithServer: (courseId: string, day: number, stepIndex: number, durationSec: number) => Promise<void>;
}
//# sourceMappingURL=timer.d.ts.map