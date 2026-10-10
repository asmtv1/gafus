"use client";
import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { feedApi } from "./api";
import { FeedCard } from "./FeedViews";
import { LoadingState } from "@/shared/components/ui";
import styles from "./Feed.module.css";
export function FeedPersonalPage({ hidden = false }: { hidden?: boolean }) {
  const { data: session } = useSession();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const saved = useInfiniteQuery({ queryKey: ["feed", "saved", session?.user?.id], queryFn: ({ pageParam }) => feedApi.listBookmarks({ cursor: pageParam }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, enabled: !!session?.user?.id && !hidden });
  const authors = useInfiniteQuery({ queryKey: ["feed", "hidden-authors", session?.user?.id], queryFn: ({ pageParam }) => feedApi.listHiddenAuthors({ cursor: pageParam }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, enabled: !!session?.user?.id && hidden });
  const active = hidden ? authors : saved;
  return <main className={styles.surface}><div className={styles.header}><h1 className={styles.title}>{hidden ? "Скрытые авторы" : "Закладки"}</h1><Link href="/feed">Вернуться в ленту</Link></div>
    {hidden && <p>Публикации этих авторов скрыты только из вашей ленты. Их профили и сохранённые посты доступны.</p>}
    {!session?.user?.id ? <p>Войдите в аккаунт.</p> : active.isPending ? <LoadingState variant="inline" size="large" message="Загружаем…" /> : active.isError ? <p role="alert">Не удалось загрузить список. <button onClick={() => void active.refetch()}>Повторить</button></p> :
      !active.data?.pages.some(page => page.items.length) ? <p className={styles.empty}>{hidden ? "Скрытых авторов пока нет." : "Сохранённых публикаций пока нет."}</p> : null}
    {error && <p role="alert">{error}</p>}
    {hidden ? authors.data?.pages.flatMap(page => page.items).map(author => <div className={styles.comment} key={author.id}>
      <Link href={`/profile?username=${encodeURIComponent(author.username)}`}>{author.name}</Link>
      <button className={styles.secondary} disabled={busy !== null} onClick={async () => {
        setBusy(author.id); setError("");
        try { await feedApi.setAuthorPreference(author.id, { hidden: false }); await cache.invalidateQueries({ queryKey: ["feed"] }); }
        catch (err) { setError(err instanceof Error ? err.message : "Не удалось вернуть автора."); }
        finally { setBusy(null); }
      }}>Вернуть в ленту</button>
    </div>) : saved.data?.pages.flatMap(page => page.items).map(post => <FeedCard key={post.id} post={post} />)}
    {active.hasNextPage && <button className={styles.secondary} disabled={active.isFetchingNextPage} onClick={() => void active.fetchNextPage()}>Показать ещё</button>}
    {active.isFetchingNextPage && <LoadingState variant="inline" size="small" message="Загружаем…" />}
  </main>;
}
