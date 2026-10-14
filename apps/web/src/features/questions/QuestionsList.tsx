"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Add, KeyboardArrowDownRounded, Search } from "@mui/icons-material";
import { QUESTION_CATEGORIES, type QuestionSort, type QuestionStatus } from "@gafus/types";
import { LoadingState, PrimaryButtonLink } from "@/shared/components/ui";
import { questionsApi } from "./api";
import { QuestionListCard } from "./QuestionListCard";
import s from "./Questions.module.css";
export function QuestionsList() {
  const accountId = useSession().data?.user?.id;
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<QuestionStatus | "">("");
  const [sort, setSort] = useState<QuestionSort>("new");
  const [mine, setMine] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: ["questions", accountId, { term, category, status, sort, mine }],
    queryFn: ({ pageParam }) =>
      questionsApi.list({
        search: term,
        category: category || undefined,
        status,
        sort,
        mine,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (page) => page.nextPage,
    enabled: !!accountId,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const access = query.data?.pages[0];
  return (
    <main className={`${s.page} ${s.questionsPage}`}>
      <div className={`${s.heading} ${s.questionsHeading}`}>
        <div>
          <h1>Вопросы</h1>
          <div className={s.subtitle}>Спрашивайте, делитесь опытом и помогайте друг другу.</div>
        </div>
        {access?.canPublish && (
          <PrimaryButtonLink href="/questions/new" className={s.askButton}>
            <Add fontSize="small" />
            Задать вопрос
          </PrimaryButtonLink>
        )}
      </div>
      {access?.blockReason && (
        <p className={s.notice}>
          Публикации в разделе заблокированы: {access.blockReason}. Вы можете читать обсуждения.
        </p>
      )}
      <div className={s.questionTools}>
        <div className={s.questionFilters}>
          <div className={s.questionSearch}>
            <Search aria-hidden="true" fontSize="small" />
            <input
              aria-label="Поиск вопросов"
              type="search"
              placeholder="Поиск по вопросам"
              maxLength={150}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={s.questionSelect}>
            <select
              aria-label="Категория"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Все категории</option>
              {QUESTION_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <KeyboardArrowDownRounded className={s.questionSelectIcon} aria-hidden="true" />
          </div>
          <div className={s.questionSelect}>
            <select
              aria-label="Статус вопроса"
              value={status}
              onChange={(e) => setStatus(e.target.value as QuestionStatus | "")}
            >
              <option value="">Все статусы</option>
              <option value="waiting">Ждёт ответа</option>
              <option value="answered">Есть ответы</option>
              <option value="resolved">Решён</option>
            </select>
            <KeyboardArrowDownRounded className={s.questionSelectIcon} aria-hidden="true" />
          </div>
        </div>
        <div className={s.questionOptions}>
          <div className={`${s.tabs} ${s.questionScope}`} role="group" aria-label="Чьи вопросы">
            {[
              [false, "Все"],
              [true, "Мои"],
            ].map(([v, text]) => (
              <button
                key={String(v)}
                className={`${s.questionTab} ${mine === v ? s.questionTabActive : ""}`}
                aria-pressed={mine === v}
                onClick={() => setMine(v as boolean)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className={`${s.tabs} ${s.questionSort}`} role="group" aria-label="Сортировка вопросов">
            {(
              [
                ["new", "Новые"],
                ["active", "Активные"],
                ["unanswered", "Без ответа"],
              ] as const
            ).map(([v, text]) => (
              <button
                key={v}
                aria-pressed={sort === v}
                className={`${s.questionTab} ${sort === v ? s.questionTabActive : ""}`}
                onClick={() => setSort(v)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
      {query.isPending && <LoadingState variant="inline" message="Загрузка вопросов…" />}
      {query.isError && (
        <div className={s.error} role="alert">
          {query.error.message}
          <button className={s.textButton} onClick={() => void query.refetch()}>
            Повторить
          </button>
        </div>
      )}
      {!query.isPending && !query.isError && !items.length && (
        <div className={s.empty}>
          <h2>{term || category || status || mine ? "Вопросов пока нет" : "Начните обсуждение"}</h2>
          <p>
            {term || category || status || mine
              ? "Измените фильтры или задайте свой вопрос."
              : "Задайте первый вопрос — здесь можно обмениваться опытом с другими владельцами."}
          </p>
          {access?.canPublish && (
            <PrimaryButtonLink href="/questions/new" className={s.askButton}>
              Задать вопрос
            </PrimaryButtonLink>
          )}
        </div>
      )}
      {items.map((q) => <QuestionListCard key={q.id} question={q} />)}
      {query.hasNextPage && (
        <button
          className={s.secondary}
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Загрузка…" : "Ещё вопросы"}
        </button>
      )}
      {query.isFetchingNextPage && <LoadingState variant="inline" message="Загружаем вопросы…" />}
    </main>
  );
}
