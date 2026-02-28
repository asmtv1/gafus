import { coursesApi } from "./courses";

/** Общий queryKey и queryFn для избранного — единый источник для AuthProvider и FavoritesScreen */
export const favoritesQueryOptions = {
  queryKey: ["favorites"] as const,
  queryFn: async () => {
    const res = await coursesApi.getFavorites();
    if (!res.success) {
      throw new Error(res.error ?? "Ошибка загрузки избранных курсов");
    }
    return res;
  },
};
