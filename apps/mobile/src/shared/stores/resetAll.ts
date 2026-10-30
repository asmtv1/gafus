/**
 * Сброс всех пользовательских хранилищ при выходе / смене аккаунта.
 * Импортировать только из authStore — не создаёт циклических зависимостей.
 */
import { queryClient } from "@/shared/providers/QueryProvider";

import { useCourseStore } from "./courseStore";

import { useStepStore } from "./stepStore";
import { useTimerStore } from "./timerStore";
import { useTrainingStore } from "./trainingStore";

export function resetUserStores(): void {
  useCourseStore.setState({
    cachedCourses: null,
    favorites: [],
  });
  useCourseStore.getState().clearFilters();

  useStepStore.getState().reset();

  useTrainingStore.getState().reset();

  // Pre-v2 progress-sync-storage is legacy owner-unknown data. Zustand persist
  // setState(queue:[]) rewrites its original bytes; do NOT mutate it on logout.
  // Legacy dispatch/visibility require a separate explicit quarantine gate.
  // Preserve unknown-owner video-progress-storage bytes; playback isolation is separate.

  useTimerStore.setState({ activeTimer: null });

  queryClient.clear();
}
