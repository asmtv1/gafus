import { create } from "zustand";

interface TimerState {
  // Текущий активный таймер
  activeTimer: {
    courseId: string;
    dayOnCourseId: string;
    stepIndex: number;
    remainingSec: number;
    isRunning: boolean;
    startedAt: number;
    endTsSec?: number;
    /** Phase1: optional attested owner/epoch of the in-memory timer (never persisted). */
    ownerId?: string;
    authEpoch?: string;
  } | null;
}

interface TimerActions {
  // Старт таймера
  startTimer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
    session?: { ownerId: string; authEpoch: string },
  ) => boolean;

  // Возобновление таймера с оставшимся временем
  resumeTimer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    remainingSec: number,
  ) => boolean;

  // Пауза таймера
  pauseTimer: () => number | null;

  // Обновление оставшегося времени (вызывается каждую секунду)
  tick: () => void;

  // Остановка таймера
  stopTimer: (courseId?: string, dayOnCourseId?: string, stepIndex?: number) => void;

  // Восстановление таймера после возврата в экран/приложение
  restoreTimerFromStorage: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
  ) => Promise<number | null>;

  // Проверка, активен ли таймер для шага
  isTimerActiveFor: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    session?: { ownerId: string; authEpoch: string },
  ) => boolean;

  // Получение оставшегося времени
  getRemainingTime: () => number | null;
}

type TimerStore = TimerState & TimerActions;

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * Store для управления таймером шага
 * Не персистится — при перезапуске приложения таймер сбрасывается
 */
export const useTimerStore = create<TimerStore>((set, get) => ({
  activeTimer: null,

  startTimer: (courseId, dayOnCourseId, stepIndex, durationSec, session) => {
    const currentTimer = get().activeTimer;
    if (currentTimer?.isRunning) {
      const isSameStep =
        currentTimer.courseId === courseId &&
        currentTimer.dayOnCourseId === dayOnCourseId &&
        currentTimer.stepIndex === stepIndex;
      if (isSameStep) {
        return false;
      }
      return false;
    }

    const safeDuration = Math.max(0, Math.floor(durationSec));
    const endTsSec = nowSec() + safeDuration;

    set({
      activeTimer: {
        courseId,
        dayOnCourseId,
        stepIndex,
        remainingSec: safeDuration,
        isRunning: true,
        startedAt: Date.now(),
        endTsSec,
        ...(session ? { ownerId: session.ownerId, authEpoch: session.authEpoch } : {}),
      },
    });
    // Ownerless historical timer keys must never be written by new sessions.
    return true;
  },

  resumeTimer: (courseId, dayOnCourseId, stepIndex, remainingSec) => {
    return get().startTimer(courseId, dayOnCourseId, stepIndex, remainingSec);
  },

  pauseTimer: () => {
    const timer = get().activeTimer;
    if (!timer) return null;

    const effectiveEndTs = timer.endTsSec ?? nowSec() + timer.remainingSec;
    const remaining = Math.max(effectiveEndTs - nowSec(), 0);

    set({
      activeTimer: {
        ...timer,
        remainingSec: remaining,
        isRunning: false,
        endTsSec: effectiveEndTs,
      },
    });
    return remaining;
  },

  tick: () => {
    const timer = get().activeTimer;
    if (!timer || !timer.isRunning) return;

    const effectiveEndTs = timer.endTsSec ?? nowSec() + timer.remainingSec;
    const newRemaining = Math.max(effectiveEndTs - nowSec(), 0);

    set({
      activeTimer: {
        ...timer,
        remainingSec: newRemaining,
        isRunning: newRemaining > 0,
        endTsSec: effectiveEndTs,
      },
    });
  },

  stopTimer: (courseId, dayOnCourseId, stepIndex) => {
    const timer = get().activeTimer;
    // Do not remove unknown-owner historical timer bytes on reset/complete.
    void courseId;
    void dayOnCourseId;
    void stepIndex;
    void timer;
    set({ activeTimer: null });
  },

  restoreTimerFromStorage: async () => {
    // Legacy key carries no principal/authEpoch. Never hydrate from it.
    // Owner-attested v2 timer hydration requires separate approved time semantics.
    return null;
  },

  isTimerActiveFor: (courseId, dayOnCourseId, stepIndex, session) => {
    const timer = get().activeTimer;
    if (!timer) return false;
    return (
      timer.courseId === courseId &&
      timer.dayOnCourseId === dayOnCourseId &&
      timer.stepIndex === stepIndex &&
      (!session || (timer.ownerId === session.ownerId && timer.authEpoch === session.authEpoch))
    );
  },

  getRemainingTime: () => {
    return get().activeTimer?.remainingSec ?? null;
  },
}));
