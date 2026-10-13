"use client";

import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { LoadingState, SecondaryButton } from "@/shared/components/ui";
import { questionsApi } from "./api";
import { QuestionListCard } from "./QuestionListCard";
import styles from "./MyQuestionsList.module.css";

/** Visible, non-deleted questions authored by the selected public profile. */
export function PublicQuestionsList({ username }: { username: string }) {
  const { status, data: session } = useSession();
  const query = useInfiniteQuery({
    queryKey: ["questions", "profile", username, session?.user?.id],
    queryFn: ({ pageParam }) =>
      questionsApi.list({ author: username, sort: "new", page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (page) => page.nextPage,
    enabled: status === "authenticated" && Boolean(session?.user?.id),
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className={styles.section} aria-label={`Вопросы пользователя @${username}`}>
      {status === "loading" && <LoadingState variant="inline" message="Загружаем вопросы…" />}
      {status === "unauthenticated" && (
        <div className={styles.empty}>Войдите в аккаунт, чтобы посмотреть вопросы.</div>
      )}
      {status === "authenticated" && query.isPending && (
        <LoadingState variant="inline" message="Загружаем вопросы…" />
      )}
      {status === "authenticated" && query.isError && (
        <div className={styles.error} role="alert">
          <span>Не удалось загрузить вопросы.</span>
          <SecondaryButton type="button" onClick={() => void query.refetch()}>
            Повторить
          </SecondaryButton>
        </div>
      )}
      {status === "authenticated" && query.isSuccess && items.length === 0 && (
        <div className={styles.empty}>@{username} пока не задавал(а) вопросов.</div>
      )}
      {items.length > 0 && (
        <div className={styles.list}>
          {items.map((question) => <QuestionListCard key={question.id} question={question} />)}
        </div>
      )}
      {query.hasNextPage && (
        <SecondaryButton
          type="button"
          className={styles.more}
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Загружаем…" : "Показать ещё вопросы"}
        </SecondaryButton>
      )}
    </section>
  );
}
