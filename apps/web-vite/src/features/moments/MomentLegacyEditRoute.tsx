import { Loading } from "../../shared/ui";
import { PrimaryButton } from "../../shared/ui";
import { useQuery } from "@tanstack/react-query";
import { navigate, momentPath, RouteLink } from "../../shared/router/location";
import { getMomentsStatus } from "./momentsApi";
import { getMomentEditor } from "./momentComposerApi";
import { MomentComposer } from "./MomentComposer";
import { MomentEditPublishedText } from "./MomentEditPublishedText";
import "./moment-editor-clean.css";

/** Never create a new draft while opening an existing Next edit bookmark. */
export function MomentLegacyEditRoute({ userId, editId }: {
  userId: string; editId: string;
}) {
  const status = useQuery({
    queryKey: ["moments", "status", userId],
    queryFn: getMomentsStatus, retry: false, staleTime: 0, gcTime: 0,
  });
  // Keep an accepted editor mounted during its child composer status refetch.
  // Its own mutations still require the fresh Core permission/read guard.
  const allowed = status.isSuccess && status.data.enabled;
  const editor = useQuery({
    queryKey: ["moments", "legacy-editor", userId, editId],
    queryFn: () => getMomentEditor(editId),
    enabled: allowed, retry: false, staleTime: 0, gcTime: 0,
  });
  const fresh = allowed && editor.isSuccess && !editor.isFetching;
  return <section aria-label="Изменить публикацию"
    className="collection-section moment-edit-route">
    <header className="moment-edit-route-header">
      <span className="moment-editor-eyebrow">Моменты · Изменить публикацию</span>
      <h1>{fresh && editor.data.status === "draft" ? "Редактирование черновика" : "Редактирование публикации"}</h1>
      <p>Внесите изменения и сохраните черновик или опубликуйте его.</p>
    </header>
    {status.isPending && <Loading message="Проверяем доступ…" />}
    {status.isError && <p role="alert">Не удалось проверить доступ к «Моментам».
      <PrimaryButton onClick={() => void status.refetch()}>Повторить</PrimaryButton>
    </p>}
    {status.isSuccess && !status.data.enabled &&
      <p role="alert">Моменты сейчас недоступны.</p>}
    {allowed && editor.isPending && <Loading message="Загружаем редактор…" />}
    {allowed && editor.isError &&
      <p role="alert">Публикация или право редактирования недоступны.</p>}
    {fresh && !editor.data.canEdit &&
      <p role="alert">Право редактирования больше недоступно.</p>}
    {fresh && editor.data.canEdit && editor.data.status === "published" &&
      <MomentEditPublishedText key={userId + ":" + editId}
        userId={userId} postId={editId} initiallyOpen
        onClose={() => navigate(momentPath(editId))} />}
    {fresh && editor.data.canEdit && editor.data.status !== "published" &&
      <MomentComposer key={userId + ":" + editId}
        userId={userId} draftId={editId} embedded />}
    {fresh && editor.data.status === "published" &&
      <p><RouteLink to={momentPath(editId)}>Посмотреть публикацию</RouteLink></p>}

  </section>;
}
