"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { questionsApi } from "./api";
import { QuestionForm } from "./QuestionForm";
import s from "./Questions.module.css";
export function EditQuestion({ id }: { id: string }) {
  const userId = useSession().data?.user?.id;
  const query = useQuery({
    queryKey: ["questions", userId, "edit", id],
    queryFn: () => questionsApi.detail(id),
    enabled: !!userId,
  });
  if (query.isPending) return <main className={s.page}>Загрузка вопроса…</main>;
  if (query.isError || !query.data?.canEdit || query.data.blockReason)
    return (
      <main className={s.page}>
        <p role="alert" className={s.error}>
          {query.error?.message ?? "Редактирование недоступно"}
        </p>
      </main>
    );
  return <QuestionForm initial={query.data} />;
}
