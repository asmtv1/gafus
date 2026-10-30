import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import {
  createOwnReminderAndVerify, changeOwnReminderAndVerify,
  deleteOwnReminderAndVerify, daySelection, listOwnReminders, serializeDays,
} from "./remindersLiveApi";
import {
  dayLabels, type ReminderCreateBody, type TrainingReminder,
} from "./remindersSourceMock";
import page from "../../brand/LegacyRemindersPage.module.css";
import styles from "../../brand/LegacyTrainingReminders.module.css";
import { PrimaryButton, SecondaryButton, CaramelButton, SelectChevron, Loading } from "../../shared/ui";

import "./web1-local-parity.css";
import extra from "./RemindersNextExtras.module.css";
import controls from "./RemindersControls.module.css";
import {
  commonReminderTimeZones, missingReminderTimeZone, otherReminderTimeZones,
} from "./reminderTimezones";
import { NextProfileIcon } from "./NextProfileIcon";

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";
  } catch { return "Europe/Moscow"; }
};
const draft = (): ReminderCreateBody => ({
  name: "", reminderTime: "09:00", reminderDays: null, timezone: zone(),
});
const errorText = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сессия завершена. Войдите снова.";
    if (error.status === 403) return "Нет доступа к напоминаниям.";
    if (error.status === 404) return "Напоминание не найдено.";
    if (error.status === 409) return "Конфликт операции. Проверьте список.";
    if (error.status === 429) return "Слишком много запросов. Повторите позже.";
    if (error.status === 400 || error.status === 422) return "Проверьте параметры напоминания.";
  }
  return error instanceof Error && /^(Название|Время|Дни|Выберите|Максимум)/.test(error.message)
    ? error.message : "Не удалось подтвердить изменение. Проверьте список перед повтором.";
};

