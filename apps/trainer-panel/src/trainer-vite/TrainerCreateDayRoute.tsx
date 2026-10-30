import { useEffect, useRef, useState, type FormEvent } from "react";
import { readVisibleSteps, type VisibleStepDto } from "./tr013VisibleStepsRead20261022";
import { useTrainerAuthoring, type TrainerAuthoringProps } from "./trainerAuthoringClient";

export function TrainerCreateDayRoute(p: TrainerAuthoringProps) {
  const auth = useTrainerAuthoring(p, "/main-panel/days/new");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dayType, setDayType] = useState("regular");
  const [equipment, setEquipment] = useState("");
  const [exportPath, setExportPath] = useState(false);
  const [shareProgress, setShareProgress] = useState(false);
  const [steps, setSteps] = useState<VisibleStepDto[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const principal = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.search]);
  const sessionCheckRef = useRef(auth.isCurrent);
  sessionCheckRef.current = auth.isCurrent;
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setSteps([]); setChosen([]); setLoad("loading");
    if (auth.allowed && p.visibleStepsTransport)
      void readVisibleSteps({
        enabled: true, actor: p.actor, isDailyCourse: false, signal: ac.signal,
        isCurrent: () => live && sessionCheckRef.current(),
        transport: p.visibleStepsTransport,
      }).then(rows => {
        if (!live || !sessionCheckRef.current()) return;
        setSteps(rows); setLoad("ready");
        const ids = new URLSearchParams(p.search ?? "").getAll("stepIds");
        const allowedIds = new Set(rows.map(row => row.id));
        setChosen([...new Set(ids.filter(id => allowedIds.has(id)))]);
      }).catch(() => {
        if (live && sessionCheckRef.current()) setLoad("error");
      });
    return () => { live = false; ac.abort(); };
    // Principal and injected transports deliberately own GET lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal, p.visibleStepsTransport, auth.allowed, retry]);
  const choose = (id: string, checked: boolean) => setChosen(before =>
    checked ? [...before.filter(x => x !== id), id] : before.filter(x => x !== id));
  const move = (id: string, shift: number) => setChosen(before => {
    const next = [...before];
    const index = next.indexOf(id);
    if (index === -1 || index + shift < 0 || index + shift >= next.length) return before;
    [next[index], next[index + shift]] = [next[index + shift]!, next[index]!];
    return next;
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth.allowed || load !== "ready" || auth.phase === "pending") return;
    void auth.submit({
      title: title.trim(), description: description.trim(), type: dayType.trim(),
      equipment: equipment.trim(), showCoursePathExport: exportPath,
      shareProgressAcrossCourses: shareProgress, stepIds: chosen,
    }, "/api/v1/trainer/authoring/days");
  };
  if (!auth.allowed) return <main><p role="alert">Создание дня недоступно</p></main>;
  return <main data-trainer-create-day="hono">
    <h1>Создание тренировочного дня</h1>
    <p>Соберите день из существующих шагов. Порядок шагов можно изменить.</p>
    <form onSubmit={onSubmit}>
      <label>Название дня<input required value={title}
        onChange={e => setTitle(e.target.value)} /></label>
      <label>Тип дня<input value={dayType}
        onChange={e => setDayType(e.target.value)} /></label>
      <label>Описание<textarea value={description}
        onChange={e => setDescription(e.target.value)} /></label>
      <label>Оборудование<input value={equipment}
        onChange={e => setEquipment(e.target.value)} /></label>
      <label><input type="checkbox" checked={exportPath}
        onChange={e => setExportPath(e.target.checked)} /> Показывать путь курса</label>
      <label><input type="checkbox" checked={shareProgress}
        onChange={e => setShareProgress(e.target.checked)} /> Общий прогресс между курсами</label>
      <fieldset><legend>Шаги для дня</legend>
        {load === "loading" && <p role="status">Загрузка шагов</p>}
        {load === "error" && <p role="alert">Ошибка получения шагов
          <button type="button" onClick={() => setRetry(x => x + 1)}>Повторить</button></p>}
        {load === "ready" && steps.length === 0 && <p role="status">Нет доступных шагов</p>}
        {load === "ready" && steps.map(step => <label key={step.id}>
          <input type="checkbox" checked={chosen.includes(step.id)}
            onChange={e => choose(step.id, e.target.checked)} /> {step.title}
        </label>)}
        {chosen.length > 0 && <ol aria-label="Порядок выбранных шагов">
          {chosen.map((id, index) => <li key={id}>
            {steps.find(step => step.id === id)?.title ?? "Шаг"}
            <button type="button" disabled={index === 0}
              onClick={() => move(id, -1)}>Вверх</button>
            <button type="button" disabled={index === chosen.length - 1}
              onClick={() => move(id, 1)}>Вниз</button>
          </li>)}
        </ol>}
      </fieldset>
      {(auth.phase === "error" || auth.phase === "denied") &&
        <p role="alert">{auth.message}</p>}
      {auth.phase === "success" && <p role="status">День создан. <a href="/main-panel/days">К списку дней</a></p>}
      <button type="submit" disabled={load !== "ready" || auth.phase === "pending" || auth.phase === "success"}>
        {auth.phase === "pending" ? "Сохраняем…" : "Создать день"}
      </button>
    </form>
  </main>;
}
