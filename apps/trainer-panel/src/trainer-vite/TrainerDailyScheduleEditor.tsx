import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PanelActor } from "./consultationContract";
import { readRange, shift, type Schedule, type ScheduleTransport } from
  "./tr014ScheduleRangeRead20261022";
import { readCalendarCandidates, type CalendarCandidate } from
  "./tr014CalendarCandidatesRead20261022";
import type { TrainerDailyManageTransport } from "./TrainerDailyBundleEditor";

type LiveSession = { actor: PanelActor; token: string | null; authEpoch?: string } | null;
export type TrainerDailyScheduleEditorProps = {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  initialFrom: string;
  enableDailyManage?: boolean;
  dailyCalendarTransport?: ScheduleTransport;
  dailyManageTransport?: TrainerDailyManageTransport;
  getCurrentSession?: () => LiveSession;
  selectedDate?: string | null;
  onVerifiedChange?: () => void;
};

type LoadResult = {
  scope: string;
  state: "loading" | "ready" | "error";
  rows: Schedule[];
  candidates: CalendarCandidate[];
};
const isoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const headersSafe = (headers: Record<string, string>) => {
  const tokens = (headers["cache-control"] ?? "").toLowerCase().split(",")
    .map(token => token.trim());
  return tokens.includes("private") && tokens.includes("no-store") &&
    !tokens.includes("public");
};

/** Calendar write UI: restricted to ADMIN until Core has atomic owner-date CAS.
 * The existing trainer/moderator calendar remains readable; write is not faked.
 */
