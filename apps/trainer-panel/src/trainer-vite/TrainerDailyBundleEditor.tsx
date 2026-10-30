import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PanelActor } from "./consultationContract";
import { readDailyBundles, type DailyBundle } from "./tr014DailyBundlesRead20261022";
import { readBundleCandidates, type Candidate } from "./tr014BundleCandidatesRead20261022";
import type { DailyBundleTransport } from "./TrainerDailyBundlesOptInRoute";

export type TrainerDailyManageTransport = (input: {
  method: "PUT" | "DELETE";
  path: string;
  body?: unknown;
  signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export type TrainerDailyManageProps = {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enableDailyManage?: boolean;
  dailyBundleTransport?: DailyBundleTransport;
  dailyManageTransport?: TrainerDailyManageTransport;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
};
export function TrainerDailyBundleEditor(p: TrainerDailyManageProps) {
  const [rows, setRows] = useState<DailyBundle[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [equipment, setEquipment] = useState("");
  const [type, setType] = useState("daily_course");
  const [bundleId, setBundleId] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [retry, setRetry] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const sessionRef = useRef(p.getCurrentSession);
  sessionRef.current = p.getCurrentSession;
  const identity = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const check = () => {
    const current = sessionRef.current ? sessionRef.current() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!current && current.actor.id === p.actor.id &&
      current.actor.role === p.actor.role && current.token === p.token &&
      current.authEpoch === p.authEpoch;
  };
  const enabled = p.pathname === "/main-panel/daily-course/bundles" &&
    !!p.token && !!p.authEpoch && !!p.dailyBundleTransport &&
    !!p.dailyManageTransport && p.enableDailyManage === true &&
    ["TRAINER", "ADMIN"].includes(p.actor.role) && check();
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setLoad("loading"); setRows([]); setCandidates([]);
    setOutcome(""); setChosen([]); setDeleteConfirm("");
    if (enabled) void Promise.all([
      readDailyBundles({
        enabled: true, actorId: p.actor.id, role: p.actor.role as "TRAINER" | "ADMIN",
        isCurrent: () => live && check(), signal: controller.signal,
        transport: p.dailyBundleTransport!,
      }),
      readBundleCandidates({
        actorId: p.actor.id, role: p.actor.role as "TRAINER" | "ADMIN",
        isCurrent: () => live && check(), signal: controller.signal,
        transport: p.dailyBundleTransport!,
      }),
    ]).then(([bundles, steps]) => {
      if (live && check()) { setRows(bundles); setCandidates(steps); setLoad("ready"); }
    }).catch(() => { if (live && check()) setLoad("error"); });
    return () => { live = false; controller.abort(); pending.current?.abort(); };
    // Only the principal and explicit retry can reissue GET. No implicit repeated writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, enabled, retry, p.dailyBundleTransport]);
  function selectBundle(id: string) {
    const row = rows.find(item => item.id === id);
    setBundleId(id);
    setTitle(row?.title ?? ""); setDescription(row?.description ?? "");
    setEquipment(row?.equipment ?? ""); setType(row?.type ?? "daily_course");
    setChosen(row?.steps.map(step => step.id) ?? []);
    setOutcome(""); setDeleteConfirm("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || saving || writing.current || chosen.length < 2 || chosen.length > 5) return;
    writing.current = true;
    const controller = new AbortController(); pending.current = controller;
    setSaving(true); setOutcome("");
    try {
      const response = await p.dailyManageTransport!({
        method: "PUT", path: "/api/v1/trainer/daily-course/manage/bundles",
        body: { ...(bundleId ? { id: bundleId } : {}), title: title.trim(),
          description: description.trim(), equipment: equipment.trim(),
          type: type.trim(), stepIds: chosen }, signal: controller.signal,
      });
      if (controller.signal.aborted || !check()) return;
      const cache = (response.headers["cache-control"] ?? "").toLowerCase();
      const envelope = response.body;
      const data = envelope && typeof envelope === "object" && "data" in envelope ?
        envelope.data : null;
      const savedId = data && typeof data === "object" && "id" in data &&
        typeof data.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.id) ? data.id : null;
      if (response.status === 200 && cache.includes("private") &&
          cache.includes("no-store") && envelope &&
          typeof envelope === "object" && "success" in envelope &&
          envelope.success === true && savedId) {
        // Keep returned ID before readback; a retry cannot create a duplicate.
        setBundleId(savedId);
        const refreshed = await readDailyBundles({
          enabled: true, actorId: p.actor.id, role: p.actor.role as "TRAINER" | "ADMIN",
          isCurrent: () => check() && !controller.signal.aborted,
          signal: controller.signal, transport: p.dailyBundleTransport!,
        });
        if (controller.signal.aborted || !check()) return;
        const verified = refreshed.find(row => row.id === savedId);
        if (!verified || verified.title !== title.trim() ||
            verified.type !== type.trim() ||
            verified.steps.length !== chosen.length ||
            verified.steps.some((step, index) => step.id !== chosen[index])) {
          setOutcome("Сохранение не подтверждено. Обновите список до повторной отправки.");
        } else {
          setRows(refreshed);
          setOutcome("Связка сохранена и проверена");
        }
      } else setOutcome("Не удалось сохранить связку — проверьте права и данные");
    } catch {
      if (!controller.signal.aborted && check())
        setOutcome("Не удалось подтвердить сохранение. Обновите список до повтора.");
    } finally {
      if (pending.current === controller) pending.current = null;
      writing.current = false;
      setSaving(false);
    }
  }
  async function deleteBundle() {
    const row = rows.find(item => item.id === bundleId);
    if (!enabled || !row || deleteConfirm !== row.title || saving || writing.current ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)) return;
    writing.current = true;
    const controller = new AbortController();
    pending.current = controller;
    setSaving(true); setOutcome("");
    try {
      const response = await p.dailyManageTransport!({
        method: "DELETE", path: `/api/v1/trainer/daily-course/manage/bundles/${row.id}`,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !check()) return;
      const cache = (response.headers["cache-control"] ?? "").toLowerCase().split(",")
        .map(token => token.trim());
      const body = response.body;
      if (response.status !== 200 || !cache.includes("private") ||
          !cache.includes("no-store") || cache.includes("public") ||
          !body || typeof body !== "object" || !("success" in body) ||
          body.success !== true) throw Error("DELETE_DENIED");
      const fresh = await readDailyBundles({
        enabled: true, actorId: p.actor.id, role: p.actor.role as "TRAINER" | "ADMIN",
        isCurrent: () => check() && !controller.signal.aborted,
        signal: controller.signal, transport: p.dailyBundleTransport!,
      });
      if (controller.signal.aborted || !check()) return;
      if (fresh.some(item => item.id === row.id)) throw Error("DELETE_UNVERIFIED");
      setRows(fresh);
      setBundleId(""); setTitle(""); setDescription(""); setEquipment("");
      setType("daily_course"); setChosen([]); setDeleteConfirm("");
      setOutcome("Удаление связки подтверждено");
    } catch {
      if (!controller.signal.aborted && check())
        setOutcome("Удаление не подтверждено. Связка может использоваться в расписании.");
    } finally {
      if (pending.current === controller) pending.current = null;
      writing.current = false;
      if (!controller.signal.aborted && check()) setSaving(false);
    }
  }
  const choose = (id: string, yes: boolean) => setChosen(previous =>
    yes ? [...previous.filter(value => value !== id), id] :
      previous.filter(value => value !== id));
  const move = (id: string, offset: number) => setChosen(previous => {
    const next = [...previous]; const index = next.indexOf(id);
    if (index < 0 || index + offset < 0 || index + offset >= next.length) return previous;
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    return next;
  });
  if (!enabled) return null;
  return <section aria-label="Управление связками курса дня" data-daily-bundle-editor="hono">
    <h2>Создать или изменить связку</h2>
    {load === "loading" && <p role="status">Загрузка редактора связок</p>}
    {load === "error" && <p role="alert">Не удалось загрузить связки и шаги
      <button type="button" onClick={() => setRetry(n => n + 1)}>Повторить</button></p>}
    {load === "ready" && <form onSubmit={save}>
      <label>Связка
        <select aria-label="Редактируемая связка" value={bundleId}
          onChange={e => selectBundle(e.target.value)}>
          <option value="">Новая связка</option>
          {bundleId && !rows.some(row => row.id === bundleId) &&
            <option value={bundleId}>Недавно сохранённая связка</option>}
          {rows.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
        </select>
      </label>
      <label>Название<input required value={title}
        onChange={e => setTitle(e.target.value)} /></label>
      <label>Тип<input required value={type} onChange={e => setType(e.target.value)} /></label>
      <label>Оборудование<input value={equipment}
        onChange={e => setEquipment(e.target.value)} /></label>
      <label>Описание<textarea value={description}
        onChange={e => setDescription(e.target.value)} /></label>
      <fieldset><legend>Выберите 2–5 шагов в нужном порядке</legend>
        {candidates.map(step => <label key={step.id}>
          <input type="checkbox" checked={chosen.includes(step.id)}
            onChange={e => choose(step.id, e.target.checked)} /> {step.title}
        </label>)}
        <ol aria-label="Порядок связки">{chosen.map((id, index) => <li key={id}>
          {candidates.find(step => step.id === id)?.title ?? "Шаг"}
          <button type="button" disabled={index === 0}
            onClick={() => move(id, -1)}>Вверх</button>
          <button type="button" disabled={index === chosen.length - 1}
            onClick={() => move(id, 1)}>Вниз</button>
        </li>)}</ol>
      </fieldset>
      {outcome && <p role="status">{outcome}</p>}
      <button type="submit" disabled={saving || chosen.length < 2 || chosen.length > 5}>
        {saving ? "Сохраняем…" : "Сохранить связку"}
      </button>
      {rows.some(row => row.id === bundleId) && <fieldset>
        <legend>Удаление связки</legend>
        <p>Связку, используемую в расписании, удалить нельзя.</p>
        <label>Введите точное название выбранной связки для удаления
          <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} />
        </label>
        <button type="button" disabled={saving ||
          deleteConfirm !== rows.find(row => row.id === bundleId)?.title}
          onClick={() => void deleteBundle()}>Удалить выбранную связку</button>
      </fieldset>}
    </form>}
  </section>;
}
