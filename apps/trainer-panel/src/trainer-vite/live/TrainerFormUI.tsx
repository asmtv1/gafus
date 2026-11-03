import { lazy, Suspense, useId, useRef, useState, type ReactNode } from "react";

const TrainerMarkdownPreview = lazy(() => import("./TrainerMarkdownPreview"));

/** Adapted from gafus1's FormPageLayout/FormSection, without Next/MUI/server actions. */
export function TrainerFormPage({
  title, subtitle, children, backHref, backLabel = "Назад к списку",
}: {
  title: string; subtitle?: string; children: ReactNode;
  backHref?: string; backLabel?: string;
}) {
  return <main className="trainer-form-page">
    <header className="trainer-form-header">
      {backHref && <a className="trainer-form-back" href={backHref}>← {backLabel}</a>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
    {children}
  </main>;
}

export function TrainerFormSection({
  title, hint, children, className = "",
}: {
  title: string; hint?: string; children: ReactNode; className?: string;
}) {
  return <section className={"trainer-form-section " + className}>
    <header className="trainer-form-section-heading">
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
    </header>
    <div className="trainer-form-section-content">{children}</div>
  </section>;
}

export function TrainerFormActions({ children }: { children: ReactNode }) {
  return <div className="trainer-form-actions">{children}</div>;
}

/** The three Core-registered survey slugs, matching the pre-refactor selector. */
export const trainerSurveyChoices = [
  { value: "dog-home-alone-initial", label: "Собаке тяжело дома одной — до курса" },
  { value: "dog-home-alone-final", label: "Собаке тяжело дома одной — после курса" },
  { value: "separation-anxiety-screening", label: "Тревога расставания — быстрая диагностика" },
] as const;

/** A real controlled Markdown editor. Preview renders Markdown safely as React
 * nodes (raw user HTML never gets inserted into the DOM). */
export function TrainerMarkdownEditor({
  value, onChange, label = "Описание", disabled = false, required = false,
  rows = 12, placeholder = "Введите текст с поддержкой Markdown",
}: {
  value: string; onChange: (text: string) => void; label?: string;
  disabled?: boolean; required?: boolean; rows?: number; placeholder?: string;
}) {
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  function wrap(before: string, after = before, sample = "текст") {
    const input = editor.current;
    if (!input || disabled) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.slice(start, end) || sample;
    const update = input.value.slice(0, start) + before + selected + after +
      input.value.slice(end);
    onChange(update);
    input.focus();
    // React owns textarea.value. Restore selection after a controlled commit.
    queueMicrotask(() => {
      const current = editor.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }
  return <div className="trainer-markdown">
    <label className="trainer-markdown-label" htmlFor={id}>{label}{required && " *"}</label>
    <div className="trainer-markdown-frame">
      <div className="trainer-markdown-bar" role="toolbar" aria-label={"Форматирование: " + label}>
        <button type="button" title="Заголовок" aria-label="Заголовок"
          disabled={disabled} onClick={() => wrap("## ", "", "Заголовок")}>H₂</button>
        <button type="button" title="Жирный" aria-label="Жирный"
          disabled={disabled} onClick={() => wrap("**") }><strong>Ж</strong></button>
        <button type="button" title="Курсив" aria-label="Курсив"
          disabled={disabled} onClick={() => wrap("*")}><em>К</em></button>
        <button type="button" title="Список" aria-label="Маркированный список"
          disabled={disabled} onClick={() => wrap("- ", "", "Пункт списка")}>☷</button>
        <button type="button" title="Цитата" aria-label="Цитата"
          disabled={disabled} onClick={() => wrap("> ", "", "Цитата")}>❞</button>
        <button type="button" title="Ссылка" aria-label="Вставить ссылку"
          disabled={disabled} onClick={() => wrap("[", "](https://)", "Название ссылки")}>🔗</button>
        <span className="trainer-markdown-spacer" />
        <button type="button" className={preview ? "" : "active"} aria-pressed={!preview}
          onClick={() => setPreview(false)}>Редактор</button>
        <button type="button" className={preview ? "active" : ""} aria-pressed={preview}
          onClick={() => setPreview(true)}>Предпросмотр</button>
      </div>
      <textarea ref={editor} id={id} rows={rows} value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled} required={required} placeholder={placeholder}
        aria-hidden={preview ? true : undefined}
        className={preview ? "trainer-markdown-hidden" : "trainer-markdown-input"} />
      {preview && <div className="trainer-markdown-preview" role="region"
        aria-label={"Предпросмотр: " + label}>
        {value.trim() ? <Suspense fallback={<p role="status">Подготавливаем просмотр…</p>}>
          <TrainerMarkdownPreview content={value} />
        </Suspense> :
          <p className="trainer-muted">Здесь появится предварительный просмотр текста.</p>}
      </div>}
    </div>
    <p className="trainer-form-hint">Поддерживаются заголовки, списки, ссылки и форматирование Markdown.</p>
  </div>;
}

/** Preserves verified image/PDF URLs in the existing Hono write contracts.
 * Uploads are not simulated: a separate signed-upload endpoint is required. */
export function TrainerMediaUrls({
  label, value, onChange, max = 10, kind = "image", disabled = false,
}: {
  label: string; value: string[]; onChange: (urls: string[]) => void;
  max?: number; kind?: "image" | "pdf"; disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  function add() {
    const input = draft.trim();
    try {
      const url = new URL(input);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw Error("INVALID_URL");
      if (value.length >= max || value.includes(input)) throw Error("LIMIT_OR_DUPLICATE");
      onChange([...value, input]);
      setDraft(""); setError("");
    } catch {
      setError("Укажите корректную ссылку. Повторы и превышение лимита запрещены.");
    }
  }
  return <div className="trainer-media-list">
    <label>{label}</label>
    {value.length > 0 && <ul className="trainer-media-items">
      {value.map((url, index) => <li key={url + index}>
        {kind === "image" && <img src={url} alt={"Изображение " + (index + 1)}
          loading="lazy" referrerPolicy="no-referrer" />}
        <a href={url} target="_blank" rel="noreferrer noopener">Файл {index + 1}</a>
        <button type="button" className="trainer-button-subtle" disabled={disabled}
          onClick={() => onChange(value.filter((_, i) => i !== index))}>Убрать</button>
      </li>)}
    </ul>}
    <div className="trainer-inline-actions">
      <input type="url" placeholder={kind === "pdf" ? "https://…/document.pdf" : "https://…/image.webp"}
        value={draft} onChange={event => setDraft(event.target.value)} disabled={disabled || value.length >= max} />
      <button type="button" className="trainer-button-secondary" onClick={add}
        disabled={disabled || !draft.trim() || value.length >= max}>Добавить</button>
    </div>
    <p className="trainer-form-hint">{value.length} из {max}. Только уже загруженные файлы — прямой загрузки в этой форме пока нет.</p>
    {error && <p role="alert" className="trainer-form-error">{error}</p>}
  </div>;
}

export type TrainerQuestion = {
  id: string; question: string; options: string[]; correctAnswer: number; comment?: string;
};
export function TrainerExamQuestions({
  value, onChange, disabled = false,
}: {
  value: TrainerQuestion[]; onChange: (questions: TrainerQuestion[]) => void; disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<TrainerQuestion>) =>
    onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <div className="trainer-exam-questions">
    {value.map((question, index) => <fieldset key={question.id} className="trainer-exam-question">
      <legend>Вопрос {index + 1}</legend>
      <label>Текст вопроса *
        <input required value={question.question} disabled={disabled}
          onChange={event => update(index, { question: event.target.value })} />
      </label>
      <div className="trainer-answers">
        {question.options.map((option, optionIndex) => <div key={optionIndex} className="trainer-answer">
          <input type="radio" name={"correct-" + question.id}
            checked={question.correctAnswer === optionIndex} disabled={disabled}
            aria-label={"Правильный ответ " + (optionIndex + 1)}
            onChange={() => update(index, { correctAnswer: optionIndex })} />
          <input required value={option} disabled={disabled}
            aria-label={"Вариант ответа " + (optionIndex + 1)}
            placeholder={"Вариант " + (optionIndex + 1)}
            onChange={event => update(index, { options: question.options.map(
              (item, i) => i === optionIndex ? event.target.value : item,
            ) })} />
          <button type="button" className="trainer-button-subtle"
            disabled={disabled || question.options.length <= 2} onClick={() => {
              const next = question.options.filter((_, i) => i !== optionIndex);
              update(index, { options: next, correctAnswer:
                question.correctAnswer === optionIndex ? 0 :
                  question.correctAnswer > optionIndex ? question.correctAnswer - 1 : question.correctAnswer });
            }}>Убрать</button>
        </div>)}
      </div>
      <button type="button" className="trainer-button-secondary" disabled={disabled || question.options.length >= 10}
        onClick={() => update(index, { options: [...question.options, ""] })}>+ Вариант ответа</button>
      <label>Комментарий после ответа
        <textarea value={question.comment ?? ""} disabled={disabled}
          maxLength={5000} onChange={event => update(index, { comment: event.target.value })} />
      </label>
      <button type="button" className="trainer-button-danger" disabled={disabled}
        onClick={() => onChange(value.filter((_, i) => i !== index))}>Удалить вопрос</button>
    </fieldset>)}
    <button type="button" className="trainer-button-secondary" disabled={disabled || value.length >= 50}
      onClick={() => onChange([...value, {
        id: "q_" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
        question: "", options: ["", ""], correctAnswer: 0,
      }])}>+ Добавить вопрос</button>
    <p className="trainer-form-hint">Отметьте правильный ответ кружком слева. Минимум два варианта для каждого вопроса.</p>
  </div>;
}
