"use client";
import { useState } from "react";
import { FEED_PHOTO_MIME_TYPES, FEED_LIMITS, type FeedPollEditorDraft, validateFeedPollDraft } from "@gafus/types";
import type { FeedBrowserAsset } from "./upload";
import { SecondaryButton } from "@/shared/components/ui";
import styles from "./FeedPoll.module.css";

export type WebPollImage = FeedBrowserAsset & { previewUri: string; bytes: number };
export type WebFeedPollDraft = FeedPollEditorDraft<WebPollImage>;
export const emptyFeedPoll = (): WebFeedPollDraft => ({
  question: "", options: [{ text: "" }, { text: "" }],
  allowMultiple: false, isQuiz: false, isAnonymous: false,
  hideResults: false, shuffleOptions: false, endDate: null,
});

export function FeedPollComposer({ value, onChange, disabled }: {
  value: WebFeedPollDraft | null;
  onChange: (value: WebFeedPollDraft | null) => void;
  disabled: boolean;
}) {
  const [photoError, setPhotoError] = useState("");
  if (!value) return <SecondaryButton type="button" disabled={disabled} onClick={() => onChange(emptyFeedPoll())}>
    + Добавить опрос
  </SecondaryButton>;
  const update = (next: Partial<WebFeedPollDraft>) => onChange({ ...value, ...next });
  const setOption = (index: number, patch: Partial<WebFeedPollDraft["options"][number]>) =>
    update({ options: value.options.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const release = (option: WebFeedPollDraft["options"][number]) => {
    if (option.imageAsset?.previewUri.startsWith("blob:")) URL.revokeObjectURL(option.imageAsset.previewUri);
  };
  const pickPhoto = (index: number, file: File | undefined) => {
    if (!file) return;
    if (!(FEED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type) ||
        file.size === 0 || file.size > FEED_LIMITS.photoBytes) {
      setPhotoError("Фото должно быть JPG, PNG или WebP размером до 10 МиБ.");
      return;
    }
    setPhotoError("");
    release(value.options[index]!);
    setOption(index, { imageAsset: {
      file, requestId: crypto.randomUUID(), bytes: file.size, previewUri: URL.createObjectURL(file),
    } });
  };
  const warn = validateFeedPollDraft(value);
  return <section className={styles.editor} aria-label="Редактор опроса">
    <div className={styles.heading}>
      <div><strong>Опрос</strong><p>Узнайте мнение других владельцев питомцев</p></div>
      <SecondaryButton type="button" disabled={disabled} onClick={() => { value.options.forEach(release); onChange(null); }}>Убрать</SecondaryButton>
    </div>
    <label className={styles.label}>Вопрос
      <input className={styles.input} disabled={disabled} value={value.question} maxLength={500}
        placeholder="Что вы думаете?" onChange={e => update({ question: e.target.value })} />
    </label>
    <div className={styles.choices}>
      {value.options.map((option, index) => <div className={styles.choiceEdit} key={index}>
        {value.isQuiz && <input type={value.allowMultiple ? "checkbox" : "radio"} name="correct-poll-answer"
          aria-label={`Правильный вариант ${index + 1}`} checked={!!option.isCorrect} disabled={disabled}
          onChange={e => update({ options: value.options.map((item, i) => ({ ...item,
            isCorrect: value.allowMultiple ? (i === index ? e.target.checked : !!item.isCorrect) : i === index,
          })) })} />}
        <input className={styles.input} disabled={disabled} value={option.text} maxLength={200}
          aria-label={`Вариант ответа ${index + 1}`} placeholder={`Вариант ${index + 1}`}
          onChange={e => setOption(index, { text: e.target.value })} />
        {value.options.length > 2 && <button type="button" className={styles.remove}
          disabled={disabled} aria-label={`Удалить вариант ${index + 1}`}
          onClick={() => { release(option); update({ options: value.options.filter((_, i) => i !== index) }); }}>×</button>}
        <label className={styles.photoPicker}>
          {option.imageAsset ? "Заменить фото" : "+ Фото"}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
            aria-label={`Фото варианта ${index + 1}`}
            onChange={e => { pickPhoto(index, e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {option.imageAsset && <div className={styles.photoPreview}>
          <img src={option.imageAsset.previewUri} alt={`Фото варианта ${index + 1}`} />
          <button type="button" disabled={disabled} aria-label={`Убрать фото варианта ${index + 1}`}
            onClick={() => { release(option); setOption(index, { imageAsset: undefined }); }}>×</button>
        </div>}
      </div>)}
      {value.options.length < 10 && <SecondaryButton type="button" disabled={disabled}
        onClick={() => update({ options: [...value.options, { text: "" }] })}>+ Вариант ответа</SecondaryButton>}
    </div>
    <div className={styles.settings}>
      {([
        ["allowMultiple", "Несколько вариантов"],
        ["isQuiz", "Викторина с правильным ответом"],
        ["isAnonymous", "Анонимное голосование"],
        ["hideResults", "Скрывать результаты до завершения"],
        ["shuffleOptions", "Перемешивать варианты"],
      ] as const).map(([key, text]) => <label key={key} className={styles.toggle}>
        <input type="checkbox" checked={!!value[key]} disabled={disabled}
          onChange={e => update({ [key]: e.target.checked,
            ...(key === "isQuiz" && !e.target.checked ? { options: value.options.map(option => ({ ...option, isCorrect: false })) } : {}),
            ...(key === "allowMultiple" && !e.target.checked ? { options: value.options.map((option, i) => ({ ...option,
              isCorrect: i === value.options.findIndex(item => item.isCorrect) })) } : {}),
          })} />{text}
      </label>)}
    </div>
    <label className={styles.label}>Завершить опрос (необязательно)
      <input type="datetime-local" className={styles.input} disabled={disabled}
        value={value.endDate ? toLocal(value.endDate) : ""}
        onChange={e => update({ endDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
    </label>
    {value.isQuiz && <label className={styles.label}>Пояснение после ответа
      <textarea className={styles.input} disabled={disabled} maxLength={2000}
        value={value.explanation ?? ""} placeholder="Почему этот ответ правильный?"
        onChange={e => update({ explanation: e.target.value })} />
    </label>}
    {photoError && <p role="alert" className={styles.hint}>{photoError}</p>}
    {warn && <p className={styles.hint}>{warn}</p>}
  </section>;
}
function toLocal(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