function ReminderFields({ value, onChange, disabled }: {
  value: ReminderCreateBody;
  onChange: (next: ReminderCreateBody) => void;
  disabled: boolean;
}) {
  const selected = daySelection(value.reminderDays);
  return <div className={controls.fields}>
    <label className={controls.field}>Название
      <input required maxLength={100} disabled={disabled} value={value.name}
        onChange={e => onChange({ ...value, name: e.target.value })}/>
    </label>
    <label className={controls.field}>Время
      <input type="time" required disabled={disabled} value={value.reminderTime}
        onChange={e => onChange({ ...value, reminderTime: e.target.value })}/>
    </label>
    <fieldset className={controls.daysFieldset} disabled={disabled}>
      <legend>Дни недели <span>(без выбора — каждый день)</span></legend>
      {dayLabels.map((label, i) => {
        const id = String(i + 1);
        return <label key={id} className={controls.dayOption}><input type="checkbox" checked={selected.includes(id)}
          onChange={e => onChange({ ...value,
            reminderDays: serializeDays(e.target.checked
              ? [...selected, id] : selected.filter(day => day !== id)),
          })}/>{label}</label>;
      })}
    </fieldset>
    <label className={controls.field}>Часовой пояс
      <select required disabled={disabled} value={value.timezone}
        onChange={e => onChange({ ...value, timezone: e.target.value })}>
        {missingReminderTimeZone(value.timezone) &&
          <option value={value.timezone}>Сохранённый: {value.timezone}</option>}
        <optgroup label="Часто используемые">
          {commonReminderTimeZones.map(([zone, city]) =>
            <option key={zone} value={zone}>{city} — {zone}</option>)}
        </optgroup>
        {otherReminderTimeZones.length > 0 && <optgroup label="Остальные часовые пояса">
          {otherReminderTimeZones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </optgroup>}
      </select>
    </label>
  </div>;
}

/** One editing surface per reminder: closed card is a read-only summary,
 * opened card has a single buffered form. Only submit sends PUT to Hono/Core.
 * The switch is the one independent immediate enable/disable action. */
function ConnectedReminderRow({row,busy,expanded,onToggleExpanded,onToggle,onDelete,children}:{
  row:TrainingReminder;busy:boolean;expanded:boolean;
  onToggleExpanded():void;
  onToggle():void;
  onDelete():void;
  children:ReactNode;
}) {
  return <div className={`${styles.reminderItem} ${expanded?styles.expanded:""}`}
    data-next-reminder-row data-reminder-id={row.id}>
    <div className={styles.reminderHeader}>
      <label className={styles.switchLabel}>
        <input type="checkbox" className={styles.switchInput} checked={row.enabled}
          disabled={busy || expanded} onChange={onToggle}
          aria-label={`Напоминание ${row.name}: ${row.enabled?"включено":"выключено"}`}/>
        <span className={styles.switchSlider} aria-hidden="true"/>
      </label>
      <span className={controls.reminderName} data-reminder-name>{row.name}</span>
      <span className={styles.timePreview}>{row.reminderTime}</span>
      <button type="button" className={styles.expandButton} disabled={busy}
        aria-label={expanded?"Свернуть":"Развернуть"} aria-expanded={expanded}
        aria-controls={`reminder-edit-${row.id}`}
        onClick={onToggleExpanded}><SelectChevron expanded={expanded}/></button>
      <SecondaryButton variant="red"
        className={[styles.deleteButton,"gafus-inline-red-icon-sm"].join(" ")} disabled={busy}
        aria-label="Удалить" onClick={onDelete}>×</SecondaryButton>
    </div>
    {children}
  </div>;
}

export function RemindersConnectedPage({ ownerId }: { ownerId: string }) {
  const cache = useQueryClient();
  const queryKey = ["reminders", "owner", "live", ownerId] as const;
  const query = useQuery({ queryKey, queryFn: listOwnReminders,
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  const running = useRef(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editor, setEditor] = useState<ReminderCreateBody>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clear = () => { setError(""); setNotice(""); };
  const write = async (action: () => Promise<{
    confirmed: boolean; rows: TrainingReminder[];
  }>, successMessage: string | null = "Сохранено и подтверждено сервером.") => {
    if (running.current) return;
    running.current = true; setBusy(true); clear();
    try {
      const result = await action();
      cache.setQueryData(queryKey, result.rows);
      if (!result.confirmed) {
        setError("Результат не подтверждён. Обновите список перед повтором.");
      } else {
        setNotice(successMessage ?? "");
        setCreating(false); setEditing(null);
      }
    } catch (err) {
      const result = await query.refetch();
      if (result.isError) setError("Не удалось проверить результат. Не повторяйте запись автоматически.");
      else setError(errorText(err));
    } finally { running.current = false; setBusy(false); }
  };
  const create = () => void write(async () => {
    const outcome = await createOwnReminderAndVerify(editor);
    return { confirmed: outcome.state === "confirmed", rows: outcome.rows };
  });
  const save = (original: TrainingReminder) => void write(async () => {
    const changes: TrainingReminder = { ...original, ...editor };
    return changeOwnReminderAndVerify(original, changes);
  }, null);
  const toggle = (row: TrainingReminder) => void write(() =>
    changeOwnReminderAndVerify(row, { ...row, enabled: !row.enabled }), null);
  const remove = (row: TrainingReminder) => {
    if (deleteConfirm !== row.id) return;
    setDeleteConfirm(null);
    void write(() => deleteOwnReminderAndVerify(row.id), "Напоминание удалено");
  };
  const edit = (row: TrainingReminder) => {
    clear(); setCreating(false); setEditing(row.id);
    setEditor({ name: row.name, reminderTime: row.reminderTime,
      reminderDays: row.reminderDays, timezone: row.timezone });
  };
  const rows = query.isSuccess && !query.isFetching ? query.data : [];
  return <section className={`${page.page} next-reminders-page`}
    aria-label="Напоминания о тренировках" data-next-reminders>
    <div className={page.content}>
      <h1 className={page.heading}>Напоминания о тренировках</h1>
      {(query.isPending || query.isFetching) ?
        <div className={styles.container} data-next-reminders-source-layout>
          <Loading message="Загрузка напоминаний…" />
        </div> : <div className={styles.container} data-next-reminders-source-layout>
        <h3 className={styles.title}>
          <NextProfileIcon name="reminders"/> Напоминания о тренировках
        </h3>
        <p className={styles.description}>
          Создайте до 5 напоминаний в разное время (утро, день, вечер и т.д.)
        </p>
      {error && <div role="alert" className={`${styles.alert} ${styles.error}`}>
        {error}<button type="button" className={styles.alertClose}
          aria-label="Закрыть" onClick={()=>setError("")}>×</button>
      </div>}
      {notice && <div role="status" className={`${styles.alert} ${styles.success}`}>
        {notice}<button type="button" className={styles.alertClose}
          aria-label="Закрыть" onClick={()=>setNotice("")}>×</button>
      </div>}
      {query.isError && <div role="alert"><p>{errorText(query.error)}</p>
        <button type="button" className={controls.secondaryButton}
          onClick={() => void query.refetch()}>Повторить загрузку</button>
      </div>}
      {query.isSuccess && !query.isFetching && <>
        {rows.length === 0 && <p role="status" className={extra.srOnly}>
          Напоминаний пока нет.
        </p>}
        <div className={`${styles.remindersList} reminder-list`}>
          {rows.map(row => <ConnectedReminderRow key={row.id} row={row}
            busy={busy || creating || (editing !== null && editing !== row.id)}
            expanded={editing === row.id}
            onToggle={()=>toggle(row)}
            onToggleExpanded={()=>{
              if (editing === row.id) { setEditing(null); clear(); }
              else edit(row);
            }}
            onDelete={()=>{ clear(); setEditing(null); setDeleteConfirm(row.id); }}>
            {deleteConfirm===row.id&&<div role="group" className={controls.confirmPanel}
              aria-label="Подтверждение удаления напоминания">
              <p>Удалить напоминание «{row.name}»?</p>
              <div className={controls.editorActions}>
                <SecondaryButton variant="red" disabled={busy}
                  onClick={()=>remove(row)}>Да, удалить</SecondaryButton>
                <SecondaryButton variant="red" disabled={busy}
                  onClick={()=>setDeleteConfirm(null)}>Не удалять</SecondaryButton>
              </div>
            </div>}
            {editing===row.id&&<form id={`reminder-edit-${row.id}`}
              className={controls.inlineEditor}
              aria-label={`Изменить напоминание «${row.name}»`}
              onSubmit={event=>{event.preventDefault();save(row);}}>
              <ReminderFields value={editor} onChange={setEditor} disabled={busy}/>
              <div className={controls.editorActions}>
                <PrimaryButton type="submit" disabled={busy ||
                  (editor.name.trim() === row.name && editor.reminderTime === row.reminderTime &&
                    editor.reminderDays === row.reminderDays && editor.timezone === row.timezone)}>
                  Сохранить изменения
                </PrimaryButton>
                <SecondaryButton variant="red" disabled={busy}
                  onClick={()=>{ setEditing(null); clear(); }}>Отмена</SecondaryButton>
              </div>
            </form>}
          </ConnectedReminderRow>)}
        </div>
        <div className={controls.toolbar} aria-label="Управление напоминаниями">
          {rows.length < 5 && (creating ?
            <SecondaryButton variant="red" className={controls.addButton}
              aria-expanded={true} aria-controls="reminder-create-form"
              disabled={busy} onClick={()=>{ clear(); setCreating(false); }}>
              Отменить добавление
            </SecondaryButton> :
            <PrimaryButton className={controls.addButton}
              aria-expanded={false} aria-controls="reminder-create-form"
              disabled={busy || editing !== null}
              onClick={()=>{ clear(); setEditor(draft()); setCreating(true); }}>
              + Добавить напоминание ({rows.length}/5)
            </PrimaryButton>)}
          <CaramelButton className={controls.refreshButton}
            disabled={busy || editing !== null || creating}
            onClick={() => { clear(); void query.refetch(); }}>
            Обновить список
          </CaramelButton>
        </div>
        {rows.length >= 5 && <p className={controls.limitMessage}>
          Достигнут лимит: 5 напоминаний.
        </p>}
        {creating && rows.length < 5 && <form id="reminder-create-form"
          className={controls.editorCard} aria-label="Создать напоминание"
          onSubmit={event => { event.preventDefault(); create(); }}>
          <h4 className={controls.editorTitle}>Новое напоминание</h4>
          <ReminderFields value={editor} onChange={setEditor} disabled={busy}/>
          <div className={controls.editorActions}>
            <PrimaryButton type="submit" disabled={busy}>Создать напоминание</PrimaryButton>
            <SecondaryButton variant="red" disabled={busy}
              onClick={() => setCreating(false)}>Отмена</SecondaryButton>
          </div>
        </form>}
      </>}
      <div className={`${styles.infoBox} ${controls.infoBox}`}>
        <strong>ℹ️ Как это работает:</strong> Создайте несколько напоминаний в разное время.
        Мы будем присылать вам дружеские напоминания о тренировках
        в выбранное время и дни.
      </div>
      </div>}
    </div>
  </section>;
}
