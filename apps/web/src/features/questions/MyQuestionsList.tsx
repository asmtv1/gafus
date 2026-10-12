"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { LoadingState, PrimaryButtonLink } from "@/shared/components/ui";
import { questionsApi } from "./api";
import { QuestionListCard } from "./QuestionListCard";
import s from "./MyQuestionsList.module.css";

/** Profile's private question list; core enforces authorId = authenticated user for mine=true. */
export function MyQuestionsList() {
  const accountId = useSession().data?.user?.id;
  const query = useInfiniteQuery({
    queryKey: ["questions", accountId, "profile", "mine"],
    queryFn: ({ pageParam }) => questionsApi.list({ mine: true, sort: "new", page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (page) => page.nextPage,
    enabled: !!accountId,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const access = query.data?.pages[0];

  return (
    <section className={s.section} aria-label="Мои вопросы">
      <div className={s.heading}>
        <h2>Мои вопросы</h2>
        {access?.canPublish && <PrimaryButtonLink href="/questions/new">Задать вопрос</PrimaryButtonLink>}
      </div>
      {query.isPending && <LoadingState variant="inline" message="Загружаем ваши вопросы…" />}
      {query.isError && (
        <div className={s.error} role="alert">
          <span>Не удалось загрузить вопросы.</span>
          <button type="button" onClick={() => void query.refetch()}>Повторить</button>
        </div>
      )}
      {query.isSuccess && items.length === 0 && (
        <div className={s.empty}>
          <p>Вы пока не задавали вопросов.</p>
          {access?.canPublish && <Link href="/questions/new">Задать первый вопрос</Link>}
        </div>
      )}
      {items.length > 0 && (
        <div className={s.list}>
          {items.map((question) => <QuestionListCard key={question.id} question={question} />)}
        </div>
      )}
      {query.hasNextPage && (
        <button
          type="button"
          className={s.more}
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Загружаем…" : "Показать ещё вопросы"}
        </button>
      )}
    </section>
  );
}
