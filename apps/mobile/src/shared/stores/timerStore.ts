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
  } | null;
}

interface TimerActions {
  // Старт таймера
  startTimer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => void;

  // Возобновление таймера с оставшимся временем
  resumeTimer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    remainingSec: number,
  ) => void;

  // Пауза таймера
  pauseTimer: () => number | null;

  // Обновление оставшегося времени (вызывается каждую секунду)
  tick: () => void;

  // Остановка таймера
  stopTimer: () => void;

  // Проверка, активен ли таймер для шага
  isTimerActiveFor: (courseId: string, dayOnCourseId: string, stepIndex: number) => boolean;

  // Получение оставшегося времени
  getRemainingTime: () => number | null;
}

type TimerStore = TimerState & TimerActions;

/**
 * Store для управления таймером шага
 * Не персистится — при перезапуске приложения таймер сбрасывается
 */
export const useTimerStore = create<TimerStore>((set, get) => ({
  activeTimer: null,

  startTimer: (courseId, dayOnCourseId, stepIndex, durationSec) => {
    set({
      activeTimer: {
        courseId,
        dayOnCourseId,
        stepIndex,
        remainingSec: durationSec,
        isRunning: true,
        startedAt: Date.now(),
      },
    });
  },

  resumeTimer: (courseId, dayOnCourseId, stepIndex, remainingSec) => {
    set({
      activeTimer: {
        courseId,
        dayOnCourseId,
        stepIndex,
        remainingSec,
        isRunning: true,
        startedAt: Date.now(),
      },
    });
  },

  pauseTimer: () => {
    const timer = get().activeTimer;
    if (!timer) return null;

    const remaining = timer.remainingSec;
    set({
      activeTimer: {
        ...timer,
        isRunning: false,
      },
    });
    return remaining;
  },

  tick: () => {
    const timer = get().activeTimer;
    if (!timer || !timer.isRunning) return;

    const newRemaining = timer.remainingSec - 1;

    if (newRemaining <= 0) {
      // Таймер завершён
      set({ activeTimer: null });
    } else {
      set({
        activeTimer: {
          ...timer,
          remainingSec: newRemaining,
        },
      });
    }
  },

  stopTimer: () => {
    set({ activeTimer: null });
  },

  isTimerActiveFor: (courseId, dayOnCourseId, stepIndex) => {
    const timer = get().activeTimer;
    if (!timer) return false;
    return (
      timer.courseId === courseId &&
      timer.dayOnCourseId === dayOnCourseId &&
      timer.stepIndex === stepIndex
    );
  },

  getRemainingTime: () => {
    return get().activeTimer?.remainingSec ?? null;
  },
}));
