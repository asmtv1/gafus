"use client";
import { reportClientError } from "@gafus/error-handling";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    <main className={s.page}>
      <Link className={s.back} href={initial ? `/questions/${initial.id}` : "/questions"}>
        Назад к {initial ? "вопросу" : "вопросам"}
      </Link>
      <h1>{initial ? "Редактировать вопрос" : "Задать вопрос"}</h1>
      <p className={s.subtitle}>
        Расскажите о ситуации — другие владельцы смогут поделиться опытом.
      </p>
      <form
        className={s.form}
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
        <label className={s.field}>
          Заголовок
          <input
            required
            maxLength={QUESTION_LIMITS.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Что вы хотите узнать?"
          />
        </label>
        <label className={s.field}>
          Подробности
          <textarea
            required
            maxLength={QUESTION_LIMITS.body}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Опишите ситуацию и что уже пробовали"
          />
        </label>
        <label className={s.field}>
          Категория
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as QuestionCategory)}
          >
            {QUESTION_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          Теги через запятую · до 5
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            maxLength={180}
            placeholder="щенок, прогулка, поводок"
          />
        </label>
        <PhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.actions}>
          <button className={s.primary} disabled={busy || uploading}>
            {busy ? "Сохранение…" : initial ? "Сохранить изменения" : "Опубликовать вопрос"}
          </button>
          <Link className={s.secondary} href={initial ? `/questions/${initial.id}` : "/questions"}>
            Отмена
          </Link>
        </div>
      </form>
    </main>
  );
}