export function TrainerDailyScheduleEditor(p: TrainerDailyScheduleEditorProps) {
  const [from, setFrom] = useState(p.initialFrom);
  const [date, setDate] = useState(p.initialFrom);
  const [bundleId, setBundleId] = useState("");
  const [published, setPublished] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<LoadResult>({
    scope: "", state: "loading", rows: [], candidates: [],
  });
  const [writeState, setWriteState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const sessionReader = useRef(p.getCurrentSession);
  sessionReader.current = p.getCurrentSession;
  const identity = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const current = () => {
    const s = sessionReader.current ? sessionReader.current() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!s && s.actor.id === p.actor.id && s.actor.role === p.actor.role &&
      s.token === p.token && s.authEpoch === p.authEpoch;
  };
  const enabled = p.pathname === "/main-panel/daily-course" &&
    p.actor.role === "ADMIN" && p.enableDailyManage === true &&
    !!p.token && !!p.authEpoch && !!p.dailyCalendarTransport &&
    !!p.dailyManageTransport && current();
  const rangeEnd = isoDate(from) ? shift(from, 29) : from;
  const scope = JSON.stringify([identity, from, rangeEnd]);
  const busy = writeState === "pending";
  const visible = data.scope === scope && data.state === "ready";
  const selected = visible ? data.rows.find(item => item.date === date) : undefined;
  const validDate = isoDate(date) && date >= from && date <= rangeEnd;
  const candidateAvailable = visible && data.candidates.some(item => item.id === bundleId);

  useEffect(() => {
    if (!p.selectedDate || !enabled || data.scope !== scope || data.state !== "ready") return;
    const existing = data.rows.find(item => item.date === p.selectedDate);
    if (existing) {
      setBundleId(existing.bundle.id);
      setPublished(existing.isPublished);
    }
    // This editor instance is keyed by the requested date in its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selectedDate, data.scope, data.state]);
  // Revalidate both bound, private reads after mutations; no optimistic data painting.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setData({ scope, state: "loading", rows: [], candidates: [] });
    if (enabled) {
      void Promise.all([
        readRange({ from, to: rangeEnd, transport: p.dailyCalendarTransport!,
          signal: controller.signal, isCurrent: () => alive && current() }),
        readCalendarCandidates({ actorId: p.actor.id, role: "ADMIN",
          transport: p.dailyCalendarTransport!, signal: controller.signal,
          isCurrent: () => alive && current() }),
      ]).then(([rows, candidates]) => {
        if (alive && current()) setData({ scope, state: "ready", rows, candidates });
      }).catch(() => {
        if (alive && current())
          setData({ scope, state: "error", rows: [], candidates: [] });
      });
    }
    return () => { alive = false; controller.abort(); active.current?.abort(); };
    // The principal identity and transport are the only request lifetime inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, enabled, reload, p.dailyCalendarTransport]);

  async function mutate(method: "PUT" | "DELETE") {
    if (!enabled || busy || writing.current || !visible || !validDate) return;
    if (method === "PUT" && (!candidateAvailable ||
        (selected && !replaceConfirmed))) return;
    if (method === "DELETE" && (!selected || deleteConfirmation !== date)) return;
    writing.current = true;
    const controller = new AbortController();
    active.current = controller;
    setWriteState("pending");
    setMessage("");
    try {
      const response = await p.dailyManageTransport!({
        method,
        path: method === "PUT" ? "/api/v1/trainer/daily-course/manage/schedule" :
          `/api/v1/trainer/daily-course/manage/schedule/${selected!.id}`,
        ...(method === "PUT" ? { body: { date, bundleId, isPublished: published } } : {}),
        signal: controller.signal,
      });
      if (controller.signal.aborted || !current()) return;
      if (response.status !== 200 || !headersSafe(response.headers) ||
          !response.body || typeof response.body !== "object" ||
          !("success" in response.body) || response.body.success !== true) {
        throw Error("WRITE_REJECTED");
      }
      // Core success alone is not a substitute for the schedule being visible to its owner.
      const readback = await readRange({ from: date, to: date,
        transport: p.dailyCalendarTransport!, signal: controller.signal,
        isCurrent: () => current() && !controller.signal.aborted });
      if (controller.signal.aborted || !current()) return;
      const verified = method === "DELETE" ? readback.length === 0 :
        readback.length === 1 && readback[0]?.bundle.id === bundleId &&
        readback[0]?.isPublished === published;
      if (!verified) throw Error("UNVERIFIED_WRITE");
      setWriteState("success");
      setMessage(method === "DELETE" ? "Удаление расписания подтверждено" :
        "Расписание сохранено и проверено");
      setReplaceConfirmed(false);
      setDeleteConfirmation("");
      setReload(n => n + 1);
      p.onVerifiedChange?.();
    } catch {
      if (!controller.signal.aborted && current()) {
        setWriteState("error");
        setMessage("Не удалось подтвердить изменение. Обновите расписание перед повтором.");
      }
    } finally {
      if (active.current === controller) active.current = null;
      writing.current = false;
      if (!controller.signal.aborted && current()) setWriteState(state =>
        state === "pending" ? "error" : state);
    }
  }
  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void mutate("PUT");
  };
  if (!enabled) return null;
  return <section className="trainer-workspace-editor trainer-workspace-panel"
    id="daily-schedule-editor" data-trainer-daily-schedule-editor="hono"
    aria-label="Управление расписанием курса дня">
    <h2>Назначить день курса</h2>
    <p>Изменение опубликованных дат может повлиять на занятия пользователей.
      Проверяйте выбранную связку перед сохранением.</p>
    <nav aria-label="Месяцы редактора">
      <button type="button" disabled={busy} onClick={() => {
        const next = shift(from, -30);
        setFrom(next); setDate(next); setWriteState("idle");
        setReplaceConfirmed(false); setDeleteConfirmation("");
      }}>Предыдущие даты</button>
      <span>{from} — {rangeEnd}</span>
      <button type="button" disabled={busy} onClick={() => {
        const next = shift(from, 30);
        setFrom(next); setDate(next); setWriteState("idle");
        setReplaceConfirmed(false); setDeleteConfirmation("");
      }}>Следующие даты</button>
    </nav>
    {data.scope !== scope || data.state === "loading" ?
      <p role="status">Загрузка редактора календаря…</p> :
      data.state === "error" ?
        <p role="alert">Не удалось прочитать расписание и связки.
          <button type="button" onClick={() => setReload(n => n + 1)}>Повторить</button>
        </p> :
        <form onSubmit={onSave}>
          <label>Дата назначения
            <input type="date" required min={from} max={rangeEnd} value={date}
              onChange={e => {
                setDate(e.target.value); setReplaceConfirmed(false);
                setDeleteConfirmation(""); setWriteState("idle");
              }} />
          </label>
          {validDate && selected && <p role="status">На эту дату уже назначено:
            {" "}{selected.bundle.title} ({selected.isPublished ? "опубликовано" : "черновик"}).
          </p>}
          <label>Связка для назначения
            <select required value={bundleId} onChange={e => {
              setBundleId(e.target.value); setReplaceConfirmed(false); setWriteState("idle");
            }}>
              <option value="">Выберите связку</option>
              {data.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
                {candidate.title} — {candidate.stepsCount} шагов
              </option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={published} onChange={e => {
            setPublished(e.target.checked); setReplaceConfirmed(false); setWriteState("idle");
          }} /> Опубликовать день</label>
          {selected && validDate && <label>
            <input type="checkbox" checked={replaceConfirmed}
              onChange={e => setReplaceConfirmed(e.target.checked)} />
            Подтверждаю замену существующего назначения на {date}
          </label>}
          <button type="submit" disabled={busy || !validDate || !candidateAvailable ||
            (!!selected && !replaceConfirmed)}>{busy ? "Сохраняем…" : "Сохранить назначение"}</button>
          {selected && validDate && <fieldset>
            <legend>Удаление назначения на {date}</legend>
            <label>Для удаления введите дату {date}
              <input value={deleteConfirmation} onChange={e =>
                setDeleteConfirmation(e.target.value)} placeholder="ГГГГ-ММ-ДД" />
            </label>
            <button type="button" disabled={busy || deleteConfirmation !== date}
              onClick={() => void mutate("DELETE")}>Удалить будущее назначение</button>
          </fieldset>}
        </form>}
    {(writeState === "success" || writeState === "error") &&
      <p role={writeState === "error" ? "alert" : "status"}>{message}</p>}
  </section>;
}
