"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import {
  emptyVetVisit,
  vetVisitDateLabel,
  vetVisitToday,
  VET_VISIT_MAX_ATTACHMENTS,
  VET_VISIT_MAX_FILE_BYTES,
  VET_VISIT_MIME_TYPES,
  type PetVetVisit,
  type PetVetVisitInput,
} from "@gafus/types";
import {
  AppBackButtonLink,
  PrimaryButton,
  CaramelButton,
  SecondaryButton,
} from "@/shared/components/ui";
import styles from "./VetVisits.module.css";

const fields = [
  ["specialty", "Специальность врача", 200],
  ["doctorName", "ФИО врача", 200],
  ["clinic", "Какая клиника", 300],
  ["diagnosis", "Какой был диагноз", 10_000],
  ["conclusion", "Какое было заключение", 10_000],
  ["notes", "Ваши заметки", 10_000],
] as const;

export function VetVisitShortcut({ petId }: { petId: string }) {
  return (
    <Link className={styles.shortcut} href={`/pets/${encodeURIComponent(petId)}/vet-visits`}>
      <svg
        aria-hidden="true"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M8 3H5v6a4 4 0 0 0 8 0V3h-3M9 13v3a5 5 0 0 0 10 0v-2" />
        <circle cx="19" cy="11" r="3" />
      </svg>
      <span>
        <strong>Посещения врача</strong>
        <small>Приёмы, заключения и медкарты</small>
      </span>
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}

export function VetVisits({ petId, petName }: { petId: string; petName: string }) {
  const [visits, setVisits] = useState<PetVetVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PetVetVisit | "new" | null>(null);
  const [draft, setDraft] = useState<PetVetVisitInput>(emptyVetVisit);
  const [files, setFiles] = useState<File[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);
  useEffect(() => {
    if (!editing) return;
    const navigation = (
      window as Window & {
        navigation?: { currentEntry?: { index: number } };
      }
    ).navigation;
    const currentIndex = navigation?.currentEntry?.index;
    const currentUrl = window.location.href;
    const currentState = window.history.state;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leaveLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      if (busy || !window.confirm("Закрыть форму? Несохранённые изменения будут потеряны")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    let restoring = false;
    const back = (event: PopStateEvent) => {
      if (restoring) {
        restoring = false;
        return;
      }
      if (busy || !window.confirm("Закрыть форму? Несохранённые изменения будут потеряны")) {
        event.stopImmediatePropagation();
        const targetIndex = navigation?.currentEntry?.index;
        if (
          currentIndex !== undefined &&
          targetIndex !== undefined &&
          currentIndex !== targetIndex
        ) {
          restoring = true;
          window.history.go(currentIndex - targetIndex);
        } else {
          // Older browsers expose no history direction. Restore the current route without guessing.
          window.history.pushState(currentState, "", currentUrl);
        }
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", leaveLink, true);
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", leaveLink, true);
      window.removeEventListener("popstate", back, true);
    };
  }, [editing, busy]);
  const base = `/api/v1/pets/${encodeURIComponent(petId)}/vet-visits`;
  const request = useCallback(
    async <T,>(path = "", method = "GET", body?: object | FormData): Promise<T> => {
      const headers: Record<string, string> = {};
      if (method !== "GET") {
        await useCSRFStore.getState().fetchToken();
        const token = useCSRFStore.getState().token;
        if (!token)
          throw new Error("Не удалось подготовить запрос. Обновите страницу и повторите попытку");
        headers["x-csrf-token"] = token;
        if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
      }
      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success)
        throw new Error(result?.error ?? "Не удалось выполнить действие. Повторите попытку");
      return result.data as T;
    },
    [base],
  );
  const reload = useCallback(async () => setVisits(await request<PetVetVisit[]>()), [request]);
  const previewJobsPending = visits.some((visit) =>
    visit.attachments.some((file) => file.previewProcessing),
  );
  useEffect(() => {
    if (!previewJobsPending) return;
    const timer = window.setInterval(() => {
      void reload().catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [previewJobsPending, reload]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<PetVetVisit[]>()
      .then((data) => {
        if (active) setVisits(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);
  function edit(visit: PetVetVisit | "new") {
    setEditing(visit);
    setDraft(visit === "new" ? emptyVetVisit() : { ...visit });
    setFiles([]);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      reportClientError(new Error("Vet visit action failed"), {
        issueKey: "PetVetVisits",
        keys: { operation: "saveOrDelete" },
      });
      setError(e instanceof Error ? e.message : "Ошибка. Повторите попытку");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    await action(async () => {
      const visit = await request<PetVetVisit>(
        editing === "new" ? "" : `/${(editing as PetVetVisit).id}`,
        editing === "new" ? "POST" : "PUT",
        draft,
      );
      setEditing(visit);
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await request(`/${visit.id}/attachments`, "POST", form);
        setFiles((current) => current.filter((f) => f !== file));
        const updated = await request<PetVetVisit[]>();
        setVisits(updated);
        const current = updated.find((item) => item.id === visit.id);
        if (current) setEditing(current);
      }
      await reload();
      setEditing(null);
      setFiles([]);
    });
  }
  function selectFiles(selected: File[]) {
    const existing = editing && editing !== "new" ? editing.attachments.length : 0;
    if (existing + files.length + selected.length > VET_VISIT_MAX_ATTACHMENTS) {
      setError("На одно посещение можно добавить до 5 вложений");
      return;
    }
    if (
      selected.some(
        (f) =>
          f.size > VET_VISIT_MAX_FILE_BYTES ||
          !VET_VISIT_MIME_TYPES.includes(f.type as (typeof VET_VISIT_MIME_TYPES)[number]),
      )
    ) {
      setError("Выберите JPEG, PNG, WebP или PDF размером до 10 МБ каждый");
      return;
    }
    setFiles((current) => [...current, ...selected]);
    setError("");
  }
  const media = (visitId: string, attachmentId: string, variant: string) =>
    `${base}/${visitId}/attachments/${attachmentId}/media?variant=${variant}&redirect=1`;
  const activeAttachments = editing && editing !== "new" ? editing.attachments : [];
  return (
    <main className={styles.page}>
      <AppBackButtonLink href="/pets">К питомцам</AppBackButtonLink>
      <header className={styles.header}>
        <div>
          <h1>Посещения врача</h1>
          <p>{petName}</p>
        </div>
        {!editing && <PrimaryButton onClick={() => edit("new")}>Добавить запись</PrimaryButton>}
      </header>
      {error && (
        <div role="alert" tabIndex={-1} ref={errorRef} className={styles.error}>
          {error}
          {!editing && (
            <button type="button" disabled={busy} onClick={() => void action(reload)}>
              Повторить
            </button>
          )}
        </div>
      )}
      {loading ? (
        <p role="status">Загрузка посещений…</p>
      ) : editing ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{editing === "new" ? "Новое посещение" : "Редактирование посещения"}</h2>
          <fieldset disabled={busy}>
            <label>
              Дата посещения *
              <input
                type="date"
                required
                max={vetVisitToday()}
                min="1900-01-01"
                value={draft.visitedOn}
                onChange={(e) => setDraft({ ...draft, visitedOn: e.target.value })}
              />
            </label>
            {fields.map(([key, label, maxLength]) => (
              <label key={key}>
                {label}
                {key === "specialty" ? " *" : <small>Необязательно</small>}
                {maxLength <= 300 ? (
                  <input
                    required={key === "specialty"}
                    maxLength={maxLength}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                ) : (
                  <textarea
                    rows={4}
                    maxLength={maxLength}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                )}
              </label>
            ))}
            <section className={styles.attachments}>
              <h3>Медкарты и фотографии</h3>
              <p>До 5 вложений, каждое до 10 МБ. JPEG, PNG, WebP или PDF.</p>
              {activeAttachments.map((a) => (
                <div className={styles.file} key={a.id}>
                  <span>{a.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Удалить вложение «${a.name}»?`))
                        void action(async () => {
                          await request(
                            `/${editing !== "new" && editing?.id}/attachments/${a.id}`,
                            "DELETE",
                          );
                          setEditing((current) =>
                            current && current !== "new"
                              ? {
                                  ...current,
                                  attachments: current.attachments.filter((f) => f.id !== a.id),
                                }
                              : current,
                          );
                          await reload();
                        });
                    }}
                  >
                    Удалить
                  </button>
                </div>
              ))}
              {files.map((file, index) => (
                <div className={styles.file} key={`${file.name}-${index}`}>
                  <span>
                    {file.name} <small>Ещё не загружен</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  >
                    Убрать
                  </button>
                </div>
              ))}
              {activeAttachments.length + files.length < 5 && (
                <label className={styles.filePicker}>
                  Добавить фото или PDF
                  <input
                    type="file"
                    multiple
                    accept={VET_VISIT_MIME_TYPES.join(",")}
                    onChange={(e) => {
                      selectFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </section>
            <div className={styles.actions}>
              <PrimaryButton type="submit">{busy ? "Сохранение…" : "Сохранить"}</PrimaryButton>
              <SecondaryButton
                variant="red"
                type="button"
                onClick={() => {
                  if (window.confirm("Закрыть форму? Несохранённые изменения будут потеряны")) {
                    setEditing(null);
                    setFiles([]);
                    void action(reload);
                  }
                }}
              >
                Отмена
              </SecondaryButton>
            </div>
          </fieldset>
        </form>
      ) : !visits.length && !error ? (
        <section className={styles.empty}>
          <h2>Здесь будет история посещений</h2>
          <p>Сохраните дату приёма, заключение врача и медкарты, чтобы всё было под рукой.</p>
          <PrimaryButton onClick={() => edit("new")}>Добавить первую запись</PrimaryButton>
        </section>
      ) : (
        <div className={styles.list}>
          {visits.map((visit) => (
            <details key={visit.id} className={styles.visit}>
              <summary>
                <span>
                  <time dateTime={visit.visitedOn}>{vetVisitDateLabel(visit.visitedOn)}</time>
                  <strong>{visit.specialty}</strong>
                  <small>
                    {[visit.doctorName, visit.clinic].filter(Boolean).join(" · ") ||
                      "Посещение врача"}
                    {visit.attachments.length ? ` · Вложения: ${visit.attachments.length}` : ""}
                  </small>
                </span>
              </summary>
              <div className={styles.details}>
                <dl>
                  {fields
                    .filter(([key]) => visit[key])
                    .map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{visit[key]}</dd>
                      </div>
                    ))}
                </dl>
                {!!visit.attachments.length && (
                  <section className={styles.attachments}>
                    <h3>Вложения · {visit.attachments.length}</h3>
                    <div className={styles.grid}>
                      {visit.attachments.map((a) => (
                        <div key={a.id} className={styles.attachment}>
                          <a
                            href={media(visit.id, a.id, "original")}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Открыть ${a.name}`}
                          >
                            {a.hasPreview ? (
                              <img
                                src={media(visit.id, a.id, "preview")}
                                alt={a.name}
                                loading="lazy"
                              />
                            ) : (
                              <span className={styles.pdf}>
                                {a.previewProcessing
                                  ? "Обрабатываем…"
                                  : a.mimeType === "application/pdf"
                                    ? "PDF"
                                    : "Фото"}
                              </span>
                            )}
                            <span>{a.name}</span>
                          </a>
                          <a href={media(visit.id, a.id, "download")}>Скачать оригинал</a>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <div className={styles.actions}>
                  <CaramelButton disabled={busy} onClick={() => edit(visit)}>
                    Редактировать
                  </CaramelButton>
                  <button
                    className={styles.delete}
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      if (window.confirm("Удалить посещение и все его вложения?"))
                        void action(async () => {
                          await request(`/${visit.id}`, "DELETE");
                          await reload();
                        });
                    }}
                  >
                    Удалить запись
                  </button>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
