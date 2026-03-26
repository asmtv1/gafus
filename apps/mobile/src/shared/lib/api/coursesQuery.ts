import { coursesApi } from "./courses";

/** Общий queryKey и queryFn для вкладки «Курсы» и экранов, которым нужен тот же список с hasAccess */
export const coursesCatalogQueryOptions = {
  queryKey: ["courses"] as const,
  queryFn: async () => {
    const res = await coursesApi.getAll();
    if (!res.success) throw new Error(res.error ?? "Ошибка загрузки курсов");
    return res;
  },
};
