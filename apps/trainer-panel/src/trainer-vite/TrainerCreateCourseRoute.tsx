import { useEffect, useRef, useState, type FormEvent } from "react";
import { readVisibleDays, type VisibleDay } from "./trainerVisibleDaysRead20261022";
import { useTrainerAuthoring, type TrainerAuthoringProps } from "./trainerAuthoringClient";
import type { VisibleDaysTransport } from "./trainerVisibleDaysRead20261022";

export type TrainerCreateCourseProps = TrainerAuthoringProps & {
  visibleDaysTransport?: VisibleDaysTransport;
};
export function TrainerCreateCourseRoute(p: TrainerCreateCourseProps) {
  const auth = useTrainerAuthoring(p, "/main-panel/courses/new");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [guideContent, setGuideContent] = useState("");
  const [duration, setDuration] = useState("");
  const [equipment, setEquipment] = useState("");
  const [trainingLevel, setTrainingLevel] = useState(
    "BEGINNER" as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
  );
  const [showInProfile, setShowInProfile] = useState(true);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [days, setDays] = useState<VisibleDay[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const guardRef = useRef(auth.isCurrent);
  guardRef.current = auth.isCurrent;
  const actorId = p.actor.id;
  const role = p.actor.role;
  const identity = JSON.stringify([actorId, role, p.token, p.authEpoch]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setLoad("loading"); setDays([]); setSelected([]);
    if (auth.allowed && p.visibleDaysTransport)
      void readVisibleDays({
        actorId, role: role as "TRAINER" | "ADMIN",
        signal: controller.signal, isCurrent: () => live && guardRef.current(),
        transport: p.visibleDaysTransport,
      }).then(rows => {
        if (live && guardRef.current()) { setDays(rows); setLoad("ready"); }
      }).catch(() => { if (live && guardRef.current()) setLoad("error"); });
    return () => { live = false; controller.abort(); };
    // Immutable auth identity + read transport govern GET lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, auth.allowed, p.visibleDaysTransport, retry]);
  const choose = (id: string, add: boolean) => setSelected(before =>
    add ? [...before.filter(value => value !== id), id] : before.filter(value => value !== id));
  const move = (id: string, offset: number) => setSelected(before => {
    const next = [...before]; const i = next.indexOf(id);
    if (i < 0 || i + offset < 0 || i + offset >= next.length) return before;
    [next[i], next[i + offset]] = [next[i + offset]!, next[i]!];
    return next;
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth.allowed || load !== "ready" || auth.phase === "pending") return;
    void auth.submit({
      name: name.trim(), guideContent: guideContent.trim() || null,
      shortDesc: shortDesc.trim(), description: description.trim(),
      duration: duration.trim(), videoUrl: null, logoImg: "",
      isPublic: true, isPaid: false, showInProfile, isPersonalized,
      trainingDays: selected, allowedUsers: [], equipment: equipment.trim(),
      trainingLevel,
    }, "/api/v1/trainer/authoring/courses");
  };
  if (!auth.allowed)
    return <main><p role="alert">Создание курса недоступно</p></main>;
  return <main data-trainer-create-course="hono">
    <h1>Создание нового курса</h1>
    <p>Заполните информацию о новом курсе и выберите тренировочные дни</p>
    <p>На текущем этапе через новый API можно создавать бесплатные публичные курсы.
      Приватные и платные курсы требуют завершения отдельного контракта доступа.</p>
    <form onSubmit={onSubmit}>
      <label>Название курса *
        <input required maxLength={500} value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label>Краткое описание
        <textarea value={shortDesc} maxLength={2000}
          onChange={e => setShortDesc(e.target.value)} />
      </label>
      <label>Полное описание
        <textarea value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <label>Длительность курса *
        <input required maxLength={100} value={duration}
          onChange={e => setDuration(e.target.value)} />
      </label>
      <label>Уровень подготовки
        <select value={trainingLevel}
          onChange={e => setTrainingLevel(e.target.value as typeof trainingLevel)}>
          <option value="BEGINNER">Начальный</option>
          <option value="INTERMEDIATE">Средний</option>
          <option value="ADVANCED">Продвинутый</option>
          <option value="EXPERT">Экспертный</option>
        </select>
      </label>
      <label>Оборудование
        <input maxLength={1000} value={equipment}
          onChange={e => setEquipment(e.target.value)} />
      </label>
      <label>Методические рекомендации
        <textarea value={guideContent} maxLength={200000}
          onChange={e => setGuideContent(e.target.value)} />
      </label>
      <label><input type="checkbox" checked={showInProfile}
        onChange={e => setShowInProfile(e.target.checked)} /> Показывать в профиле</label>
      <label><input type="checkbox" checked={isPersonalized}
        onChange={e => setIsPersonalized(e.target.checked)} /> Персонализированный курс</label>
      <fieldset><legend>Дни курса и порядок</legend>
        {load === "loading" && <p role="status">Загрузка дней</p>}
        {load === "error" && <p role="alert">Не удалось получить дни
          <button type="button" onClick={() => setRetry(n => n + 1)}>Повторить</button></p>}
        {load === "ready" && days.length === 0 && <p role="status">Дней пока нет</p>}
        {load === "ready" && days.map(day => <label key={day.id}>
          <input type="checkbox" checked={selected.includes(day.id)}
            onChange={e => choose(day.id, e.target.checked)} /> {day.title}
        </label>)}
        {selected.length > 0 && <ol aria-label="Порядок дней курса">
          {selected.map((id, i) => <li key={id}>
            {days.find(day => day.id === id)?.title ?? "День"}
            <button type="button" disabled={i === 0}
              onClick={() => move(id, -1)}>Вверх</button>
            <button type="button" disabled={i === selected.length - 1}
              onClick={() => move(id, 1)}>Вниз</button>
          </li>)}
        </ol>}
      </fieldset>
      {(auth.phase === "error" || auth.phase === "denied") &&
        <p role="alert">{auth.message}</p>}
      {auth.phase === "success" &&
        <p role="status">Курс создан. <a href="/main-panel">К панели тренера</a></p>}
      <button type="submit" disabled={load !== "ready" ||
        auth.phase === "pending" || auth.phase === "success"}>
        {auth.phase === "pending" ? "Создаём…" : "Создать курс"}
      </button>
    </form>
  </main>;
}
