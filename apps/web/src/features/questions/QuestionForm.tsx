"use client";

import { reportClientError } from "@gafus/error-handling";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBackButtonLink, PrimaryButton, SecondaryButtonLink } from "@/shared/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  QUESTION_CATEGORIES,
  QUESTION_LIMITS,
  type QuestionCategory,
  type QuestionDetailDto,
  type QuestionPhotoDto,
} from "@gafus/types";
import { questionsApi } from "./api";
import { PhotoPicker } from "./parts";
import s from "./Questions.module.css";

export function QuestionForm({ initial }: { initial?: QuestionDetailDto }) {
  const router = useRouter();
  const cache = useQueryClient();
  const formId = useId();
  const backHref = initial ? `/questions/${initial.id}` : "/questions";
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState<QuestionCategory>(initial?.category ?? "Другое");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [photos, setPhotos] = useState<QuestionPhotoDto[]>(initial?.photos ?? []);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className={`${s.page} ${s.questionEditorPage}`}>
      <AppBackButtonLink className={s.editorBack} href={backHref}>
        Назад к {initial ? "вопросу" : "вопросам"}
      </AppBackButtonLink>
      <header className={s.editorHeader}>
        <h1>{initial ? "Редактировать вопрос" : "Задать вопрос"}</h1>
        <p className={s.subtitle}>
          Опишите ситуацию, чтобы другие владельцы могли поделиться своим опытом.
        </p>
      </header>
      <form
        className={s.questionForm}
        aria-busy={busy || uploading}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || uploading) return;
          setError("");
          const tagList = tags
            .split(",")
            .map((t) => t.trim().replace(/^#/, ""))
            .filter(Boolean);
          if (tagList.length > QUESTION_LIMITS.tags) {
            setError("Можно добавить до 5 тегов");
            return;
          }
          setBusy(true);
          const input = { title, body, category, tags: tagList, photoIds: photos.map((p) => p.id) };
          try {
            const id = initial
              ? (await questionsApi.edit(initial.id, input), initial.id)
              : (await questionsApi.create({ ...input, clientRequestId: requestId })).id;
            await cache.invalidateQueries({ queryKey: ["questions"] });
            router.push(`/questions/${id}`);
          } catch (e) {
            reportClientError(e, { issueKey: "Questions", keys: { operation: "QuestionForm" } });
            setError(e instanceof Error ? e.message : "Не удалось сохранить вопрос");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className={s.questionFields}>
          <div className={s.field}>
            <label htmlFor={`${formId}-title`}>
              Заголовок <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${formId}-title`}
              className={s.questionTitleInput}
              type="text"
              required
              maxLength={QUESTION_LIMITS.title}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Что вы хотите узнать?"
            />
          </div>
          <div className={s.field}>
            <label htmlFor={`${formId}-body`}>
              Подробности <span aria-hidden="true">*</span>
            </label>
            <textarea
              id={`${formId}-body`}
              required
              rows={5}
              maxLength={QUESTION_LIMITS.body}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Опишите ситуацию и что уже пробовали"
            />
          </div>
          <div className={s.questionFieldsRow}>
            <div className={s.field}>
              <label htmlFor={`${formId}-category`}>Категория</label>
              <select
                id={`${formId}-category`}
                value={category}
                onChange={(event) => setCategory(event.target.value as QuestionCategory)}
              >
                {QUESTION_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label htmlFor={`${formId}-tags`}>
                Теги <span className={s.optionalLabel}>Необязательно · до 5</span>
              </label>
              <input
                id={`${formId}-tags`}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                maxLength={180}
                placeholder="щенок, прогулка, поводок"
              />
            </div>
          </div>
        </div>
        <section className={s.questionPhotosSection} aria-labelledby={`${formId}-photos`}>
          <h2 id={`${formId}-photos`}>
            Фотографии <span className={s.optionalLabel}>Необязательно</span>
          </h2>
          <PhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} />
        </section>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.questionFormActions}>
          <PrimaryButton type="submit" disabled={busy || uploading}>
            {busy
              ? "Сохранение…"
              : uploading
                ? "Загрузка фото…"
                : initial
                  ? "Сохранить изменения"
                  : "Опубликовать вопрос"}
          </PrimaryButton>
          <SecondaryButtonLink href={backHref}>Отмена</SecondaryButtonLink>
        </div>
      </form>
    </main>
  );
}
