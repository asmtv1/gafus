import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUESTION_CATEGORIES, QUESTION_LIMITS } from
  "@gafus/types";
import { editQuestion, deleteQuestion, type QuestionOverview } from "./questionApi";
import { QuestionPhotoPicker } from "./QuestionPhotoPicker";
import { QuestionPhotoGallery } from "./QuestionPhotoGallery";
import type { PendingQuestionPhoto } from "./questionMedia";
import { navigate } from "../../shared/router/location";
import { PurpleButton, PrimaryButton, SecondaryButton } from "../../shared/ui";

type QuestionOwnerProps = {
  userId: string;
  questionId: string;
  question: QuestionOverview;
  initialEditing?: boolean;
  onFinished?: () => void;
  onCancel?: () => void;
  showDelete?: boolean;
};

// Retire previous editor draft, mutation observers and callbacks by owner/question.
export function QuestionOwnerControls(props: QuestionOwnerProps) {
  return <QuestionOwnerTarget key={JSON.stringify([
    props.userId, props.questionId,
  ])} {...props} />;
}

function QuestionOwnerTarget({
  userId, questionId, question, initialEditing = false,
  onFinished, onCancel, showDelete = true,
}: QuestionOwnerProps) {
  const flight = useRef(false);
  const photoSubmitRef = useRef<(() => Promise<PendingQuestionPhoto[]>) | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [editing, setEditing] = useState(initialEditing);
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
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `question-edit-title-${scope}`;
  const bodyId = `question-edit-body-${scope}`;
  const categoryId = `question-edit-category-${scope}`;
  const tagsId = `question-edit-tags-${scope}`;
  const errorId = `question-edit-error-${scope}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const restoreAfterClose = useRef(false);
  useLayoutEffect(() => {
    if (editing) {
      // Inline open and route-based initialEditing focus their first input.
      titleRef.current?.focus();
    } else if (restoreAfterClose.current) {
      restoreAfterClose.current = false;
      const trigger = triggerRef.current;
      // A route teardown or another user's editor must not take focus.
      if (!initialEditing && active.current && trigger?.isConnected && !trigger.hidden) {
        trigger.focus();
      }
    }
  }, [editing, initialEditing]);
  const closeEditor = () => {
    // Do not steal focus if the user has already moved outside this form.
    restoreAfterClose.current = !initialEditing &&
      !!formRef.current?.contains(document.activeElement);
    setEditing(false);
  };
  const [title, setTitle] = useState(question.title);
  const [body, setBody] = useState(question.body);
  const [category, setCategory] = useState(question.category);
  const [tagsInput, setTagsInput] = useState(question.tags.join(", "));
  const [retainedPhotoIds, setRetainedPhotoIds] = useState(question.photoIds);
  const [pendingPhotos, setPendingPhotos] = useState<PendingQuestionPhoto[]>([]);
  const [photosBusy, setPhotosBusy] = useState(false);
  const photoBusyRef = useRef(false);
  const onPhotoBusy = (value: boolean) => {
    photoBusyRef.current = value;
    setPhotosBusy(value);
  };
  const [formError, setFormError] = useState("");
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["questions", "detail", userId, questionId] }),
      cache.invalidateQueries({ queryKey: ["questions", "catalog", userId] }),
    ]);
  };
  const edit = useMutation({
    mutationFn: (draft: {
      title: string; body: string; category: typeof category;
      tags: string[]; photoIds: string[];
    }) => editQuestion({ questionId, ...draft }),
    onSuccess: async () => {
      await refresh();
      if (!active.current) return;
      closeEditor();
      onFinished?.();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteQuestion(questionId),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["questions", "catalog", userId] });
      if (!active.current) return;
      navigate("/questions");
    },
  });
  const busy = edit.isPending || remove.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.canEdit || busy || photosBusy || photoBusyRef.current || flight.current ||
      !title.trim() || !body.trim()) return;
    const tags = tagsInput.split(",").map(tag => tag.trim().replace(/^#+/, "").trim())
      .filter(Boolean);
    if (tags.length > QUESTION_LIMITS.tags || tags.some(tag => tag.length > 32)) {
      setFormError("До 5 тегов, длина каждого — не более 32 символов.");
      return;
    }
    setFormError("");
    flight.current = true;
    // Capture exactly the submitted fields; photo binding remains unchanged.
    // Core PATCH atomically rebinds exactly the retained and own new IDs;
    // detachment of old photos is never executed before PATCH acknowledgement.
    void (async () => {
      let readyPhotos: PendingQuestionPhoto[];
      try {
        readyPhotos = photoSubmitRef.current ? await photoSubmitRef.current() : pendingPhotos;
        if (readyPhotos.some(photo => photo.id.startsWith("local-")))
          throw Error("Подготовленные фотографии недоступны.");
      } catch (reason) {
        setFormError(reason instanceof Error ? reason.message : "Не удалось загрузить фото");
        return;
      }
      const photoIds = [...retainedPhotoIds, ...readyPhotos.map(photo => photo.id)];
      await edit.mutateAsync({ title, body, category, tags, photoIds })
        .catch(() => undefined);
    })().finally(() => { flight.current = false; });
  };
  const confirmDelete = () => {
    if (!deleteRequested || !showDelete || !question.canManage || busy ||
      photosBusy || photoBusyRef.current || flight.current) return;
    // Guard the actual DELETE, not the opening of the in-page confirmation.
    // A double click in one React turn can submit only one mutation.
    flight.current = true;
    setDeleteRequested(false);
    void remove.mutateAsync().catch(() => undefined).finally(() => {
      flight.current = false;
    });
  };
  return <div className="question-owner-controls">
    {question.canEdit && <PurpleButton type="button" ref={triggerRef} hidden={editing}
      disabled={busy} onClick={() => {
        if (busy || flight.current) return;
        setTitle(question.title); setBody(question.body); setCategory(question.category);
        setTagsInput(question.tags.join(", ")); setFormError("");
        setRetainedPhotoIds(question.photoIds);setPendingPhotos([]);
        photoBusyRef.current = false; setPhotosBusy(false); setEditing(true);
      }}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
        className="web4-question-button-icon"><path d="M12 20h9"/>
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
        Редактировать вопрос</PurpleButton>}
    {question.canEdit && editing &&
      <form ref={formRef} className="web4-question-edit-form" onSubmit={submit}
        aria-label="Редактирование вопроса"
        aria-busy={busy} aria-describedby={edit.isError ? errorId : undefined}>
        <div className="web4-question-edit-heading">
          <h2>Редактирование вопроса</h2>
          <p>Измените содержание и фотографии, затем сохраните изменения.</p>
        </div>
        <label htmlFor={titleId}>Заголовок</label>
        <input ref={titleRef} id={titleId} value={title} required
          maxLength={QUESTION_LIMITS.title}
          onChange={event => setTitle(event.target.value)} />
        <label htmlFor={bodyId}>Описание</label>
        <textarea id={bodyId} value={body} required rows={7}
          maxLength={QUESTION_LIMITS.body}
          onChange={event => setBody(event.target.value)} />
        <label htmlFor={categoryId}>Категория</label>
        <select id={categoryId} value={category}
          onChange={event => setCategory(event.target.value as typeof category)}>
          {QUESTION_CATEGORIES.map(value => <option key={value}>{value}</option>)}
        </select>
        <label htmlFor={tagsId}>Теги (через запятую, до 5)</label>
        <input id={tagsId} maxLength={180} value={tagsInput}
          placeholder="щенок, прогулка, поводок" onChange={event => {
            setTagsInput(event.target.value); setFormError("");
          }}/>
        <fieldset aria-label="Сохранённые фотографии вопроса">
          <legend>Прикреплённые фотографии</legend>
          {retainedPhotoIds.length === 0 && <p>Нет сохранённых фотографий.</p>}
          {retainedPhotoIds.map((photoId, index) =>
            <div key={photoId} className="web4-question-edit-photo-row">
              <span>Фото {index + 1}</span>
              <SecondaryButton variant="red" className="gafus-inline-red-action"
                type="button" disabled={busy || photosBusy || photoBusyRef.current || flight.current}
                onClick={() => setRetainedPhotoIds(current =>
                  current.filter(id => id !== photoId))}>
                Отцепить фото {index + 1}
              </SecondaryButton>
            </div>)}
          {retainedPhotoIds.length !== question.photoIds.length &&
            <p>Выбранные фото будут отвязаны только после сохранения.</p>}
          {retainedPhotoIds.length > 0 &&
            <QuestionPhotoGallery manual location={{ questionId, photoIds: retainedPhotoIds }} />}
          <QuestionPhotoPicker photos={pendingPhotos} onChange={setPendingPhotos}
            onBusy={onPhotoBusy} existingCount={retainedPhotoIds.length}
            submitUploadsRef={photoSubmitRef} />
        </fieldset>
        {formError && <p role="alert">{formError}</p>}
        <div className="web4-question-edit-actions">
          <PrimaryButton type="submit" disabled={busy || photosBusy}>
            {busy ? "Сохраняем…" : "Сохранить"}
          </PrimaryButton>
          <SecondaryButton variant="red" type="button" disabled={busy || photosBusy}
            onClick={() => {
              if (busy || photosBusy || photoBusyRef.current || flight.current) return;
              closeEditor(); edit.reset(); onCancel?.();
            }}>Отмена</SecondaryButton>
        </div>
      </form>}
    {showDelete && question.canManage && !deleteRequested &&
      <SecondaryButton variant="red" type="button"
      ref={deleteTriggerRef} disabled={busy || photosBusy || flight.current} onClick={() => {
        if (busy || photosBusy || photoBusyRef.current || flight.current) return;
        setDeleteRequested(true);
      }}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
        className="web4-question-button-icon"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>
        Удалить вопрос</SecondaryButton>}
    {showDelete && question.canManage && deleteRequested &&
      <div role="group" className="web4-question-delete-confirm"
        aria-label="Подтверждение удаления вопроса">
        <div className="web4-question-delete-message">
          <span className="web4-question-delete-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <div>
            <h3>Удалить вопрос?</h3>
            <p>Вопрос и всё обсуждение будут удалены. Это действие нельзя отменить.</p>
          </div>
        </div>
        <div className="web4-question-delete-actions">
          <SecondaryButton variant="red" type="button" ref={deleteConfirmRef}
            disabled={busy || flight.current}
            onClick={confirmDelete}>Да, удалить вопрос</SecondaryButton>
          <SecondaryButton type="button" disabled={busy || flight.current}
            onClick={() => {
              restoreDeleteFocus.current = true;
              setDeleteRequested(false);
            }}>Не удалять</SecondaryButton>
        </div>
      </div>}
    {edit.isError && <p id={errorId} role="alert">Не удалось изменить вопрос.</p>}
    {remove.isError && <p role="alert">Не удалось удалить вопрос.</p>}
  </div>;
}
