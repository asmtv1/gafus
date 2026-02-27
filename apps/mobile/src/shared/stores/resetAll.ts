/**
 * Сброс всех пользовательских хранилищ при выходе / смене аккаунта.
 * Импортировать только из authStore — не создаёт циклических зависимостей.
 */
import { queryClient } from "@/shared/providers/QueryProvider";

import { useCourseStore } from "./courseStore";
import { useProgressSyncStore } from "./progressSyncStore";
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

  useProgressSyncStore.setState({ queue: [], consecutive401: 0 });

  useTimerStore.setState({ activeTimer: null });

  queryClient.clear();
}
