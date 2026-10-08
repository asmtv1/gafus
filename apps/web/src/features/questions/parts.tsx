"use client";
import { reportClientError } from "@gafus/error-handling";
import {
  CheckCircleOutline,
  ChatBubbleOutline,
  VisibilityOutlined,
  Close,
} from "@mui/icons-material";
import type { QuestionAuthorDto, QuestionListItemDto, QuestionPhotoDto } from "@gafus/types";
import { QUESTION_LIMITS } from "@gafus/types";
import { useRef, useState } from "react";
import { uploadQuestionPhoto, discardQuestionPhoto } from "./api";
import s from "./Questions.module.css";
export function Author({
  author,
  date,
  edited,
}: {
  author: QuestionAuthorDto;
  date: string;
  edited?: string | null;
}) {
  return (
    <div className={s.author}>
      {author.avatarUrl ? (
        <img className={s.avatar} src={author.avatarUrl} alt="" />
      ) : (
        <span className={s.avatar}>{author.name.slice(0, 1)}</span>
      )}
      <div>
        <strong>{author.name}</strong>
        <div className={s.meta}>
          {new Date(date).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {edited && " · Изменено"}
        </div>
      </div>
    </div>
  );
}
export function Status({ question }: { question: QuestionListItemDto }) {
  return (
    <div className={s.tabs}>
      <span
        className={`${s.badge} ${question.status === "resolved" ? s.resolved : question.status === "answered" ? s.answered : ""}`}
      >
        {question.status === "resolved"
          ? "Решён"
          : question.status === "answered"
            ? "Есть ответы"
            : "Ждёт ответа"}
      </span>
      {question.closed && <span className={`${s.badge} ${s.closed}`}>Обсуждение закрыто</span>}
      <span className={s.tag}>{question.category}</span>
      {question.tags.map((tag) => (
        <span key={tag} className={s.tag}>
          #{tag}
        </span>
      ))}
    </div>
  );
}
export function Counts({ question }: { question: QuestionListItemDto }) {
  return (
    <span className={`${s.meta} ${s.tabs}`}>
      <ChatBubbleOutline fontSize="small" />
      {question.answerCount} ответов <VisibilityOutlined fontSize="small" />
      {question.viewCount}
    </span>
  );
}
export function BestLabel() {
  return (
    <span className={`${s.badge} ${s.resolved}`}>
      <CheckCircleOutline fontSize="small" />
      Лучший ответ
    </span>
  );
}
export function Photos({ photos }: { photos: QuestionPhotoDto[] }) {
  return (
    <div className={s.photos}>
      {photos.map((p) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть фото"
        >
          <img src={p.url} alt="Фото к публикации" className={s.photo} loading="lazy" />
        </a>
      ))}
    </div>
  );
}
export function Body({ text }: { text: string }) {
  return (
    <div className={s.body}>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </div>
  );
}
export function PhotoPicker({
  photos,
  onChange,
  onBusy,
}: {
  photos: QuestionPhotoDto[];
  onChange: (photos: QuestionPhotoDto[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <div className={s.photos}>
        {photos.map((p) => (
          <div className={s.photoSlot} key={p.id}>
            <img src={p.url} alt="Прикреплённое фото" className={s.photo} />
            <button
              type="button"
              disabled={busy}
              aria-label="Убрать фото"
              onClick={() => {
                onChange(photos.filter((x) => x.id !== p.id));
                void discardQuestionPhoto(p.id).catch(() => undefined);
              }}
            >
              <Close fontSize="small" />
            </button>
          </div>
        ))}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          setError("");
          if (files.length + photos.length > QUESTION_LIMITS.photos) {
            setError("Можно прикрепить до 5 фото");
            return;
          }
          if (files.some((f) => f.size > QUESTION_LIMITS.photoBytes)) {
            setError("Каждое фото должно быть не больше 10 МБ");
            return;
          }
          setBusy(true);
          onBusy(true);
          const next = [...photos];
          try {
            for (const file of files) {
              next.push(await uploadQuestionPhoto(file));
              onChange([...next]);
            }
          } catch (e) {
            reportClientError(e, { issueKey: "Questions", keys: { operation: "parts" } });
            setError(e instanceof Error ? e.message : "Не удалось загрузить фото");
          } finally {
            setBusy(false);
            onBusy(false);
          }
        }}
      />
      <button
        type="button"
        className={s.secondary}
        disabled={busy || photos.length >= QUESTION_LIMITS.photos}
        onClick={() => input.current?.click()}
      >
        {busy ? "Загрузка фото…" : "Прикрепить фото"}
      </button>
      <p className={s.meta}>До 5 фото · JPG, PNG, WebP · до 10 МБ каждое</p>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
