import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUESTION_LIMITS } from "@gafus/types";
import {
  editQuestionAnswer, deleteQuestionAnswer, type QuestionAnswerCard,
} from "./questionApi";
import { QuestionPhotoPicker } from "./QuestionPhotoPicker";
import type { PendingQuestionPhoto } from "./questionMedia";
import {PrimaryButton,SecondaryButton} from "../../shared/ui";

/** Only the server can authorize PATCH/DELETE; these controls are presentation. */
type AnswerOwnerProps = { userId: string; questionId: string; answer: QuestionAnswerCard };

export function AnswerOwnerControls(props: AnswerOwnerProps) {
  return <AnswerOwnerTarget key={JSON.stringify([
    props.userId, props.questionId, props.answer.id,
  ])} {...props} />;
}

function AnswerOwnerTarget({ userId, questionId, answer }: AnswerOwnerProps) {
  const flight = useRef(false);
  const photoSubmitRef = useRef<(() => Promise<PendingQuestionPhoto[]>) | null>(null);
  const [photoError, setPhotoError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [editing, setEditing] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);
  const restoreDeleteFocus = useRef(false);
  useLayoutEffect(() => {
    if (deleteRequested) deleteConfirmRef.current?.focus();
    else if (restoreDeleteFocus.current) {
      restoreDeleteFocus.current = false;
      if (active.current && deleteTriggerRef.current?.isConnected) deleteTriggerRef.current.focus();
    }
  }, [deleteRequested]);
  const [body, setBody] = useState(answer.body);
  const [retainedPhotoIds, setRetainedPhotoIds] = useState(answer.photoIds);
  const [pendingPhotos, setPendingPhotos] = useState<PendingQuestionPhoto[]>([]);
  const [photosBusy, setPhotosBusy] = useState(false);
  const photoBusyRef = useRef(false);
  const onPhotoBusy = (value: boolean) => {
    photoBusyRef.current = value;
    setPhotosBusy(value);
  };
  // Identical answer IDs may occur in concurrently mounted root/nested lists.
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const bodyId = `edit-answer-body-${scope}`;
  const errorId = `edit-answer-error-${scope}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (editing) {
      bodyRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      const trigger = triggerRef.current;
      // On retired targets/unmount or external focus transitions do not steal focus.
      if (active.current && trigger?.isConnected && !trigger.hidden) trigger.focus();
    }
  }, [editing]);
  const closeEditor = () => {
    restoreFocus.current = !!formRef.current?.contains(document.activeElement);
    setEditing(false);
  };
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["questions", "detail", userId, questionId] }),
      cache.invalidateQueries({ queryKey: ["questions", "catalog", userId] }),
      cache.invalidateQueries({ queryKey: ["questions", "replies", userId, questionId] }),
    ]);
  };
  const edit = useMutation({
    mutationFn: (draft: { body: string; photoIds: string[] }) => editQuestionAnswer({
      answerId: answer.id, ...draft,
    }),
    onSuccess: async () => {
      await refresh();
      if (active.current) closeEditor();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteQuestionAnswer(answer.id),
    onSuccess: refresh,
  });
  const busy = edit.isPending || remove.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!answer.canEdit || busy || photosBusy || photoBusyRef.current ||
      flight.current || !body.trim()) return;
    flight.current = true;
    // Keep detached photos bound until original Core confirms the new set.
    setPhotoError("");
    void (async () => {
      let readyPhotos: PendingQuestionPhoto[];
      try {
        readyPhotos = photoSubmitRef.current ? await photoSubmitRef.current() : pendingPhotos;
        if (readyPhotos.some(photo => photo.id.startsWith("local-")))
          throw Error("Подготовленные фотографии недоступны.");
      } catch (reason) {
        setPhotoError(reason instanceof Error ? reason.message : "Не удалось загрузить фото");
        return;
      }
      const photoIds = [...retainedPhotoIds, ...readyPhotos.map(photo => photo.id)];
      await edit.mutateAsync({ body, photoIds }).catch(() => undefined);
    })().finally(() => { flight.current = false; });
  };
  const confirmDelete = () => {
    if (!deleteRequested || !answer.canDelete || busy || photosBusy ||
      photoBusyRef.current || flight.current) return;
    // The explicit in-page confirmation prevents native-dialog hangs while
    // retaining the one-shot guard against double DELETE submissions.
    flight.current = true;
    setDeleteRequested(false);
    void remove.mutateAsync().catch(() => undefined).finally(() => {
      flight.current = false;
    });
  };
  return <div className="answer-owner-controls">
    {answer.canEdit &&
      <button type="button" ref={triggerRef} hidden={editing} disabled={busy}
        onClick={() => {
          if (busy || flight.current) return;
          setBody(answer.body);
          setRetainedPhotoIds(answer.photoIds);setPendingPhotos([]);
          photoBusyRef.current = false;setPhotosBusy(false);setEditing(true);
        }}>Редактировать ответ</button>}
    {answer.canEdit && editing &&
      <form ref={formRef} onSubmit={submit} aria-label="Редактирование ответа"
        aria-busy={busy} aria-describedby={edit.isError ? errorId : undefined}>
      <label htmlFor={bodyId}>Текст ответа</label>
      <textarea ref={bodyRef} id={bodyId} value={body} required
        aria-invalid={edit.isError} aria-describedby={edit.isError ? errorId : undefined}
        maxLength={QUESTION_LIMITS.body} rows={5}
        onChange={e => setBody(e.target.value)} />
      <fieldset aria-label="Сохранённые фотографии ответа">
        <legend>Прикреплённые фотографии</legend>
        {retainedPhotoIds.length === 0 && <p>Нет сохранённых фотографий.</p>}
        {retainedPhotoIds.map((photoId, index) =>
          <div key={photoId}>
            <span>Фото {index + 1}</span>{" "}
            <button type="button" disabled={busy || photosBusy || photoBusyRef.current || flight.current}
              onClick={() => setRetainedPhotoIds(current =>
                current.filter(id => id !== photoId))}>
              Отцепить фото {index + 1}
            </button>
          </div>)}
        {retainedPhotoIds.length !== answer.photoIds.length &&
          <p>Выбранные фото будут отвязаны только после сохранения.</p>}
      </fieldset>
      <QuestionPhotoPicker photos={pendingPhotos} onChange={setPendingPhotos}
        onBusy={onPhotoBusy} existingCount={retainedPhotoIds.length}
        submitUploadsRef={photoSubmitRef} />
      {photoError && <p role="alert">{photoError}</p>}
      <PrimaryButton type="submit" disabled={busy || photosBusy}>
        {busy ? "Сохраняем…" : "Сохранить"}</PrimaryButton>
      <SecondaryButton variant="red" type="button" disabled={busy || photosBusy} onClick={() => {
        if (busy || photosBusy || photoBusyRef.current || flight.current) return;
        setBody(answer.body);
        closeEditor();
        edit.reset();
      }}>Отмена</SecondaryButton>
    </form>}
    {answer.canDelete && !deleteRequested &&
      <SecondaryButton variant="red" className="web4-answer-destructive-trigger" type="button" ref={deleteTriggerRef} disabled={busy || flight.current} onClick={() => {
        if (busy || photosBusy || photoBusyRef.current || flight.current) return;
        setDeleteRequested(true);
      }}>Удалить ответ</SecondaryButton>}
    {answer.canDelete && deleteRequested &&
      <div role="group" aria-label="Подтверждение удаления ответа">
        <p>Удалить свой ответ? Это действие нельзя отменить.</p>
        <SecondaryButton variant="red" type="button" ref={deleteConfirmRef} disabled={busy || flight.current}
          onClick={confirmDelete}>Да, удалить ответ</SecondaryButton>
        <SecondaryButton variant="red" type="button" disabled={busy || flight.current}
          onClick={() => {
            restoreDeleteFocus.current = true;
            setDeleteRequested(false);
          }}>Не удалять ответ</SecondaryButton>
      </div>}
    {edit.isError && <p id={errorId} role="alert">Не удалось отредактировать ответ.</p>}
    {remove.isError && <p role="alert">Не удалось удалить ответ.</p>}
  </div>;
}
