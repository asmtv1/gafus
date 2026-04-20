import { articlesApi } from "./articles";

/** Единый queryKey/queryFn для списка статей (вкладка и префетч). */
export const articlesQueryOptions = {
  queryKey: ["articles"] as const,
  queryFn: async () => {
    const res = await articlesApi.getAll();
    if (!res.success) throw new Error(res.error ?? "Ошибка загрузки статей");
    return res;
  },
  staleTime: 30_000,
};
