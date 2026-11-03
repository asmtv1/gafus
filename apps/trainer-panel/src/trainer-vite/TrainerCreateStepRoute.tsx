import { TrainerVideoSelector } from "./TrainerVideoSelector";
import type { VideoMetadataTransport } from "./TrainerVideosMetadataRead20261022";
import { useState, type FormEvent } from "react";
import { useTrainerAuthoring, type TrainerAuthoringProps } from "./trainerAuthoringClient";
import {
  TrainerFormActions, TrainerFormPage, TrainerFormSection,
  TrainerMarkdownEditor, TrainerMediaUrls, TrainerExamQuestions,
  type TrainerQuestion, trainerSurveyChoices,
} from "./live/TrainerFormUI";

const types = [
  ["TRAINING", "Тренировочный"],
  ["THEORY", "Теоретический"],
  ["PRACTICE", "Тренировочный без таймера"],
  ["BREAK", "Перерыв"],
  ["EXAMINATION", "Экзаменационный"],
  ["DIARY", "Дневник успехов"],
  ["SURVEY", "Анкета"],
] as const;
const explanations: Record<(typeof types)[number][0], string> = {
  TRAINING: "Практический шаг с таймером. Упражнение завершается после истечения времени.",
  THEORY: "Изучение теории: текст, изображения и видео без выполнения упражнения.",
  PRACTICE: "Практическое упражнение без таймера: ученик отмечает выполнение самостоятельно.",
  BREAK: "Пауза между упражнениями с заданной длительностью.",
  EXAMINATION: "Проверка знаний или работы: тест, письменная обратная связь и/или видеоотчёт.",
  DIARY: "Дневниковая запись ученика с историей прогресса.",
  SURVEY: "Диагностический опрос внутри курса.",
};

