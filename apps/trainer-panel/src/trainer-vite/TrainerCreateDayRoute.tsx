import { useEffect, useRef, useState, type FormEvent } from "react";
import { readVisibleSteps, type VisibleStepDto } from "./tr013VisibleStepsRead20261022";
import { useTrainerAuthoring, type TrainerAuthoringProps } from "./trainerAuthoringClient";
import { TrainerCourseDayPicker } from "./live/TrainerCourseDayPicker";
import {
  TrainerFormPage, TrainerFormSection, TrainerFormActions, TrainerMarkdownEditor,
} from "./live/TrainerFormUI";


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
        setChosen(ids.filter(id => allowedIds.has(id)).slice(0, 250));
      }).catch(() => {
        if (live && sessionCheckRef.current()) setLoad("error");
      });
    return () => { live = false; ac.abort(); };
    // Principal and injected transports deliberately own GET lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal, p.visibleStepsTransport, auth.allowed, retry]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth.allowed || load !== "ready" || auth.phase === "pending") return;
    void auth.submit({
      title: title.trim(), description: description.trim(), type: dayType.trim(),
      equipment: equipment.trim(), showCoursePathExport: dayType === "summary" && exportPath,
      shareProgressAcrossCourses: shareProgress, stepIds: chosen,
    }, "/api/v1/trainer/authoring/days");
  };
  if (!auth.allowed) return <main><p role="alert">Создание дня недоступно</p></main>;
  const days = [
    ["regular", "Тренировочный день", "Основной день с практическими шагами. Нумеруется в курсе."],
    ["introduction", "Вводный блок", "Знакомство с курсом, без номера дня."],
    ["instructions", "Инструкции", "Правила и методические материалы, без номера."],
    ["diagnostics", "Диагностика", "Проверка стартовых знаний и навыков."],
    ["summary", "Подведение итогов", "Финальный день после остальных тренировок."],
  ] as const;
  return <TrainerFormPage title="Создание дня тренировки"
    subtitle="Заполните информацию о дне и выберите шаги в нужном порядке"
    backHref="/days" backLabel="К списку дней">
    <form onSubmit={onSubmit} data-trainer-create-day="hono">
      <TrainerFormSection title="Основная информация">
        <label>Название дня *
          <input required maxLength={200} placeholder="Например: Основы послушания"
            value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label>Тип дня *
          <select value={dayType} onChange={event => setDayType(event.target.value)}>
            {days.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <div className="trainer-type-guide" role="note">
          <p>{days.find(([id]) => id === dayType)?.[2]}</p>
        </div>
        {dayType === "summary" && <label className="trainer-option">
          <input type="checkbox" checked={exportPath}
            onChange={event => setExportPath(event.target.checked)} />
          Показывать экспорт «Ваш путь» в этом дне
        </label>}
        <label className="trainer-option">
          <input type="checkbox" checked={shareProgress}
            onChange={event => setShareProgress(event.target.checked)} />
          Прогресс по этому дню засчитывается во всех курсах
        </label>
        <label>Необходимое оборудование
          <input placeholder="Например: поводок, игрушки, лакомства"
            value={equipment} onChange={event => setEquipment(event.target.value)} />
        </label>
        <TrainerMarkdownEditor label="Описание" required
          value={description} onChange={setDescription} />
        <p className="trainer-form-hint">
          В описании можно использовать плейсхолдеры {"{{userName}}"} и {"{{petName}}"}.
        </p>
      </TrainerFormSection>
      <TrainerFormSection title="Тренировочные шаги"
        hint="Выберите шаги, затем расставьте их в порядке выполнения.">
        {load === "loading" && <p role="status">Загрузка доступных шагов…</p>}
        {load === "error" && <p role="alert">Ошибка получения шагов
          <button className="trainer-button-secondary" type="button"
            onClick={() => setRetry(x => x + 1)}>Повторить</button>
        </p>}
        <TrainerCourseDayPicker kind="step"
          available={steps.map(step => ({ id: step.id, title: step.title }))}
          selectedIds={chosen} onChange={setChosen}
          disabled={load !== "ready" || auth.phase === "pending" || auth.phase === "success"} />
      </TrainerFormSection>
      {(auth.phase === "error" || auth.phase === "denied") &&
        <p role="alert">{auth.message}</p>}
      {auth.phase === "success" &&
        <p role="status">День создан. <a href="/days">К списку дней</a></p>}
      <TrainerFormActions>
        <a href="/days" className="trainer-form-back">Отмена</a>
        <button type="submit" disabled={load !== "ready" ||
          auth.phase === "pending" || auth.phase === "success"}>
          {auth.phase === "pending" ? "Сохраняем…" : "Создать день"}
        </button>
      </TrainerFormActions>
    </form>
  </TrainerFormPage>;
}
