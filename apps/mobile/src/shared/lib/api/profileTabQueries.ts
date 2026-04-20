import { getCurrentDeviceTokens } from "@/shared/lib/utils/notifications";

import { notesApi } from "./notes";
import { petsApi } from "./pets";
import { subscriptionsApi } from "./subscriptions";
import { userApi } from "./user";

/** Профиль и связанные данные — общие опции для экрана и префетча после «Курсы». */
export const userProfileQueryOptions = {
  queryKey: ["user-profile"] as const,
  queryFn: async () => {
    const res = await userApi.getProfile();
    if (!res.success) throw new Error(res.error ?? "Ошибка загрузки профиля");
    return res;
  },
};

export const petsQueryOptions = {
  queryKey: ["pets"] as const,
  queryFn: async () => {
    const res = await petsApi.getAll();
    if (!res.success) throw new Error(res.error ?? "Ошибка загрузки питомцев");
    return res;
  },
};

export const pushSubscriptionDeviceStatusQueryOptions = {
  queryKey: ["push-subscription-device-status"] as const,
  queryFn: async () => {
    const tokens = await getCurrentDeviceTokens();
    const endpoints = [tokens.expo, tokens.rustore].filter(
      (ep): ep is string => typeof ep === "string" && ep.length > 0,
    );
    const res = await subscriptionsApi.postPushDeviceStatus(endpoints);
    if (!res.success || res.data === undefined) {
      throw new Error(res.error ?? "Не удалось проверить подписку");
    }
    return res.data;
  },
};

export const studentNotesQueryOptions = {
  queryKey: ["student-notes"] as const,
  queryFn: notesApi.getStudentNotes,
};

export function trainerPublicProfileQueryOptions(username: string) {
  return {
    queryKey: ["trainer-public-profile", username] as const,
    queryFn: async () => {
      const res = await userApi.getPublicProfile(username);
      if (!res.success) throw new Error(res.error ?? "Ошибка загрузки профиля тренера");
      return res;
    },
  };
}
