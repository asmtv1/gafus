import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { getTrainingDiary, postTrainingDiary, type VerifiedDiaryEntry } from "./trainingDiaryApi";
import {PrimaryButton} from "../../shared/ui";
import "./TrainingLearnerForms.css";

type DiaryEditorProps = {
  userId: string; courseId: string; dayOnCourseId: string;
};

/** Learner DIARY text only; no training step progress, completion or offline writes. */
export function DiaryEditor(props: DiaryEditorProps) {
  return <DiaryEditorTarget key={JSON.stringify([
    props.userId, props.courseId, props.dayOnCourseId,
  ])} {...props} />;
}

function DiaryEditorTarget({ userId, courseId, dayOnCourseId }: DiaryEditorProps) {
  const cache = useQueryClient();
  const key = ["training", "diary", userId, courseId, dayOnCourseId];
  const [draft, setDraft] = useState("");
  const [needsCheck, setNeedsCheck] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [retired, setRetired] = useState(false);
  const active = useRef(true);
  const initialized = useRef(false);
  const flight = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const activeActor = cache.getQueryData<{ id: string } | null>(
    CURRENT_USER_QUERY_KEY,
  )?.id === userId;
  useEffect(() => {
    active.current = true;
    const unsubscribe = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
        !event.query.queryKey.every((value: unknown, i: number) =>
          value === CURRENT_USER_QUERY_KEY[i])) return;
      // Even same-ID auth refresh must not revive an old mutation or private GET.
      setRetired(true);
    });
    return () => { active.current = false; unsubscribe(); };
  }, [cache]);
  const actorOk = activeActor && !retired;
  const query = useQuery({
    queryKey: key,
    queryFn: () => getTrainingDiary(courseId, dayOnCourseId),
    enabled: actorOk,
    retry: false, staleTime: 0, gcTime: 0,
  });
  const ready = actorOk && !denied && query.isSuccess && !query.isFetching;
  const history = ready ? query.data : [];
  const current = history.find(entry => entry.dayOnCourseId === dayOnCourseId);
  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    setDraft(current?.content ?? "");
  }, [ready, current?.content]);

  const save = useMutation({
    retry: false,
    mutationFn: async (content: string): Promise<{
      entries: VerifiedDiaryEntry[]; content: string;
    }> => {
      const normalized = content.trim();
      await postTrainingDiary(dayOnCourseId, normalized);
      const entries = await getTrainingDiary(courseId, dayOnCourseId);
      if (!entries.some(entry => entry.dayOnCourseId === dayOnCourseId &&
        entry.content === normalized)) {
        throw Error("DIARY_POST_NOT_CONFIRMED_BY_GET");
      }
      return { entries, content: normalized };
    },
    onSuccess: ({ entries, content }) => {
      if (!active.current || !actorOk ||
        cache.getQueryData<{ id: string } | null>(CURRENT_USER_QUERY_KEY)?.id !== userId)
        return;
      cache.setQueryData(key, entries);
      setNeedsCheck(false);
      if (latestDraft.current.trim() === content) {
        setDraft(content);
        setConfirmed(true);
      }
    },
    onError: error => {
      if (!active.current) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        setDenied(true);
      } else {
        // 500, missing/contradictory ACK or failed post-ACK GET is ambiguous.
        // No second write until the user explicitly re-reads server truth.
        setNeedsCheck(true);
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = draft.trim();
    if (!ready || !initialized.current || denied || needsCheck || flight.current ||
      save.isPending || normalized.length < 1 || normalized.length > 10000) return;
    flight.current = true;
    setConfirmed(false);
    void save.mutateAsync(normalized).catch(() => undefined).finally(() => {
      flight.current = false;
    });
  }

  async function verifyManually() {
    if (!actorOk || denied || flight.current || save.isPending || query.isFetching) return;
    const result = await query.refetch();
    if (!active.current) return;
    if (result.isSuccess) {
      setNeedsCheck(false);
      save.reset();
      // Keep unsent text; a matching recovered server value is now confirmed.
      const matching = result.data.find(entry => entry.dayOnCourseId === dayOnCourseId);
      setConfirmed(matching?.content === latestDraft.current.trim() &&
        !!latestDraft.current.trim());
    } else if (result.error instanceof ApiError &&
      [401, 403, 404].includes(result.error.status)) {
      setDenied(true);
    }
  }

  const terminalRead = query.error instanceof ApiError &&
    [401, 403, 404].includes(query.error.status);
  const unavailable = !actorOk || denied || terminalRead;
  return <section className="training-diary" aria-label="Дневник обучения">
    <header className="training-diary-header">
      <span className="training-diary-icon" aria-hidden="true">✎</span>
      <div className="training-diary-intro">
        <span className="training-learner-eyebrow">Личные заметки</span>
        <h4>Дневник обучения</h4>
        <p>Сохраните свои наблюдения, успехи и вопросы после занятия.</p>
      </div>
    </header>
    {unavailable && <p role="alert">Нет доступа к дневнику.</p>}
    {!unavailable && query.isPending && <Loading message="Загружаем записи дневника…" />}
    {!unavailable && query.isFetching && query.data &&
      <Loading variant="compact" message="Перепроверяем доступ к записям…" />}
    {!unavailable && query.isError && <div role="alert">
      <p>Не удалось загрузить дневник.</p>
      <PrimaryButton type="button" onClick={() => void query.refetch()}>Повторить чтение</PrimaryButton>
    </div>}
    {ready && <>
      {!!history.length && <h5 className="training-diary-history-heading">История записей</h5>}
      <ol className="training-diary-history" aria-label="История дневника">
        {history.map(entry => <li key={entry.id}>
          <strong>{entry.dayTitle}</strong>
          <p>{entry.content}</p>
          <time dateTime={entry.updatedAt}>{entry.updatedAt}</time>
        </li>)}
      </ol>
      {!history.length && <div className="training-diary-empty">
        <span aria-hidden="true">✦</span>
        <p>Записей пока нет.</p>
        <small>Первая заметка поможет увидеть ваш прогресс со временем.</small>
      </div>}
      <form className="training-diary-form" aria-label="Дневник обучения" onSubmit={submit}>
        <div className="training-learner-field-heading">
          <label htmlFor="training-diary-content">Запись за этот день</label>
          <span className="training-learner-optional">Видна только вам</span>
        </div>
        <p className="training-learner-field-hint">Что получилось? Что хотелось бы улучшить на следующем занятии?</p>
        <textarea id="training-diary-content" aria-label="Запись дневника"
          value={draft} rows={5} maxLength={10000}
          placeholder="Например, сегодня у нас получилось…"
          onChange={event => { setDraft(event.target.value); setConfirmed(false); }} />
        <div className="training-learner-form-footer">
          <span className="training-learner-counter" aria-label="Количество символов записи">
            {draft.length.toLocaleString("ru-RU")} / 10 000
          </span>
          <PrimaryButton type="submit" disabled={!draft.trim() || draft.trim().length > 10000 ||
            needsCheck || save.isPending || flight.current}>
            {save.isPending ? "Сохраняем запись…" : "Сохранить запись"}
          </PrimaryButton>
        </div>
        {confirmed && <p role="status">Запись подтверждена сервером.</p>}
        {save.isError && !denied && <p role="alert">
          Не удалось подтвердить сохранение записи. Сначала проверьте состояние на сервере.
        </p>}
        {needsCheck && <PrimaryButton type="button" disabled={query.isFetching || save.isPending}
          onClick={() => void verifyManually()}>Проверить состояние записи</PrimaryButton>}
      </form>
    </>}
  </section>;
}