export function TrainerCreateStepRoute(p: TrainerAuthoringProps & { videoMetadataTransport?: VideoMetadataTransport }) {
  const auth = useTrainerAuthoring(p, "/main-panel/steps/new");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<(typeof types)[number][0]>("TRAINING");
  const [duration, setDuration] = useState("90");
  const [estimate, setEstimate] = useState("");
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [survey, setSurvey] = useState<string>(trainerSurveyChoices[0].value);
  const [daily, setDaily] = useState(false);
  const [written, setWritten] = useState(false);
  const [report, setReport] = useState(false);
  const [test, setTest] = useState(false);
  const [questions, setQuestions] = useState<TrainerQuestion[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [pdfs, setPdfs] = useState<string[]>([]);
  const [localError, setLocalError] = useState("");
  const hasMedia = ["TRAINING", "THEORY", "PRACTICE", "EXAMINATION"].includes(type);
  const hasDuration = type === "TRAINING" || type === "BREAK";
  const hasEstimate = ["TRAINING", "THEORY", "PRACTICE", "BREAK", "EXAMINATION", "SURVEY"].includes(type);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth.allowed || auth.phase === "pending") return;
    setLocalError("");
    if (type === "EXAMINATION" && test && (
      questions.length === 0 || questions.some(question =>
        !question.id || !question.question.trim() || question.options.length < 2 ||
        question.options.some(option => !option.trim()) ||
        !Number.isInteger(question.correctAnswer) ||
        question.correctAnswer < 0 || question.correctAnswer >= question.options.length
      )
    )) {
      setLocalError("Добавьте вопросы с заполненными вариантами и правильным ответом.");
      return;
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
    if (type === "SURVEY" && !survey.trim()) {
      setLocalError("Выберите или укажите шаблон анкеты"); return;
    }
    void auth.submit({
      title: title.trim(), description: description.trim(), type,
      durationSec: hasDuration ? seconds : null,
      estimatedDurationSec: hasEstimate && minutes !== null ? minutes * 60 : null,
      videoUrl: hasMedia ? videoUrls[0] ?? null : null,
      videoUrls: hasMedia ? videoUrls : [],
      imageUrls: hasMedia ? images : [],
      pdfUrls: hasMedia ? pdfs : [],
      checklist: type === "EXAMINATION" && test ? questions : null,
      requiresVideoReport: type === "EXAMINATION" && report,
      requiresWrittenFeedback: type === "EXAMINATION" && written,
      hasTestQuestions: type === "EXAMINATION" && test,
      surveySlug: type === "SURVEY" ? survey.trim() : null,
      isDailyCourse: daily,
    }, "/api/v1/trainer/authoring/steps");
  };

  if (!auth.allowed) return <main><p role="alert">Создание шага недоступно</p></main>;
  return <TrainerFormPage title="Создание шага тренировки"
    subtitle="Настройте упражнение, материалы и условия выполнения"
    backHref="/steps" backLabel="К списку шагов">
    <form onSubmit={onSubmit} data-trainer-create-step="hono">
      <TrainerFormSection title="Основная информация">
        <label>Название шага *
          <input required minLength={3} maxLength={100} placeholder="Введите название шага"
            value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label>Тип шага *
          <select value={type} onChange={event => setType(event.target.value as typeof type)}>
            {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="trainer-type-guide" role="note"><p>{explanations[type]}</p></div>
        <label className="trainer-option">
          <input type="checkbox" checked={daily} onChange={event => setDaily(event.target.checked)} />
          Для курса дня
        </label>
        <TrainerMarkdownEditor label="Описание" value={description} required
          onChange={setDescription} placeholder="Опишите шаг, используя Markdown…" />
        <p className="trainer-form-hint">
          Можно использовать плейсхолдеры имени ученика и питомца: {"{{userName}}"}, {"{{petName}}"}.
        </p>
      </TrainerFormSection>

      {(hasDuration || hasEstimate) && <TrainerFormSection title="Время выполнения">
        {hasDuration && <label>Длительность таймера (секунды) *
          <input type="number" min={1} max={6000} required value={duration}
            onChange={event => setDuration(event.target.value)} />
        </label>}
        {hasEstimate && <label>Примерное время прохождения (минуты)
          <input type="number" min={1} max={10000} value={estimate}
            onChange={event => setEstimate(event.target.value)} />
        </label>}
      </TrainerFormSection>}

      {hasMedia && <TrainerFormSection title="Видео" hint="Укажите ссылку на готовое видео или найдите его в разделе «Мои видео».">
        <TrainerVideoSelector values={videoUrls} onChangeValues={setVideoUrls}
          actor={p.actor} token={p.token} authEpoch={p.authEpoch}
          getCurrentSession={p.getCurrentSession}
          videoMetadataTransport={p.videoMetadataTransport} />
      </TrainerFormSection>}

      {hasMedia && <TrainerFormSection title="Медиафайлы"
        hint="До восстановления безопасной загрузки можно использовать ссылки на уже загруженные файлы.">
        <TrainerMediaUrls label="Изображения" value={images} onChange={setImages} max={10} />
        <TrainerMediaUrls label="PDF-материалы" kind="pdf" value={pdfs} onChange={setPdfs} max={10} />
      </TrainerFormSection>}

      {type === "SURVEY" && <TrainerFormSection title="Шаблон анкеты">
        <label>Шаблон анкеты *
          <select required value={survey} onChange={event => setSurvey(event.target.value)}>
            {trainerSurveyChoices.map(({ value, label }) =>
              <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </TrainerFormSection>}

      {type === "EXAMINATION" && <TrainerFormSection title="Способы сдачи экзамена">
        <div className="trainer-option-grid">
          <label className="trainer-option-card">
            <input type="checkbox" checked={test} onChange={event => setTest(event.target.checked)} />
            Тестовые вопросы
          </label>
          <label className="trainer-option-card">
            <input type="checkbox" checked={written}
              onChange={event => setWritten(event.target.checked)} />
            Письменная обратная связь
          </label>
          <label className="trainer-option-card">
            <input type="checkbox" checked={report} onChange={event => setReport(event.target.checked)} />
            Видеоотчёт о работе
          </label>
        </div>
        {test && <TrainerExamQuestions value={questions} onChange={setQuestions} />}
      </TrainerFormSection>}

      {localError && <p role="alert">{localError}</p>}
      {(auth.phase === "error" || auth.phase === "denied") &&
        <p role="alert">{auth.message}</p>}
      {auth.phase === "success" && <p role="status">
        Шаг создан. <a href="/steps">К списку шагов</a>
      </p>}
      <TrainerFormActions>
        <a className="trainer-form-back" href="/steps">Отмена</a>
        <button type="submit" disabled={auth.phase === "pending" || auth.phase === "success"}>
          {auth.phase === "pending" ? "Сохраняем…" : "Создать шаг"}
        </button>
      </TrainerFormActions>
    </form>
  </TrainerFormPage>;
}
