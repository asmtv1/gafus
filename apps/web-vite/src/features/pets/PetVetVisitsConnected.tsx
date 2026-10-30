import { Loading } from "../../shared/ui";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../shared/api/client";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";

import { projectHonoVetDetail, projectHonoVetList, vetReadPath } from "./vetVisitsHonoReadConsumer";
import type { VetVisitSafe } from "./vetVisitsSourceMock";
import {
  emptyVetVisit,
  vetVisitDateLabel,
  vetVisitToday,
  type PetVetVisitInput,
} from "@gafus/types";
import {
  VET_VISIT_MAX_ATTACHMENTS,
  VET_VISIT_MAX_FILE_BYTES,
  VET_VISIT_MIME_TYPES,
} from "@gafus/types";
import { fields, validDate } from "./petVetVisitDomain";
import { VetVisitDetailsContent, type InlineVisitCallbacks } from "./PetVetVisitDetails";
import style from "./PetVetVisitsConnected.module.css";
import legacy from "../../brand/LegacyVetVisits.module.css";
import {PrimaryButton,SecondaryButton} from "../../shared/ui";
type QueuedVetAttachment = {
  id: number;
  file: File;
  previewUrl: string | null;
};
function revokePreview(url: string | null) {
  if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
const signature = (a: AuthUser | null | undefined) =>
  a
    ? JSON.stringify([
        a.id,
        a.username,
        a.role,
        (a as AuthUser & { sessionRevision?: unknown }).sessionRevision ?? null,
      ])
    : null;
const errorCopy = (e: unknown) =>
  e instanceof ApiError
    ? ((
        {
          401: "Войдите снова.",
          403: "Нет доступа.",
          404: "Запись не найдена.",
          400: "Проверьте поля.",
          409: "Запись изменилась.",
          429: "Слишком много запросов.",
        } as Record<number, string>
      )[e.status] ?? "Не удалось выполнить действие.")
    : "Неизвестен результат операции.";
const rejected = (e: unknown) =>
  e instanceof ApiError && [400, 401, 403, 404, 409, 413, 422, 429].includes(e.status);
const list = async (petId: string) =>
  projectHonoVetList(
    await apiRequest<unknown>(vetReadPath(petId), { browserAuth: true, expectedStatus: 200 }),
    petId,
  );
const detail = async (petId: string, id: string) =>
  projectHonoVetDetail(
    await apiRequest<unknown>(vetReadPath(petId, id), { browserAuth: true, expectedStatus: 200 }),
    petId,
    id,
  );

/** Original Hono multipart transport. Preserve lost-ACK ambiguity.
 * The browser supplies its own Origin for CSRF; no manually forged Origin.
 */
async function uploadVetFile(petId: string, visitId: string, file: File) {
  if (
    !VET_VISIT_MIME_TYPES.includes(file.type as (typeof VET_VISIT_MIME_TYPES)[number]) ||
    file.size < 1 ||
    file.size > VET_VISIT_MAX_FILE_BYTES
  )
    throw new ApiError(400, "Некорректное вложение");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(vetReadPath(petId, visitId) + "/attachments", {
    method: "POST",
    body: form,
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie" },
  });
  if (response.status === 429) throw new ApiError(429, "Слишком много запросов");
  let data: { success?: boolean; data?: unknown };
  try {
    data = await response.json();
  } catch {
    throw Error("UNKNOWN_VET_ATTACHMENT_RESPONSE");
  }
  if (!response.ok || data?.success !== true)
    throw new ApiError(response.status, "Вложение не загружено");
  if (response.status !== 201) throw Error("UNKNOWN_VET_ATTACHMENT_STATUS");
  return data.data;
}

function ExtraVetVisitDetails({ownerId,petId,visitId,isCurrent,...actions}:
  {ownerId:string;petId:string;visitId:string;isCurrent:()=>boolean}&InlineVisitCallbacks){
  const record=useQuery({
    queryKey:["pets","live-vet-detail",ownerId,petId,visitId],
    queryFn:async()=>{
      if(!isCurrent())throw Error("SESSION_CHANGED");
      const value=await detail(petId,visitId);
      if(!isCurrent())throw Error("SESSION_CHANGED");
      return value;
    },
    enabled:isCurrent(),
    retry:false,staleTime:0,gcTime:0,refetchOnWindowFocus:false,
    refetchInterval:(query)=>isCurrent()&&
      query.state.data?.attachments.some(file=>file.previewProcessing)?5000:false,
  });
  if(!isCurrent())return null;
  if(record.isPending||record.isFetching)return <Loading message="Проверяем выбранное посещение…" />;
  if(record.isError)return <div role="alert"><p>Не удалось получить посещение.</p>
    <PrimaryButton type="button" onClick={()=>void record.refetch()}>Повторить чтение</PrimaryButton></div>;
  return <VetVisitDetailsContent visitData={record.data} {...actions}/>;
}

/** Ordinary owner's registered Hono visit reader and one-shot edit actions.
 * All endpoints are original shared Next/Core routes, no synthetic transport.
 */
export function PetVetVisitsConnected({
  ownerId,
  petId,
  petName,
  selectedId,
  badDeepLink,
  onSelect,
}: {
  ownerId: string;
  petId: string;
  petName: string;
  selectedId: string | null;
  badDeepLink: boolean;
  onSelect: (id: string | null) => void;
}) {
  const cache = useQueryClient();
  const initial = useRef(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY));
  const retired = useRef(false);
  const [epoch, setEpoch] = useState(0);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const uncertain = useRef(false);
  const [unknown, setUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<VetVisitSafe | "new" | null>(null);
  const [extraOpen,setExtraOpen]=useState<ReadonlySet<string>>(()=>new Set());
  const [draft, setDraft] = useState<PetVetVisitInput>(emptyVetVisit);
  const [files, setFiles] = useState<QueuedVetAttachment[]>([]);
  const filePicker = useRef<HTMLInputElement>(null);
  const filePickerId = useId();
  const previewUrls = useRef(new Set<string>());
  const fileSequence = useRef(0);
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) revokePreview(url);
      urls.clear();
    };
  }, []);
  const releaseFiles = () => {
    for (const url of previewUrls.current) revokePreview(url);
    previewUrls.current.clear();
    setFiles([]);
  };
  const removePendingFile = (id: number) => {
    if (busy || unknown) return;
    const removed = files.find(item => item.id === id);
    if (removed?.previewUrl) {
      previewUrls.current.delete(removed.previewUrl);
      revokePreview(removed.previewUrl);
    }
    setFiles(current => current.filter(item => item.id !== id));
  };
  // Source Next VetVisits prevents accidental loss on route links, tab close,
  // and Back while a visit or pending attachment form remains open. In Vite
  // those SPA links otherwise bypass beforeunload entirely.
  useEffect(() => {
    if (!editing || retired.current) return;
    const navigation = (window as Window & {
      navigation?: { currentEntry?: { index: number } };
    }).navigation;
    const currentIndex = navigation?.currentEntry?.index;
    const currentUrl = window.location.href;
    const currentState = window.history.state;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leaveLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (!link || event.defaultPrevented || event.metaKey ||
          event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (busy || !window.confirm("Закрыть форму? Несохранённые изменения будут потеряны")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    let restoring = false;
    const back = (event: PopStateEvent) => {
      if (restoring) { restoring = false; return; }
      if (busy || !window.confirm("Закрыть форму? Несохранённые изменения будут потеряны")) {
        event.stopImmediatePropagation();
        const targetIndex = navigation?.currentEntry?.index;
        if (currentIndex !== undefined && targetIndex !== undefined &&
            currentIndex !== targetIndex) {
          restoring = true;
          window.history.go(currentIndex - targetIndex);
        } else {
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
  const owner = () =>
    alive.current &&
    !retired.current &&
    initial.current?.id === ownerId &&
    signature(initial.current) ===
      signature(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY));
  useEffect(() => {
    alive.current = true;
    const off = cache.getQueryCache().subscribe((event) => {
      if (
        event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
        !event.query.queryKey.every((x: unknown, i: number) => x === CURRENT_USER_QUERY_KEY[i])
      )
        return;
      const current = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
      if (event.type === "removed" || signature(current) !== signature(initial.current)) {
        retired.current = true;
        queueMicrotask(() => {
          if (alive.current) setEpoch((n) => n + 1);
        });
      }
    });
    return () => {
      alive.current = false;
      off();
    };
  }, [cache]);
  const validOwner = epoch === 0 && owner();
  useEffect(() => {
    if (!validOwner) {
      for (const url of previewUrls.current) revokePreview(url);
      previewUrls.current.clear();
      setFiles([]);
    }
  }, [validOwner]);
  const visits = useQuery({
    queryKey: ["pets", "live-vet", ownerId, petId],
    queryFn: () => list(petId),
    enabled: validOwner && !badDeepLink,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    // Match Next: previews are processed asynchronously; poll ONLY while
    // owner-confirmed attachments say that preview processing is pending.
    refetchInterval: (query) =>
      validOwner &&
      query.state.data?.some((v) => v.attachments.some((file) => file.previewProcessing))
        ? 5000
        : false,
  });
  const ready = validOwner && visits.isSuccess && !visits.isFetching;
  const selected = ready && selectedId ? visits.data.find((v) => v.id === selectedId) : null;
  const picked = useQuery({
    queryKey: ["pets", "live-vet-detail", ownerId, petId, selectedId],
    queryFn: () => detail(petId, selectedId!),
    enabled: validOwner && !!selectedId && !!selected,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      validOwner && query.state.data?.attachments.some((file) => file.previewProcessing)
        ? 5000
        : false,
  });
  const selectedDetail = validOwner && picked.isSuccess && !picked.isFetching ? picked.data : null;
  const startEdit = (v: VetVisitSafe | "new") => {
    if (!owner() || uncertain.current) return;
    releaseFiles();
    setEditing(v);
    setMessage("");
    setDraft(
      v === "new"
        ? emptyVetVisit()
        : {
            visitedOn: v.visitedOn,
            specialty: v.specialty,
            doctorName: v.doctorName,
            clinic: v.clinic,
            diagnosis: v.diagnosis,
            conclusion: v.conclusion,
            notes: v.notes,
          },
    );
  };
  const lock = () => {
    uncertain.current = true;
    if (owner()) {
      setUnknown(true);
      setMessage("Результат записи неизвестен. Повтор заблокирован. Перечитайте историю.");
    }
  };
  const refresh = async () => {
    if (owner()) await visits.refetch();
  };
  const fieldsMatch = (v: VetVisitSafe) =>
    v.visitedOn === draft.visitedOn && fields.every(([key]) => v[key] === draft[key].trim());
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!owner() || !editing || inFlight.current || uncertain.current) return;
    if (
      !validDate(draft.visitedOn) ||
      !draft.specialty.trim() ||
      fields.some(([key, , max]) => draft[key].length > max)
    ) {
      setMessage(
        "Укажите дату не позднее сегодняшнего дня, специальность и проверьте длину полей.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    const payload = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()]));
    const path = vetReadPath(petId) + (editing === "new" ? "" : "/" + editing.id);
    let recordAcknowledged = false;
    try {
      const result = await apiRequest<unknown>(path, {
        method: editing === "new" ? "POST" : "PUT",
        json: payload,
        browserAuth: true,
        expectedStatus: editing === "new" ? 201 : 200,
      });
      if (!owner()) return;
      recordAcknowledged = true;
      const id = (result as { id?: unknown })?.id;
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
        throw Error("UNCONFIRMED_VET_ID");
      const fresh = await detail(petId, id);
      if (!owner()) return;
      if (!fieldsMatch(fresh)) throw Error("UNCONFIRMED_VET_SAVE");
      // A committed record followed by uncertain attachment ACK must never
      // cause an automatic second create/edit submission.
      for (const { file } of files) {
        await uploadVetFile(petId, id, file);
        if (!owner()) return;
      }
      const confirmed = await detail(petId, id);
      if (!owner()) return;
      if (confirmed.attachments.length < fresh.attachments.length + files.length)
        throw Error("UNCONFIRMED_VET_ATTACHMENTS");
      const all = await list(petId);
      if (!owner()) return;
      if (!all.some(row => row.id === fresh.id)) throw Error("UNCONFIRMED_VET_LIST");
      cache.setQueryData(["pets", "live-vet", ownerId, petId], all);
      setEditing(null);
      releaseFiles();
      setMessage("Запись подтверждена на сервере.");
    } catch (error) {
      if (!owner()) return;
      if (rejected(error) && !recordAcknowledged) setMessage(errorCopy(error));
      else lock();
    } finally {
      inFlight.current = false;
      if (owner()) setBusy(false);
    }
  }
  async function removeFile(visit: VetVisitSafe, fileId: string) {
    if (!owner() || inFlight.current || uncertain.current || !window.confirm("Удалить вложение?"))
      return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await apiRequest<void>(vetReadPath(petId, visit.id) + "/attachments/" + fileId, {
        method: "DELETE",
        browserAuth: true,
        expectedStatus: 200,
      });
      if (!owner()) return;
      const verified = await detail(petId, visit.id);
      if (!owner()) return;
      if (verified.attachments.some(file => file.id === fileId))
        throw Error("UNCONFIRMED_VET_ATTACHMENT_DELETE");
      cache.setQueryData(["pets", "live-vet-detail", ownerId, petId, visit.id], verified);
      const all = await list(petId);
      if (!owner()) return;
      cache.setQueryData(["pets", "live-vet", ownerId, petId], all);
      setMessage("Вложение удалено.");
    } catch (error) {
      if (!owner()) return;
      if (rejected(error)) setMessage(errorCopy(error));
      else lock();
    } finally {
      inFlight.current = false;
      if (owner()) setBusy(false);
    }
  }
  async function remove(visit: VetVisitSafe) {
    if (!owner() || inFlight.current || uncertain.current ||
      !window.confirm("Удалить посещение и вложения?")) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await apiRequest<void>(vetReadPath(petId, visit.id), {
        method: "DELETE",
        browserAuth: true,
        expectedStatus: 200,
      });
      if (!owner()) return;
      const all = await list(petId);
      if (!owner()) return;
      if (all.some(row => row.id === visit.id)) throw Error("UNCONFIRMED_VET_DELETE");
      cache.setQueryData(["pets", "live-vet", ownerId, petId], all);
      // Do not collapse a different still-open Next <details> card.
      if (selectedId === visit.id) onSelect(null);
      setExtraOpen(previous => {
        const next = new Set(previous);next.delete(visit.id);return next;
      });
      setMessage("Запись удалена.");
    } catch (error) {
      if (!owner()) return;
      if (rejected(error)) setMessage(errorCopy(error));
      else lock();
    } finally {
      inFlight.current = false;
      if (owner()) setBusy(false);
    }
  }
  const media = (
    visitId: string,
    attachmentId: string,
    variant: "preview" | "original" | "download",
  ) =>
    vetReadPath(petId, visitId) +
    "/attachments/" +
    attachmentId +
    "/media?variant=" +
    variant +
    "&redirect=1";
  // Retained Next independently expands each native details card. The
  // primary ?visitId deep-link uses its existing verified exact Hono query.
  const selectedPanel = selected ? <>
    {picked.isPending && <Loading message="Проверяем выбранное посещение…" />}
    {picked.isError && <div role="alert"><p>Не удалось получить посещение.</p>
      <PrimaryButton type="button" onClick={() => void picked.refetch()}>Повторить чтение</PrimaryButton>
    </div>}
    {selectedDetail && <VetVisitDetailsContent visitData={selectedDetail}
      busy={busy} unknown={unknown} media={media} onEdit={startEdit}
      onRemove={remove} onRemoveFile={removeFile} onClose={() => onSelect(null)}/>}
  </> : null;
  if (!validOwner) return <p role="alert">Сессия изменилась. Откройте историю заново.</p>;
  if (badDeepLink) return <p role="alert">Некорректная ссылка на посещение врача.</p>;
  return (
    <section className={style.section} aria-label="История посещений врача">
      <header className={`${legacy.header} ${style.sourceHeader}`}>
        <div className={style.headerContent}>
          <h1>Посещения врача</h1>
          <div className={style.petContext} aria-label={`Питомец: ${petName}`}>
            <span className={style.petContextIcon} aria-hidden="true">🐾</span>
            <span className={style.petContextText}>
              <span>Медкарта питомца</span>
              <strong>{petName}</strong>
            </span>
          </div>
        </div>
        {ready && !editing && !unknown && visits.data.length > 0 &&
          <PrimaryButton type="button" onClick={() => startEdit("new")}>Добавить запись</PrimaryButton>}
      </header>
      {visits.isPending && <Loading message="Загружаем историю…" />}
      {visits.isFetching && visits.data && <Loading variant="compact" message="Перепроверяем историю…" />}
      {visits.isError && (
        <div role="alert">
          <p>
            {visits.error instanceof ApiError && visits.error.status === 401
              ? "Сессия завершена."
              : "Не удалось получить историю посещений."}
          </p>
          <PrimaryButton type="button" onClick={() => void refresh()}>
            Повторить чтение
          </PrimaryButton>
        </div>
      )}
      {message && <p role={unknown ? "alert" : "status"}>{message}</p>}
      {unknown && (
        <PrimaryButton type="button" onClick={() => void refresh()}>
          Перечитать историю без повторной записи
        </PrimaryButton>
      )}
      {editing && (
        <form className={legacy.form} aria-label="Форма посещения врача"
          onSubmit={(e) => void save(e)}>
          <fieldset disabled={busy || unknown} className={style.form}>
            <legend>{editing === "new" ? "Новое посещение" : "Изменить посещение"}</legend>
            <label>
              <span>Дата приёма <span className={style.requiredMark} aria-hidden="true">*</span></span>
              <input
                type="date"
                required
                min="1900-01-01"
                max={vetVisitToday()}
                value={draft.visitedOn}
                onChange={(e) => setDraft((d) => ({ ...d, visitedOn: e.target.value }))}
              />
            </label>
            {fields.map(([key, label, max]) => (
              <label key={key}>
                <span>{label}{key === "specialty" &&
                  <> <span className={style.requiredMark} aria-hidden="true">*</span></>}</span>
                {max <= 300 ? (
                  <input
                    required={key === "specialty"}
                    maxLength={max}
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                ) : (
                  <textarea
                    rows={3}
                    maxLength={max}
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
            <div className={style.attachmentPicker}>
              <h4>Медкарты и фотографии</h4>
              <p className={style.attachmentHelp}>
                Выберите фотографии или PDF — они появятся здесь до сохранения записи.
              </p>
              {editing !== "new" && editing.attachments.length > 0 &&
                <p className={style.attachmentSaved}>
                  Уже сохранено: {editing.attachments.length}
                </p>}
              <div className={style.attachmentTiles} aria-label="Выбранные вложения">
                {files.map(({id, file, previewUrl}) => (
                  <div key={id} className={style.attachmentTile}
                    aria-label={`Выбран файл: ${file.name}`}>
                    {previewUrl ? <img src={previewUrl} alt={`Предпросмотр: ${file.name}`} />
                      : <div className={style.attachmentPdf}>
                        <svg aria-hidden="true" width="31" height="31" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.6"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
                          <path d="M14 2v6h5M8 15h8M8 18h6"/>
                        </svg>
                        <span>{file.type === "application/pdf" ? "PDF" : "Файл"}</span>
                      </div>}
                    <span className={style.attachmentName} title={file.name}>{file.name}</span>
                    <SecondaryButton type="button" className={style.attachmentRemove}
                      aria-label={`Убрать файл ${file.name}`} title="Убрать файл"
                      disabled={busy || unknown} onClick={() => removePendingFile(id)}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M6 6 18 18M18 6 6 18"/>
                      </svg>
                    </SecondaryButton>
                  </div>
                ))}
                {files.length + (editing === "new" ? 0 : editing.attachments.length)
                  < VET_VISIT_MAX_ATTACHMENTS &&
                  <SecondaryButton type="button" className={style.attachmentAdd}
                    disabled={busy || unknown} aria-controls={filePickerId}
                    onClick={() => filePicker.current?.click()}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.7"
                      strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="16" rx="3"/>
                      <circle cx="8.5" cy="9" r="1.4"/>
                      <path d="m5 17 5-5 3 3 3-3 3 3M12 3v5m-2.5-2.5h5"/>
                    </svg>
                    <span>Добавить файл</span>
                  </SecondaryButton>}
              </div>
              <input ref={filePicker} id={filePickerId}
                className={style.attachmentInput}
                aria-label="Выбрать вложения"
                type="file" multiple hidden
                disabled={busy || unknown ||
                  files.length + (editing === "new" ? 0 : editing.attachments.length)
                    >= VET_VISIT_MAX_ATTACHMENTS}
                accept={VET_VISIT_MIME_TYPES.join(",")}
                onChange={(event) => {
                  const incoming = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = "";
                  if (!incoming.length || busy || unknown) return;
                  if (
                    incoming.some(file =>
                      !VET_VISIT_MIME_TYPES.includes(
                        file.type as (typeof VET_VISIT_MIME_TYPES)[number],
                      ) || file.size < 1 || file.size > VET_VISIT_MAX_FILE_BYTES
                    ) ||
                    files.length + incoming.length +
                      (editing === "new" ? 0 : editing.attachments.length) >
                        VET_VISIT_MAX_ATTACHMENTS
                  ) {
                    setMessage("Допустимо до 5 JPEG, PNG, WebP или PDF по 10 МБ.");
                    return;
                  }
                  const queued: QueuedVetAttachment[] = [];
                  try {
                    for (const file of incoming) {
                      const previewUrl = file.type.startsWith("image/") &&
                        typeof URL.createObjectURL === "function"
                          ? URL.createObjectURL(file) : null;
                      if (previewUrl) previewUrls.current.add(previewUrl);
                      queued.push({id: ++fileSequence.current, file, previewUrl});
                    }
                  } catch {
                    for (const item of queued) {
                      if (item.previewUrl) previewUrls.current.delete(item.previewUrl);
                      revokePreview(item.previewUrl);
                    }
                    setMessage("Не удалось показать выбранные фотографии. Выберите их снова.");
                    return;
                  }
                  setFiles(current => [...current, ...queued]);
                  setMessage("");
                }}
              />
              <p className={style.attachmentCounter}>
                {files.length + (editing === "new" ? 0 : editing.attachments.length)}
                {" "}из {VET_VISIT_MAX_ATTACHMENTS} файлов · JPEG, PNG, WebP, PDF · до 10 МБ каждый
              </p>
              {files.length > 0 &&
                <p className={style.attachmentPending}>
                  Файлы будут загружены после сохранения записи.
                </p>}
            </div>
            <p className={style.requiredNote}>
              <span className={style.requiredMark} aria-hidden="true">*</span>
              {" "}— поля, обязательные для заполнения
            </p>
            <div className={style.actions}>
              <PrimaryButton type="submit" disabled={busy || unknown}>
                {busy ? "Сохраняем…" : "Сохранить"}
              </PrimaryButton>
              <SecondaryButton variant="red"
                type="button"
                disabled={busy || unknown}
                onClick={() => {
                  if (window.confirm("Отменить несохранённые изменения?")) {
                    releaseFiles();
                    setEditing(null);
                  }
                }}
              >
                Отмена
              </SecondaryButton>
            </div>
          </fieldset>
        </form>
      )}
      {ready && !editing && selectedId && !selected && <p role="alert">Посещение не найдено.</p>}
      {ready && !editing && !selectedId && visits.data.length === 0 &&
        <section className={`${legacy.empty} ${style.emptyState}`} aria-label="Нет посещений врача">
          <div className={style.emptyIcon} aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              strokeLinejoin="round">
              <rect x="7" y="5" width="18" height="23" rx="3" />
              <path d="M12 4.5h8v5h-8zM12 16h8M16 12v8M12 24h8" />
            </svg>
          </div>
          <div className={style.emptyContent}>
            <span className={style.emptyEyebrow}>История пока пуста</span>
            <h2>Здесь будет история посещений</h2>
            <p>Сохраните дату приёма, заключение врача и медкарты, чтобы всё было под рукой.</p>
            <PrimaryButton type="button" onClick={() => startEdit("new")}>Добавить первую запись</PrimaryButton>
          </div>
        </section>}
      {ready && !editing && visits.data.length > 0 && (
        <div className={legacy.list}>
          {visits.data.map((v) => (
            <details key={v.id} className={legacy.visit}
              open={selectedId === v.id || extraOpen.has(v.id)}>
              <summary onClick={(event) => {
                event.preventDefault();
                if(!owner())return;
                if(selectedId===v.id){onSelect(null);return;}
                if(extraOpen.has(v.id)){
                  setExtraOpen(previous=>{
                    const next=new Set(previous);next.delete(v.id);return next;
                  });
                }else if(selectedId){
                  setExtraOpen(previous=>new Set(previous).add(v.id));
                }else onSelect(v.id);
              }}>
                <span>
                  <time dateTime={v.visitedOn}>{vetVisitDateLabel(v.visitedOn)}</time>
                  <strong>{v.specialty}</strong>
                  <small>
                    {[v.doctorName, v.clinic].filter(Boolean).join(" · ") ||
                      "Посещение врача"}
                    {v.attachments.length ? ` · Вложения: ${v.attachments.length}` : ""}
                  </small>
                </span>
              </summary>
              {selectedId === v.id ? selectedPanel :
                extraOpen.has(v.id) && <ExtraVetVisitDetails key={v.id}
                  ownerId={ownerId} petId={petId} visitId={v.id} isCurrent={owner}
                  busy={busy} unknown={unknown} media={media} onEdit={startEdit}
                  onRemove={remove} onRemoveFile={removeFile}
                  onClose={()=>setExtraOpen(previous=>{
                    const next=new Set(previous);next.delete(v.id);return next;
                  })}/>}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
