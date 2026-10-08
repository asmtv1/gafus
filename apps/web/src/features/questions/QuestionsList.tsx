"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Add } from "@mui/icons-material";
import { QUESTION_CATEGORIES, type QuestionSort, type QuestionStatus } from "@gafus/types";
import { questionsApi } from "./api";
import { Author, Status, Counts, BestLabel } from "./parts";
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
    <main className={s.page}>
      <div className={s.heading}>
        <div>
          <h1>Вопросы</h1>
          <div className={s.subtitle}>Спрашивайте, делитесь опытом и помогайте друг другу.</div>
        </div>
        {access?.canPublish && (
          <Link href="/questions/new" className={s.primary}>
            <Add />
            Задать вопрос
          </Link>
        )}
      </div>
      {access?.blockReason && (
        <p className={s.notice}>
          Публикации в разделе заблокированы: {access.blockReason}. Вы можете читать обсуждения.
        </p>
      )}
      <div className={s.filters}>
        <input
          aria-label="Поиск вопросов"
          placeholder="Поиск по вопросам"
          maxLength={150}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
      </div>
      <div className={s.heading}>
        <div className={s.tabs}>
          {[
            [false, "Все"],
            [true, "Мои"],
          ].map(([v, text]) => (
            <button
              key={String(v)}
              className={`${s.secondary} ${mine === v ? s.selected : ""}`}
              aria-pressed={mine === v}
              onClick={() => setMine(v as boolean)}
            >
              {text}
            </button>
          ))}
        </div>
        <div className={s.tabs}>
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
              className={`${s.textButton} ${sort === v ? s.selected : ""}`}
              onClick={() => setSort(v)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {query.isPending && <p role="status">Загрузка вопросов…</p>}
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
            <Link href="/questions/new" className={s.primary}>
              Задать вопрос
            </Link>
          )}
        </div>
      )}
      {items.map((q) => (
        <Link href={`/questions/${q.id}`} key={q.id} className={s.card}>
          <Status question={q} />
          <h2>{q.title}</h2>
          {q.bestAnswer && (
            <div className={s.bestPreview}>
              <BestLabel />
              <div>{q.bestAnswer.body}</div>
            </div>
          )}
          <div className={s.cardFooter}>
            <Author author={q.author} date={q.createdAt} />
            <Counts question={q} />
          </div>
        </Link>
      ))}
      {query.hasNextPage && (
        <button
          className={s.secondary}
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Загрузка…" : "Ещё вопросы"}
        </button>
      )}
    </main>
  );
}
