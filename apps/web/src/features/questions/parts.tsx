"use client";
import { questionThumbnailUrl } from "@gafus/types";
import { reportClientError } from "@gafus/error-handling";
import {
  CheckCircleOutline,
  ChatBubbleOutline,
  VisibilityOutlined,
  Close,
  AddPhotoAlternateOutlined,
  ChevronLeftRounded,
  ChevronRightRounded,
  CloseRounded,
} from "@mui/icons-material";
import type { QuestionAuthorDto, QuestionListItemDto, QuestionPhotoDto } from "@gafus/types";
import { QUESTION_LIMITS } from "@gafus/types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SecondaryButton } from "@/shared/components/ui";
import { uploadQuestionPhoto, discardQuestionPhoto } from "./api";
import s from "./Questions.module.css";
import viewerStyles from "../feed/FeedMedia.module.css";
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
/** Same body-level full-screen viewer as Moments; never navigates to S3. */
export function Photos({ photos }: { photos: QuestionPhotoDto[] }) {
  if (!photos.length) return null;
  return <QuestionPhotosViewer photos={photos} />;
}

function QuestionPhotosViewer({ photos }: { photos: QuestionPhotoDto[] }) {
  const [position, setPosition] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const index = Math.min(position, Math.max(0, photos.length - 1));
  const current = photos[index];
  const total = photos.length;

  useEffect(() => setPortalTarget(document.body), []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (viewerOpen && !dialog.open) dialog.showModal();
    if (!viewerOpen && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [viewerOpen, portalTarget]);

  const move = (delta: number) => {
    if (total > 1) setPosition(value => (value + delta + total) % total);
  };

  return (
    <>
      <div className={s.photos}>
        {photos.map((photo, photoIndex) => (
          <button
            key={photo.id}
            type="button"
            className={s.photoOpen}
            aria-label={`Увеличить фотографию ${photoIndex + 1}`}
            onClick={() => { setPosition(photoIndex); setViewerOpen(true); }}
          >
            <img
              src={questionThumbnailUrl(photo.url)}
              alt={`Фото ${photoIndex + 1} из ${total}`}
              className={s.photo}
              loading="lazy"
              onError={event => {
                // A newly published thumb may lag behind the full image at the edge.
                if (event.currentTarget.src !== photo.url) event.currentTarget.src = photo.url;
              }}
            />
          </button>
        ))}
      </div>
      {portalTarget && createPortal(
        <dialog
          ref={dialogRef}
          className={viewerStyles.viewer}
          aria-label="Просмотр фотографии"
          onClose={() => setViewerOpen(false)}
          onClick={event => {
            if (event.target === event.currentTarget) setViewerOpen(false);
          }}
          onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              move(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
        >
          <div className={viewerStyles.viewerToolbar}>
            <span className={viewerStyles.viewerCounter}>Фото {index + 1} из {total}</span>
            <button type="button" className={viewerStyles.closeButton}
              aria-label="Закрыть просмотр" onClick={() => setViewerOpen(false)}>
              <CloseRounded aria-hidden="true" />
            </button>
          </div>
          <div className={viewerStyles.viewerBody}>
            {current && <img key={current.id} src={current.url}
              alt={`Фото ${index + 1} из ${total}`} className={viewerStyles.viewerImage} />}
          </div>
          {total > 1 && (
            <div className={viewerStyles.viewerFooter}>
              <button type="button" className={viewerStyles.viewerNav}
                aria-label="Предыдущее фото" onClick={() => move(-1)}>
                <ChevronLeftRounded aria-hidden="true" /> Назад
              </button>
              <span>{index + 1} / {total}</span>
              <button type="button" className={viewerStyles.viewerNav}
                aria-label="Следующее фото" onClick={() => move(1)}>
                Далее <ChevronRightRounded aria-hidden="true" />
              </button>
            </div>
          )}
        </dialog>, portalTarget,
      )}
    </>
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
    <div className={s.photoPicker}>
      <div className={s.photoPickerGrid}>
        {photos.map((photo, index) => (
          <div className={s.photoSlot} key={photo.id}>
            <img src={questionThumbnailUrl(photo.url)} alt={`Фото ${index + 1}`} className={s.photo} />
            <SecondaryButton
              className={s.removePhotoButton}
              disabled={busy}
              aria-label={`Убрать фото ${index + 1}`}
              title="Убрать фото"
              onClick={() => {
                onChange(photos.filter((item) => item.id !== photo.id));
                void discardQuestionPhoto(photo.id).catch(() => undefined);
              }}
            >
              <Close fontSize="small" aria-hidden="true" />
            </SecondaryButton>
          </div>
        ))}
        {photos.length < QUESTION_LIMITS.photos && (
          <SecondaryButton
            className={s.addPhotoTile}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <AddPhotoAlternateOutlined aria-hidden="true" />
            <span>{busy ? "Загружаем…" : "Добавить фото"}</span>
          </SecondaryButton>
        )}
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
          if (files.some((file) => file.size > QUESTION_LIMITS.photoBytes)) {
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
      <p className={s.photoHint}>
        {photos.length} из {QUESTION_LIMITS.photos} фото · JPG, PNG, WebP · до 10 МБ каждое
      </p>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
