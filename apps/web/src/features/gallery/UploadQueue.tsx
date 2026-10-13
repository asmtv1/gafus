"use client";
import { browserStorageUploadUrl } from "@/shared/lib/media/browserStorageUploadUrl";
import { useEffect, useRef, useState } from "react";
import { Button, LinearProgress } from "@mui/material";
import { GALLERY_LIMITS, GALLERY_MIME_TYPES, type GalleryPhotoDto } from "@gafus/types";
import { galleryApi } from "./api";
import { galleryMessage, useGalleryIdentity } from "./hooks";
import styles from "./Gallery.module.css";
import { createUploadTask, type UploadEntry as Entry } from "./uploadTask";
import { gallerySession } from "./session";
const terminal = ["ready", "failed", "cancelled", "expired"];
export function UploadQueue({
  albumId,
  usedSlots,
  changed,
  failedPhotos = [],
}: {
  albumId?: string;
  usedSlots: number;
  changed: () => void;
  failedPhotos?: GalleryPhotoDto[];
}) {
  const { authenticated, viewerId, visible } = useGalleryIdentity();
  const [entries, setEntries] = useState<Entry[]>([]);
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
            if (current() && event.lengthComputable)
              patch(entry.key, { progress: Math.round((event.loaded / event.total) * 100) });
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
    <div>
      <div className={styles.actions}>
        <Button component="label" variant="contained">
          Добавить фотографии
          <input
            hidden
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </Button>
        <span className={styles.muted}>{usedSlots} / 200 фотографий</span>
      </div>
      <p className={styles.muted}>
        JPG, PNG или WebP · до 10 МиБ. Можно выбрать несколько файлов.{" "}
        {usedSlots >= 200 ? "Место заполнено — удалите ненужные фотографии." : ""}
      </p>
      {entries.filter((entry) => entry.state === "queued").length >
        Math.max(0, 200 - usedSlots) && (
        <p className={styles.muted}>
          Для части очереди может не хватить места. Доступность каждого файла проверяется при
          загрузке.
        </p>
      )}
      <ul className={styles.queue} aria-live="polite">
        {entries.map((entry) => (
          <li key={entry.key}>
            <strong>{entry.name}</strong> — {labels[entry.state] || entry.state}
            {entry.state === "uploading" && (
              <LinearProgress
                variant="determinate"
                value={entry.progress}
                aria-label={`Загрузка ${entry.name}`}
              />
            )}
            {entry.error && <p className={styles.error}>{entry.error}</p>}
            {["failed", "expired"].includes(entry.state) &&
              (entry.file ? (
                <Button
                  onClick={() => {
                    patch(entry.key, { state: "queued", progress: 0 });
                  }}
                >
                  Повторить
                </Button>
              ) : (
                <Button component="label">
                  Выбрать файл повторно
                  <input
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      addFiles(e.target.files, entry);
                      e.target.value = "";
                    }}
                  />
                </Button>
              ))}
            {!terminal.includes(entry.state) && (
              <Button
                disabled={entry.state === "cancelling"}
                onClick={() => {
                  void task(entry).cancel(entry);
                }}
              >
                {entry.state === "cancel_unknown" ? "Повторить отмену" : "Отменить"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {recovered.map((photo) => (
        <div key={photo.id}>
          <p className={styles.error}>{photo.errorMessage || "Обработка фотографии не удалась."}</p>
          <Button component="label">
            Выбрать файл и повторить
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const item: Entry = {
                    key: crypto.randomUUID(),
                    uploadId: photo.uploadId!,
                    name: file.name,
                    state: "failed",
                    progress: 0,
                  };
                  setEntries((items) => [...items, item]);
                  addFiles(e.target.files, item);
                }
                e.target.value = "";
              }}
            />
          </Button>
        </div>
      ))}
    </div>
  );
}
