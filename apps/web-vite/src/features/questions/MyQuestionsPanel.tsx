import { useInfiniteQuery } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { listOwnerProfileQuestions } from "../profile/profileQuestionsOwnerApi";
import { RouteLink } from "../../shared/router/location";
import { ProfileQuestionListCard } from "../profile/ProfileQuestionListCard";
import s from "../../brand/LegacyMyQuestions.module.css";
import { Loading } from "../../shared/ui";
import primary from "../../brand/LegacyPrimaryButton.module.css";
import {PrimaryButton} from "../../shared/ui";

/** Next MyQuestionsList geometry + authoritative Hono mine=true filter.
 * Unlike the public catalog, the profile has no sort/filter toolbar.
 */
export function MyQuestionsPanel({ ownerId }: { ownerId: string }) {
  const query = useInfiniteQuery({
    queryKey: ["questions", "owner", ownerId, "profile", "mine"],
    queryFn: ({pageParam}) => listOwnerProfileQuestions(pageParam),
    initialPageParam: 1,
    getNextPageParam: page => page.nextPage ?? undefined,
    retry: false, staleTime: 0, gcTime: 0,
  });
  // Next preserves already-loaded cards across pending revalidation and a
  // transient failed page GET, adding an error banner instead of destroying
  // the list. However, after an explicit 401/403 we must immediately fence
  // all cached owner data, even if React Query still holds its previous page.
  const denied = query.isError && query.error instanceof ApiError &&
    (query.error.status === 401 || query.error.status === 403);
  const ready = query.data !== undefined && !denied;
  const first = ready ? query.data.pages[0] : null;
  const seen = new Set<string>();
  const rows = ready ? query.data.pages.flatMap(page => page.items).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);return true;
  }) : [];
  return <section className={`${s.section} next-my-questions`} aria-label="Мои вопросы" data-next-my-questions>
    <div className={s.heading}><h2>Мои вопросы</h2>
      {first?.canPublish && <RouteLink
        className={`${primary.root} gafus-primary-button ${s.askButton}`}
        to="/questions/new">Задать вопрос</RouteLink>}
    </div>
    {query.isPending &&
      <Loading message="Загружаем ваши вопросы…" />}
    {query.isError && <div className={s.error} role="alert">
      <span>Не удалось загрузить вопросы.</span>
      <PrimaryButton type="button" onClick={() => void query.refetch()}>Повторить</PrimaryButton>
    </div>}
    {ready && rows.length === 0 && <div className={s.empty}>
      <p>Вы пока не задавали вопросов.</p>
      {first?.canPublish && <RouteLink to="/questions/new">Задать первый вопрос</RouteLink>}
    </div>}
    {ready && rows.length > 0 && <div className={s.list}>
      {rows.map(q => <ProfileQuestionListCard key={q.id} question={q}/>)}
    </div>}
    {ready && query.hasNextPage && <button type="button" className={s.more}
      disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
      {query.isFetchingNextPage ? "Загружаем…" : "Показать ещё вопросы"}
    </button>}
  </section>;
}
