import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton, SecondaryButtonLink } from "../../shared/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  QUESTION_CATEGORIES,
  QUESTION_LIMITS,
  type QuestionCategory,
} from "@gafus/types";
import { createQuestion, listQuestionsPage } from "./questionApi";
import { QuestionPhotoPicker } from "./QuestionPhotoPicker";
import type { PendingQuestionPhoto } from "./questionMedia";
import { navigate, questionPath, RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import "../moments/web4-social-visual-parity.css";

type Attempt = { fingerprint: string; id: string };

// Per-principal component identity keeps drafts, idempotency keys and pending
// mutation state from being reused after an account switch.
export function QuestionCreate({ userId }: { userId: string }) {
  return <QuestionCreateScreen key={userId} userId={userId} />;
}

function QuestionCreateScreen({ userId }: { userId: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [tagsError, setTagsError] = useState("");
  const [category, setCategory] = useState<QuestionCategory>("Другое");
  const [photos, setPhotos] = useState<PendingQuestionPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const submitFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const cache = useQueryClient();
  const rights = useQuery({
    queryKey: ["questions", "create-rights", userId],
    queryFn: () => listQuestionsPage(),
    staleTime: 0,
    retry: false,
  });
  const rightsReady = rights.isSuccess && !rights.isFetching;
  const unauthenticated = rights.error instanceof ApiError && rights.error.status === 401;
  const forbidden = rights.error instanceof ApiError && rights.error.status === 403;
  const mutation = useMutation({
    mutationFn: createQuestion,
    onSuccess: async (id) => {
      if (!active.current) return;
      attempt.current = null;
      await cache.invalidateQueries({ queryKey: ["questions", "catalog", userId] });
      if (active.current) navigate(questionPath(id));
    },
  });
  const rateLimited = mutation.error instanceof ApiError && mutation.error.status === 429;
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  const mutationUnauthenticated =
    mutation.error instanceof ApiError && mutation.error.status === 401;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rightsReady || !rights.data.canPublish || mutation.isPending ||
      uploading || submitFlight.current) return;
    const tags = tagsInput.split(",").map(item => item.trim().replace(/^#+/, "").trim())
      .filter(Boolean);
    if (tags.length > QUESTION_LIMITS.tags || tags.some(tag => tag.length > 32)) {
      setTagsError("Не более 5 тегов, длина каждого — до 32 символов.");
      return;
    }
    setTagsError("");
    const photoIds = photos.map((photo) => photo.id);
    const fingerprint = JSON.stringify([title.trim(), body.trim(), category, tags, photoIds]);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, id: crypto.randomUUID() };
    }
    // Acquire before React paints mutation.isPending, including same-turn submits.
    submitFlight.current = true;
    void mutation.mutateAsync({
      title,
      body,
      category,
      tags,
      clientRequestId: attempt.current.id,
      photoIds,
    }).catch(() => undefined).finally(() => {
      submitFlight.current = false;
    });
  }
  return (
    <section className="collection-section" aria-label="Создать вопрос">
      <p>
        <BackButtonLink to="/questions">Все вопросы</BackButtonLink>
      </p>
      <h2>Задать вопрос</h2>
      <p className="web4-question-create-subtitle">Опишите ситуацию, чтобы другие владельцы могли поделиться своим опытом.</p>
      {rights.isPending && <Loading message="Проверяем доступ к публикации…" />}
      {rights.isFetching && rights.data && <Loading message="Проверяем доступ к публикации…" />}
      {rights.isError && (
        <div role="alert">
          <p>
            {unauthenticated
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Публикация запрещена для аккаунта."
                : "Не удалось проверить доступ к вопросам."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && (
              <PrimaryButton type="button" onClick={() => void rights.refetch()}>
                Проверить снова
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {rightsReady && !rights.data.canPublish && (
        <p role="alert">Публикация вопросов сейчас недоступна для вашего аккаунта.</p>
      )}
      {rightsReady && rights.data.canPublish && (
        <form onSubmit={submit}>
          <div className="web4-question-fields">
            <div className="web4-question-field">
              <label htmlFor="question-title">Заголовок <span aria-hidden="true">*</span></label>
              <input id="question-title" required maxLength={QUESTION_LIMITS.title}
                value={title} placeholder="Что вы хотите узнать?"
                onChange={event => setTitle(event.target.value)} />
            </div>
            <div className="web4-question-field">
              <label htmlFor="question-body">Подробности <span aria-hidden="true">*</span></label>
              <textarea id="question-body" required rows={5}
                maxLength={QUESTION_LIMITS.body} value={body}
                placeholder="Опишите ситуацию и что уже пробовали"
                onChange={event => setBody(event.target.value)} />
            </div>
            <div className="web4-question-fields-row">
              <div className="web4-question-field">
                <label htmlFor="question-category">Категория</label>
                <select id="question-category" value={category}
                  onChange={event => setCategory(event.target.value as QuestionCategory)}>
                  {QUESTION_CATEGORIES.map(value => <option key={value}>{value}</option>)}
                </select>
              </div>
              <div className="web4-question-field">
                <label htmlFor="question-tags">Теги <span className="web4-question-optional">Необязательно · до 5</span></label>
                <input id="question-tags" value={tagsInput} maxLength={180}
                  placeholder="щенок, прогулка, поводок"
                  onChange={event => { setTagsInput(event.target.value); setTagsError(""); }} />
                {tagsError && <p role="alert">{tagsError}</p>}
              </div>
            </div>
          </div>
          <div className="web4-question-photos-block">
            <h3>Фотографии <span className="web4-question-optional">Необязательно</span></h3>
          <QuestionPhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} />
          </div>
          <div className="web4-question-create-actions">
            <PrimaryButton disabled={mutation.isPending || uploading} type="submit">
              {mutation.isPending ? "Публикуем…" : "Опубликовать вопрос"}
            </PrimaryButton>
            <SecondaryButtonLink href="/questions" variant="red">Отмена</SecondaryButtonLink>
          </div>
          {mutation.isError && (
            <div role="alert">
              <p>
                {rateLimited
                  ? "Лимит публикаций достигнут. Повторите позже."
                  : conflict
                    ? "Конфликт публикации. Проверьте список вопросов перед повтором."
                    : mutationUnauthenticated
                      ? "Сессия завершена. Войдите снова."
                      : "Не удалось опубликовать вопрос. Повторите попытку."}
              </p>
              {mutationUnauthenticated && <RouteLink to="/login">Войти</RouteLink>}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
