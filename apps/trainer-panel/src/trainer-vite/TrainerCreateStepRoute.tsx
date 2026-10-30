import { useState, type FormEvent } from "react";
import { useTrainerAuthoring, type TrainerAuthoringProps } from "./trainerAuthoringClient";

const types = [
  ["TRAINING", "Тренировка"], ["THEORY", "Теория"],
  ["PRACTICE", "Практика"], ["BREAK", "Перерыв"],
  ["EXAMINATION", "Экзамен"], ["DIARY", "Дневник"], ["SURVEY", "Опрос"],
] as const;
export function TrainerCreateStepRoute(p: TrainerAuthoringProps) {
  const auth = useTrainerAuthoring(p, "/main-panel/steps/new");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<(typeof types)[number][0]>("TRAINING");
  const [duration, setDuration] = useState("90");
  const [estimate, setEstimate] = useState("");
  const [video, setVideo] = useState("");
  const [survey, setSurvey] = useState("");
  const [daily, setDaily] = useState(false);
  const [written, setWritten] = useState(false);
  const [report, setReport] = useState(false);
  const [test, setTest] = useState(false);
  const [checklistText, setChecklistText] = useState("[]");
  const [localError, setLocalError] = useState("");
  const hasMedia = ["TRAINING", "THEORY", "PRACTICE"].includes(type);
  const hasDuration = type === "TRAINING" || type === "BREAK";
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth.allowed || auth.phase === "pending") return;
    setLocalError("");
    let checklist: unknown = null;
    if (type === "EXAMINATION" && test) {
      try { checklist = JSON.parse(checklistText); }
      catch { setLocalError("Введите корректные JSON-вопросы экзамена"); return; }
    }
    const seconds = duration.trim() ? Number(duration) : null;
    const minutes = estimate.trim() ? Number(estimate) : null;
    if (hasDuration && (!Number.isInteger(seconds) || seconds === null ||
        seconds < 1 || seconds > 6000)) {
      setLocalError("Укажите длительность от 1 до 6000 секунд"); return;
    }
    if (minutes !== null && (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 10000)) {
      setLocalError("Некорректная оценочная длительность"); return;
    }
    if (type === "EXAMINATION" && !written && !report && !test) {
      setLocalError("Выберите хотя бы один способ сдачи экзамена"); return;
    }
    void auth.submit({
      title: title.trim(), description: description.trim(), type,
      durationSec: hasDuration ? seconds : null,
      estimatedDurationSec: minutes === null ? null : minutes * 60,
      videoUrl: hasMedia && video.trim() ? video.trim() : null,
      imageUrls: [], pdfUrls: [], checklist,
      requiresVideoReport: type === "EXAMINATION" && report,
      requiresWrittenFeedback: type === "EXAMINATION" && written,
      hasTestQuestions: type === "EXAMINATION" && test,
      surveySlug: type === "SURVEY" ? survey.trim() : null,
      isDailyCourse: daily,
    }, "/api/v1/trainer/authoring/steps");
  };
  if (!auth.allowed) return <main><p role="alert">Создание шага недоступно</p></main>;
  return <main data-trainer-create-step="hono">
    <h1>Создание шага тренировки</h1>
    <p>Заполните информацию о новом шаге тренировки</p>
    <p><a href="/main-panel/templates">Библиотека шаблонов</a></p>
    <form onSubmit={onSubmit}>
      <label>Название<input required minLength={3} maxLength={100} value={title}
        onChange={e => setTitle(e.target.value)} /></label>
      <label>Тип шага<select value={type} onChange={e => setType(e.target.value as typeof type)}>
        {types.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select></label>
      <label>Описание<textarea required minLength={10} maxLength={8000} value={description}
        onChange={e => setDescription(e.target.value)} /></label>
      {hasDuration && <label>Длительность, сек.
        <input type="number" required min={1} max={6000} value={duration}
          onChange={e => setDuration(e.target.value)} />
      </label>}
      <label>Оценочная длительность, мин.
        <input type="number" min={1} value={estimate}
          onChange={e => setEstimate(e.target.value)} />
      </label>
      {hasMedia && <label>Ссылка на загруженное видео
        <input value={video} maxLength={2000} onChange={e => setVideo(e.target.value)} />
      </label>}
      {type === "SURVEY" && <label>Шаблон опроса
        <input required value={survey} onChange={e => setSurvey(e.target.value)} />
      </label>}
      {type === "EXAMINATION" && <fieldset><legend>Способы сдачи экзамена</legend>
        <label><input type="checkbox" checked={test} onChange={e => setTest(e.target.checked)} /> Тест</label>
        <label><input type="checkbox" checked={written}
          onChange={e => setWritten(e.target.checked)} /> Письменный ответ</label>
        <label><input type="checkbox" checked={report}
          onChange={e => setReport(e.target.checked)} /> Видеотчёт</label>
        {test && <label>Вопросы теста (JSON)
          <textarea value={checklistText} onChange={e => setChecklistText(e.target.value)} />
        </label>}
      </fieldset>}
      <label><input type="checkbox" checked={daily}
        onChange={e => setDaily(e.target.checked)} /> Курс дня</label>
      {localError && <p role="alert">{localError}</p>}
      {(auth.phase === "error" || auth.phase === "denied") &&
        <p role="alert">{auth.message}</p>}
      {auth.phase === "success" && <p role="status">Шаг создан. <a href="/main-panel/steps">К списку шагов</a></p>}
      <button type="submit" disabled={auth.phase === "pending" || auth.phase === "success"}>
        {auth.phase === "pending" ? "Сохраняем…" : "Создать шаг"}
      </button>
    </form>
  </main>;
}
