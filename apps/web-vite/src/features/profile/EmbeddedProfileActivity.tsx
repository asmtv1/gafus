import { Loading } from "../../shared/ui";
import { Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMomentsStatus } from "../moments/momentsApi";
import source from "../../brand/LegacyProfileFeedState.module.css";
import "./moment-profile-card-next.css";

const MomentsProfile = lazy(() =>
  import("../moments/MomentsProfile").then(({ MomentsProfile }) => ({ default: MomentsProfile })),
);

/** On owner /profile the retained Next FeedAuthorPostsList has a different
 * availability state than the standalone author page. Share the SAME source
 * status Hono query key with MomentsProfile; don't fabricate a feed item or
 * weaken owner checks when the account changes during the pending GET. */
export function EmbeddedProfileActivity({ userId, username, isCurrent }: {
  userId: string;
  username: string;
  isCurrent: () => boolean;
}) {
  const enabled = useQuery({
    queryKey: ["moments", "status", userId],
    queryFn: getMomentsStatus,
    enabled: isCurrent(),
    staleTime: 0,
    retry: false,
  });
  if (!isCurrent()) return null;
  if (enabled.isPending || enabled.isFetching && !enabled.data)
    return <div className={source.card}>
      <Loading message="Проверяем доступность «Моментов»…" />
    </div>;
  if (enabled.isError)
    return <div className={source.card} role="alert">
      <p>Не удалось проверить доступность «Моментов».</p>
      <button type="button" className={source.retry}
        onClick={() => void enabled.refetch()}>Повторить</button>
    </div>;
  if (!enabled.data?.enabled)
    return <div className={source.card} data-next-profile-feed-disabled>
      <p>Раздел «Моменты» пока недоступен. Ваши публикации и альбомы не затронуты.</p>
    </div>;
  return <Suspense fallback={<Loading message="Загружаем публикации…" />}>
    <MomentsProfile userId={userId} username={username} />
  </Suspense>;
}
