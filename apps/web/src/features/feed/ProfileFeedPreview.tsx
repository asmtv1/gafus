"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { feedApi } from "./api";
import { LoadingState } from "@/shared/components/ui";
import styles from "./Feed.module.css";

/** Compact published-post preview, shared by own and other people's profiles. */
export function ProfileFeedPreview({ username }: { username: string }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const enabled = useQuery({
    queryKey: ["feed", "profile-preview-availability", userId],
    queryFn: () => feedApi.status(),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  const posts = useQuery({
    queryKey: ["feed", "profile-preview", userId, username],
    queryFn: () => feedApi.listProfilePosts(username, { pageSize: 3 }),
    enabled: Boolean(userId) && enabled.data?.enabled === true,
    staleTime: 30_000,
  });
  if (!userId) return null;
  if (enabled.isPending) return <LoadingState variant="inline" size="small" message="Загрузка публикаций…" />;
  if (enabled.data?.enabled !== true) return null;
  return <section className={styles.card} aria-label="Публикации пользователя">
    <h2>Публикации</h2>
    {posts.isPending && <LoadingState variant="inline" size="small" message="Загружаем публикации…" />}
    {posts.isError && <div>
      <p className={styles.muted} role="alert">Не удалось загрузить публикации.</p>
      <button className={styles.secondary} type="button" onClick={() => void posts.refetch()}>Повторить</button>
    </div>}
    {posts.isSuccess && posts.data.items.length === 0 && <p className={styles.muted}>Публикаций пока нет.</p>}
    {posts.data?.items.map(post => <div key={post.id} className={styles.comment}>
      <Link href={`/feed/${encodeURIComponent(post.id)}`} className={styles.author}>
        {post.text.trim() ? post.text.slice(0, 150) : `Публикация с ${post.attachments.length} вложениями`}
      </Link>
      {post.moderationState && post.moderationState !== "visible" && <p className={styles.error}>{post.moderationState === "removed" ? "Публикация удалена" : "Публикация скрыта"} из-за жалобы. {post.moderationReason}</p>}
      <span className={styles.muted}>{post.reactions.reduce((sum, reaction) => sum + reaction.count, 0)} реакций · {post.commentCount} комментариев</span>
    </div>)}
    <Link href={`/feed/profile/${encodeURIComponent(username)}`}>Все публикации →</Link>
  </section>;
}
