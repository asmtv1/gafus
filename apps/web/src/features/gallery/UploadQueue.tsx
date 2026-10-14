"use client";
import { browserStorageUploadUrl } from "@/shared/lib/media/browserStorageUploadUrl";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LinearProgress } from "@mui/material";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { PrimaryButton, SecondaryButton } from "@/shared/components/ui";
import { GALLERY_LIMITS, GALLERY_MIME_TYPES, type GalleryPhotoDto } from "@gafus/types";
import { galleryApi } from "./api";
import { galleryMessage, useGalleryIdentity } from "./hooks";
import styles from "./Gallery.module.css";
import { createUploadTask, type UploadEntry as Entry } from "./uploadTask";
import { gallerySession } from "./session";
const terminal = ["ready", "failed", "cancelled", "expired"];

function FilePicker({
  children,
  onFiles,
  multiple = false,
  primary = false,
  disabled = false,
}: {
  children: ReactNode;
  onFiles: (files: FileList | null) => void;
  multiple?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const label = <>{children}</>;
  return (
    <>
      {primary ? (
        <PrimaryButton
          className={styles.uploadPrimary}
          disabled={disabled}
          onClick={() => ref.current?.click()}
        >
          <AddPhotoAlternateOutlinedIcon aria-hidden="true" />
          {label}
        </PrimaryButton>
      ) : (
        <SecondaryButton disabled={disabled} onClick={() => ref.current?.click()}>
          {label}
        </SecondaryButton>
      )}
      <input
        ref={ref}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </>
  );
}

export function UploadQueue({
  albumId,
  usedSlots,
  changed,
  failedPhotos = [],
  accent = true,
}: {
  albumId?: string;
  usedSlots: number;
  changed: () => void;
  failedPhotos?: GalleryPhotoDto[];
  accent?: boolean;
}) {
  const { authenticated, viewerId, visible } = useGalleryIdentity();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [clock, setClock] = useState(0);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const active = useRef(0);
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const polling = useRef(false);
  const running = useRef(new Set<string>());
  const alive = useRef(true);
  const identityRef = useRef(viewerId);
  identityRef.current = viewerId;
  const changedRef = useRef(changed);
  changedRef.current = changed;
  const patch = (key: string, values: Partial<Entry>) => {
    const entry = entriesRef.current.find((item) => item.key === key);
    if (entry) Object.assign(entry, values);
    if (alive.current)
      setEntries((items) => {
        const current = items.find((item) => item.key === key);
        if (current) Object.assign(current, values);
        return [...items];
      });
  };
  useEffect(() => {
    alive.current = true;
    const abort = () => {
      entriesRef.current.forEach((entry) => {
        entry.generation = (entry.generation ?? 0) + 1;
      });
      requests.current.forEach((request) => request.abort());
    };
    const unregister = gallerySession.registerAbort(abort);
    return () => {
      alive.current = false;
      abort();
      unregister();
    };
  }, []);
  useEffect(() => {
    if (!authenticated) {
      requests.current.forEach((request) => request.abort());
      setEntries([]);
    }
  }, [authenticated, viewerId]);
  const task = (entry: Entry) => {
    const startedViewer = viewerId;
    const ticket = gallerySession.snapshot();
    const valid = () =>
      alive.current && identityRef.current === startedViewer && gallerySession.current(ticket);
    return createUploadTask({
      api: galleryApi,
      albumId,
      valid,
      message: galleryMessage,
      pollVisible: () => document.visibilityState === "visible",
      changed: () => {
        if (valid()) changedRef.current();
      },
      abort: () => requests.current.get(entry.key)?.abort(),
      publish: () => {
        if (valid()) {
          setEntries((items) => [...items]);
        }
      },
      transfer: (upload, file, current) =>
        new Promise<void>((resolve, reject) => {
          const form = new FormData();
          Object.entries(upload.postFields!).forEach(([name, value]) => form.append(name, value));
          form.append("file", file); // Bucket requires the file to be the final field.
          const request = new XMLHttpRequest();
          requests.current.set(entry.key, request);
          request.open("POST", browserStorageUploadUrl(upload.postUrl!, "gallery"));
          request.timeout = 120000;
          request.upload.onprogress = (event) => {
            if (current() && event.lengthComputable && event.total > 0) {
              const progress = Math.round((event.loaded / event.total) * 100);
              if (entry.progress !== progress) patch(entry.key, { progress });
            }
          };
          request.onload = () =>
            request.status >= 200 && request.status < 300
              ? resolve()
              : reject(new Error("Не удалось отправить файл в хранилище. Повторите загрузку."));
          request.onerror = () =>
            reject(new Error("Соединение прервалось. Проверьте интернет и повторите загрузку."));
          request.ontimeout = () =>
            reject(new Error("Загрузка заняла слишком много времени. Повторите попытку."));
          request.onabort = () => reject(new Error("Загрузка отменена."));
          request.send(form);
        }),
    });
  };
  const send = async (entry: Entry) => {
    if (running.current.has(entry.key)) return;
    running.current.add(entry.key);
    active.current++;
    try {
      await task(entry).run(entry);
    } finally {
      requests.current.delete(entry.key);
      running.current.delete(entry.key);
      active.current--;
      if (alive.current) setEntries((items) => [...items]);
    }
  };
  useEffect(() => {
    if (!authenticated) return;
    entries
      .filter((entry) => entry.state === "queued" && !running.current.has(entry.key))
      .slice(0, Math.max(0, 3 - active.current))
      .forEach((entry) => {
        void send(entry);
      });
    // Queue changes drive the bounded worker pool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, authenticated]);
  const processing = entries.some((entry) => ["uploaded", "processing"].includes(entry.state));
  useEffect(() => {
    if (!processing) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, [processing]);
  useEffect(() => {
    if (!visible || !authenticated || !processing) return;
    const timer = window.setInterval(() => {
      if (polling.current || document.visibilityState !== "visible") return;
      polling.current = true;
      void Promise.all(
        entriesRef.current
          .filter((entry) => ["uploaded", "processing"].includes(entry.state) && entry.uploadId)
          .map((entry) => task(entry).poll(entry)),
      ).finally(() => {
        polling.current = false;
      });
    }, 3000);
    return () => clearInterval(timer);
    // Tasks capture the current session and entry generation before each request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, visible, authenticated, viewerId]);
  const addFiles = (files: FileList | null, retry?: Entry) => {
    if (!files) return;
    const added = Array.from(files).map((file) => {
      const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
      const error = heic
        ? "HEIC не поддерживается. Сохраните фото как JPG, PNG или WebP."
        : !GALLERY_MIME_TYPES.includes(file.type as "image/jpeg")
          ? "Выберите JPG, PNG или WebP."
          : file.size > GALLERY_LIMITS.photoBytes
            ? "Файл больше 10 МиБ. Уменьшите его размер."
            : undefined;
      return {
        ...retry,
        key: retry?.key ?? crypto.randomUUID(),
        name: file.name,
        file: error ? undefined : file,
        uploadId: retry?.uploadId,
        state: error ? "failed" : "queued",
        progress: 0,
        error,
      };
    });
    if (retry) {
      patch(retry.key, added[0]);
    } else setEntries((items) => [...items, ...added]);
  };
  const labels: Record<string, string> = {
    queued: "В очереди",
    uploading: "Загружается",
    reserved: "Ожидает загрузки",
    uploaded: "Ожидает обработки",
    processing: "Обрабатывается",
    ready: "Готово",
    failed: "Ошибка",
    cancelled: "Отменено",
    cancelling: "Отменяется",
    cancel_unknown: "Отмена не подтверждена",
    expired: "Время истекло",
  };
  const recovered = failedPhotos.filter(
    (photo) => photo.uploadId && !entries.some((entry) => entry.uploadId === photo.uploadId),
  );
  return (
    <div className={styles.albumUpload}>
      <div className={styles.albumUploadBar}>
        <FilePicker
          primary={accent}
          disabled={usedSlots >= 200}
          multiple
          onFiles={(files) => addFiles(files)}
        >
          Добавить фотографии
        </FilePicker>
        <span className={styles.uploadCount}>{usedSlots} / 200 фотографий</span>
      </div>
      <p className={styles.uploadHint}>
        JPG, PNG или WebP · до 10 МиБ за файл. Можно выбрать несколько фотографий.
        {usedSlots >= 200 ? " Лимит заполнен — удалите ненужные фотографии." : ""}
      </p>
      {entries.filter((entry) => entry.state === "queued").length >
        Math.max(0, 200 - usedSlots) && (
        <p className={styles.muted}>
          Для части очереди может не хватить места. Доступность каждого файла проверяется при
          загрузке.
        </p>
      )}
      <ul className={styles.queue} aria-label="Загрузка фотографий">
        {entries.map((entry) => {
          const uploading = entry.state === "uploading";
          const processing = entry.state === "uploaded" || entry.state === "processing";
          const showProgress = uploading || processing;
          const progressLabel = uploading
            ? `Загрузка ${entry.name}: ${entry.progress}%`
            : entry.state === "uploaded"
              ? `${entry.name}: ожидает обработки`
              : `${entry.name}: обрабатывается`;
          return (
            <li key={entry.key} className={styles.uploadQueueItem}>
              <div className={styles.uploadQueueMain}>
                <div className={styles.uploadQueueHeading}>
                  <strong className={styles.uploadFilename} title={entry.name}>
                    {entry.name}
                  </strong>
                  <span className={styles.uploadQueueStatus} aria-live="polite">
                    {labels[entry.state] || entry.state}
                  </span>
                  {uploading && (
                    <span className={styles.uploadQueuePercentage} aria-hidden="true">
                      {entry.progress}%
                    </span>
                  )}
                </div>
                {showProgress && (
                  <LinearProgress
                    className={styles.uploadProgress}
                    variant={uploading ? "determinate" : "indeterminate"}
                    value={uploading ? entry.progress : undefined}
                    aria-label={progressLabel}
                  />
                )}
                {processing &&
                  entry.processingStartedAt &&
                  clock - entry.processingStartedAt >= 60000 && (
                    <p className={styles.uploadDelayHint}>
                      Обработка занимает больше обычного. Фотография появится после завершения.
                    </p>
                  )}
                {entry.error && <p className={styles.error}>{entry.error}</p>}
              </div>
              <div className={styles.uploadQueueActions}>
                {["failed", "expired"].includes(entry.state) &&
                  (entry.file ? (
                    <SecondaryButton
                      onClick={() => {
                        patch(entry.key, { state: "queued", progress: 0, error: undefined });
                      }}
                    >
                      Повторить
                    </SecondaryButton>
                  ) : (
                    <FilePicker onFiles={(files) => addFiles(files, entry)}>
                      Выбрать файл повторно
                    </FilePicker>
                  ))}
                {!terminal.includes(entry.state) && (
                  <SecondaryButton
                    disabled={entry.state === "cancelling"}
                    onClick={() => {
                      void task(entry).cancel(entry);
                    }}
                  >
                    {entry.state === "cancel_unknown" ? "Повторить отмену" : "Отменить"}
                  </SecondaryButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {recovered.map((photo) => (
        <div key={photo.id}>
          <p className={styles.error}>{photo.errorMessage || "Обработка фотографии не удалась."}</p>
          <FilePicker
            onFiles={(files) => {
              const file = files?.[0];
              if (file) {
                const item: Entry = {
                  key: crypto.randomUUID(),
                  uploadId: photo.uploadId!,
                  name: file.name,
                  state: "failed",
                  progress: 0,
                };
                setEntries((items) => [...items, item]);
                addFiles(files, item);
              }
            }}
          >
            Выбрать файл и повторить
          </FilePicker>
        </div>
      ))}
    </div>
  );
}
