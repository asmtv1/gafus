import { Loading } from "../../shared/ui";
import { useContext, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  QUESTION_CATEGORIES,
  type QuestionCategory,
  type QuestionSort,
  type QuestionStatus,
} from "@gafus/types";
import { listQuestionsPage } from "./questionApi";
import { RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import next from "../../brand/LegacyQuestionsPage.module.css";
import { NextQuestionPreview } from "./NextQuestionPreview";
import { CourseViewSessionContext } from "../courses/courseCatalogFilters";
import { DEFAULT_QUESTIONS_VIEW, readQuestionsHistoryView,
  saveQuestionsHistoryView, type QuestionsView } from "../readListHistoryView";
import { PrimaryButton, PrimaryButtonLink } from "../../shared/ui";
import "./QuestionsCatalogNextResponsive.css";


export function QuestionCatalog({ userId, initialMine = false }: {
  userId: string; initialMine?: boolean;
}) {
  const generation = useContext(CourseViewSessionContext);
  // A principal or App-lifetime actor epoch change remounts both filters and
  // request state, including a rapid A-B-A transition in the same tab.
  return <QuestionCatalogForPrincipal key={JSON.stringify([userId, generation, initialMine])}
    userId={userId} generation={generation} initialMine={initialMine} />;
}

function QuestionCatalogForPrincipal({ userId, generation, initialMine }: {
  userId: string; generation: string | null; initialMine: boolean;
}) {
  // Owner-profile filters must never overwrite a user's general question feed.
  const scope = { principal: initialMine ? userId + ":profile" : userId, generation };
  const [view, setView] = useState<QuestionsView>(() =>
    readQuestionsHistoryView(scope) ?? { ...DEFAULT_QUESTIONS_VIEW, mine: initialMine });
  const { sort, mine, search, category, status } = view;
  // Restored search starts already debounced: the matching first-page GET
  // must not transiently send a wrong (unfiltered) request on browser Back.
  const [term, setTerm] = useState(() => view.search.trim());
  const changeView = (change: Partial<QuestionsView>) => {
    const next = { ...view, ...change };
    saveQuestionsHistoryView(scope, next);
    setView(next);
  };
  useEffect(() => {
    const timeout = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const filtersApplied = !!(term || category || status || mine || sort !== "new");
  const searchSettled = search.trim() === term;
  const query = useInfiniteQuery({
    queryKey: ["questions", "catalog", userId, sort, mine, term, category, status],
    queryFn: ({ pageParam }) => listQuestionsPage({
      page: pageParam, sort, mine, search: term, category, status,
    }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // A same-turn double click precedes React's isFetchingNextPage commit.
  // Keep one page request per exact principal/filter query identity; an older
  // query's completion must never release a newer sort/filter flight.
  const pageKey = JSON.stringify([userId, sort, mine, term, category, status]);
  const flightRef = useRef<{ key: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pageBusy = busyKey === pageKey || query.isFetchingNextPage;
  const requestNextPage = () => {
    if (flightRef.current?.key === pageKey || query.isFetchingNextPage) return;
    const flight = { key: pageKey };
    flightRef.current = flight;
    setBusyKey(pageKey);
    const release = () => {
      if (flightRef.current !== flight) return;
      flightRef.current = null;
      setBusyKey((current) => current === pageKey ? null : current);
    };
    void query.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  // A denied next page invalidates displayed cards and publish actions; only
  // transient page failures retain already verified results for manual retry.
  const pageDenied = query.isFetchNextPageError && (unauthenticated || forbidden || notFound);
  const showReadError = query.isError && (!query.isFetchNextPageError || pageDenied);
  const ready =
    !!query.data && searchSettled &&
    (!query.isFetching || query.isFetchingNextPage) &&
    (query.isSuccess || (query.isFetchNextPageError && !pageDenied));
  const seen = new Set<string>();
  const items = !ready
    ? []
    : query
        .data!.pages.flatMap((page) => page.items)
        .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  return (
    <section className={`${next.page} ${next.questionsPage} collection-section next-questions-page`}
      aria-label="Вопросы" data-next-questions>
      <div className={`${next.heading} ${next.questionsHeading} next-questions-heading`}>
        <div><h1>Вопросы</h1>
          <div className={next.subtitle}>Спрашивайте, делитесь опытом и помогайте друг другу.</div>
        </div>
        {ready && query.data!.pages[0]?.canPublish &&
          <PrimaryButtonLink href="/questions/new" className={next.askButton}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Задать вопрос
          </PrimaryButtonLink>}
      </div>
      <div className={next.questionTools}>
        <div className={`${next.questionFilters} question-controls`}>
        <div className={`${next.questionSearch} question-control question-search-control`}>
          <label className="gafus-visually-hidden" htmlFor="question-search">Поиск вопросов</label>
          <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/>
            <path d="m16 16 5 5"/></svg>
          <input id="question-search" type="search" aria-label="Поиск вопросов" maxLength={150}
            placeholder="Поиск по вопросам" value={search}
            onChange={(event) => changeView({ search: event.target.value })} />
        </div>
        <div className={`${next.questionSelect} question-control`}>
          <label className="gafus-visually-hidden" htmlFor="question-category">Категория</label>
          <select id="question-category" aria-label="Категория" value={category}
            onChange={(event) => changeView({ category: event.target.value as QuestionCategory | "" })}>
            <option value="">Все категории</option>
            {QUESTION_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>

        </div>
        <div className={`${next.questionSelect} question-control`}>
          <label className="gafus-visually-hidden" htmlFor="question-status">Статус вопроса</label>
          <select id="question-status" aria-label="Статус вопроса" value={status}
            onChange={(event) => changeView({ status: event.target.value as QuestionStatus | "" })}>
            <option value="">Все статусы</option>
            <option value="waiting">Ждёт ответа</option>
            <option value="answered">Есть ответы</option>
            <option value="resolved">Решён</option>
          </select>

        </div>
        </div>
        <div className={`${next.questionOptions} next-questions-options`}>
        <div className={`${next.tabs} ${next.questionScope}`} role="group" aria-label="Чьи вопросы">
          <button type="button" aria-label="Все вопросы" aria-pressed={!mine} aria-current={!mine?"true":undefined}
            className={`${next.questionTab} ${!mine?next.questionTabActive:""}`}
            onClick={()=>changeView({mine:false})}>Все</button>
          <button type="button" aria-label="Мои вопросы" aria-pressed={mine}
            className={`${next.questionTab} ${mine?next.questionTabActive:""}`}
            onClick={()=>changeView({mine:true})}>Мои</button>
        </div>
        <div className={`${next.tabs} ${next.questionSort}`} role="group" aria-label="Сортировка вопросов">
          {([ ["new","Новые"], ["active","Активные"], ["unanswered","Без ответа"] ] as const)
            .map(([value,label])=><button key={value} type="button"
              aria-pressed={sort===value} aria-current={sort===value?"true":undefined}
              className={`${next.questionTab} ${sort===value?next.questionTabActive:""}`}
              onClick={()=>changeView({sort:value})}>{label}</button>)}
        </div>
        <label className="gafus-visually-hidden" htmlFor="question-sort">Сортировка</label>
        <select className="gafus-visually-hidden"
          id="question-sort"
          value={sort}
          onChange={(e) => changeView({ sort: e.target.value as QuestionSort })}
        >
          <option value="new">Новые</option>
          <option value="active">Активные</option>
          <option value="unanswered">Без ответа</option>
        </select>
        {(filtersApplied || search) && <button type="button"
          onClick={() => {
            changeView({ ...DEFAULT_QUESTIONS_VIEW }); setTerm("");
          }}>
          Сбросить фильтры
        </button>}
        </div>
      </div>
      {!searchSettled && <p role="status">Ищем вопросы…</p>}
      {query.isPending && searchSettled && <Loading message="Загружаем вопросы…" />}
      {query.isFetching && query.data && searchSettled &&
        <p role="status">Обновляем вопросы…</p>}
      {searchSettled && showReadError && (
        <div role="alert">
          <p>
            {unauthenticated
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к вопросам."
                : notFound
                  ? "Раздел вопросов недоступен."
                  : "Не удалось загрузить вопросы."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && !notFound && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {ready && query.data!.pages[0]?.blockReason && (
        <p>Публикации ограничены. Обсуждения остаются доступными для чтения.</p>
      )}
      {ready && items.length === 0 && <p className="empty-state">
        {filtersApplied ? "По выбранным фильтрам вопросов нет." :
          "Вопросов пока нет."}
      </p>}
      {ready && items.length > 0 && (
        <ul className={`${next.list} compact-grid question-catalog-grid`}>
          {items.map((q) => (
            <li className="question-catalog-card" key={q.id}>
              <NextQuestionPreview question={q}/>
            </li>
          ))}
        </ul>
      )}
      {ready && query.isFetchNextPageError && (
        <div role="alert">
          <p>Не удалось загрузить следующую страницу вопросов.</p>
          <PrimaryButton type="button" disabled={pageBusy} onClick={requestNextPage}>
            {pageBusy ? "Загрузка…" : "Повторить страницу"}
          </PrimaryButton>
        </div>
      )}
      {ready && query.hasNextPage && !query.isFetchNextPageError && (
        <PrimaryButton
          type="button"
          disabled={pageBusy}
          onClick={requestNextPage}
        >
          {pageBusy ? "Загрузка…" : "Ещё вопросы"}
        </PrimaryButton>
      )}
    </section>
  );
}
