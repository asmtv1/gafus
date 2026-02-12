import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStepTimerEndStorageKey } from "@gafus/core/utils/training";

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
  } | null;
}

interface TimerActions {
  // Старт таймера
  startTimer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
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
  isTimerActiveFor: (courseId: string, dayOnCourseId: string, stepIndex: number) => boolean;

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

  startTimer: (courseId, dayOnCourseId, stepIndex, durationSec) => {
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
      },
    });
    const endKey = getStepTimerEndStorageKey(courseId, dayOnCourseId, stepIndex);
    void AsyncStorage.setItem(endKey, String(endTsSec));
    return true;
  },

  resumeTimer: (courseId, dayOnCourseId, stepIndex, remainingSec) => {
    return get().startTimer(courseId, dayOnCourseId, stepIndex, remainingSec);
  },

  pauseTimer: () => {
    const timer = get().activeTimer;
    if (!timer) return null;

    const effectiveEndTs = timer.endTsSec ?? (nowSec() + timer.remainingSec);
    const remaining = Math.max(effectiveEndTs - nowSec(), 0);
    const endKey = getStepTimerEndStorageKey(timer.courseId, timer.dayOnCourseId, timer.stepIndex);
    void AsyncStorage.removeItem(endKey);

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

    const effectiveEndTs = timer.endTsSec ?? (nowSec() + timer.remainingSec);
    const newRemaining = Math.max(effectiveEndTs - nowSec(), 0);

    if (__DEV__) {
      console.log("[timer] tick:", {
        stepIndex: timer.stepIndex,
        remainingSec: newRemaining,
        done: newRemaining <= 0,
      });
    }

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
    const keyCourseId = courseId ?? timer?.courseId;
    const keyDayId = dayOnCourseId ?? timer?.dayOnCourseId;
    const keyStepIndex = stepIndex ?? timer?.stepIndex;

    if (keyCourseId && keyDayId && typeof keyStepIndex === "number") {
      const endKey = getStepTimerEndStorageKey(keyCourseId, keyDayId, keyStepIndex);
      void AsyncStorage.removeItem(endKey);
    }
    set({ activeTimer: null });
  },

  restoreTimerFromStorage: async (courseId, dayOnCourseId, stepIndex) => {
    const activeTimer = get().activeTimer;
    if (activeTimer?.isRunning) {
      const isSameStep =
        activeTimer.courseId === courseId &&
        activeTimer.dayOnCourseId === dayOnCourseId &&
        activeTimer.stepIndex === stepIndex;
      if (!isSameStep) return null;
      get().tick();
      return get().activeTimer?.remainingSec ?? null;
    }

    const endKey = getStepTimerEndStorageKey(courseId, dayOnCourseId, stepIndex);
    const endTsRaw = await AsyncStorage.getItem(endKey);
    if (endTsRaw) {
      const endTsSec = Number(endTsRaw);
      if (Number.isFinite(endTsSec)) {
        const remainingSec = Math.max(endTsSec - nowSec(), 0);
        set({
          activeTimer: {
            courseId,
            dayOnCourseId,
            stepIndex,
            remainingSec,
            isRunning: remainingSec > 0,
            startedAt: Date.now(),
            endTsSec,
          },
        });
        if (remainingSec <= 0) {
          await AsyncStorage.removeItem(endKey);
        }
        return remainingSec;
      }
    }

    return null;
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
