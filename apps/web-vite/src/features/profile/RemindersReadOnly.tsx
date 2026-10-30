import { Loading } from "../../shared/ui";
import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import {ApiError,apiRequest} from "../../shared/api/client";
import {RouteLink} from "../../shared/router/location";
import {projectReminders,dayLabels,type TrainingReminder} from "./remindersSourceMock";
import page from "../../brand/LegacyRemindersPage.module.css";
import original from "../../brand/LegacyTrainingReminders.module.css";
import { PrimaryButton, SelectChevron } from "../../shared/ui";

/** Next TrainingReminders.ReminderItem visual structure, with read-only
 * controls. Expanding the details is purely local and does not mutate Hono.
 */
function ReadonlyReminderRow({row,days}:{row:TrainingReminder;days:string}){
  const [expanded,setExpanded]=useState(false);
  return <li className={`${original.reminderItem} ${expanded?original.expanded:""} next-reminder-readonly`}>
    <div className={original.reminderHeader}>
      <label className={original.switchLabel} title="Изменение напоминаний пока недоступно">
        <input className={original.switchInput} type="checkbox" checked={row.enabled}
          onChange={()=>undefined} disabled aria-label={`Напоминание ${row.name}: ${row.enabled?"включено":"выключено"}`}/>
        <span className={original.switchSlider} aria-hidden="true"/>
      </label>
      <input className={original.nameInput} type="text" value={row.name}
        aria-label="Название напоминания" readOnly/>
      <span className={original.timePreview}>{row.reminderTime}</span>
      <button type="button" className={original.expandButton}
        aria-label={expanded?"Свернуть детали":"Развернуть детали"} aria-expanded={expanded}
        onClick={()=>setExpanded(!expanded)}><SelectChevron expanded={expanded}/></button>
    </div>
    <p className="next-reminder-readonly-status">{row.enabled?"Включено":"Выключено"}</p>
    {expanded&&<div className={original.reminderDetails}>
      <div className={original.settingGroup}>
        <span className={original.label}>Время</span>
        <span className={original.timePreview}>{row.reminderTime}</span>
      </div>
      <div className={original.settingGroup}>
        <span className={original.label}>Дни недели</span>
        <span>{days}</span>
      </div>
      <div className={original.settingGroup}>
        <span className={original.label}>Часовой пояс</span>
        <span>{row.timezone}</span>
      </div>
    </div>}
  </li>;
}

/** WEB-URL-046: current Hono owner GET /api/v1/reminders, never an action.
 * Core selects only {userId, type:TRAINING_REMINDER}; the canonical route
 * displays server times WITH their IANA timezone. No local timezone shift.
 * All creation, toggles, push/SW, V2 journal and deletion remain unmounted.
 */
export function RemindersReadOnly({ownerId}:{ownerId:string}){
  const query=useQuery<TrainingReminder[]>({
    queryKey:["reminders","owner","read",ownerId],
    queryFn:async()=>projectReminders(await apiRequest<unknown>(
      "/api/v1/reminders",{method:"GET",browserAuth:true,expectedStatus:200})),
    enabled:!!ownerId,retry:false,gcTime:0,staleTime:0,
    refetchOnWindowFocus:false,
  });
  const ready=query.isSuccess&&!query.isFetching;
  const rows=ready?query.data:[];
  const unauthorized=query.error instanceof ApiError&&query.error.status===401;
  const forbidden=query.error instanceof ApiError&&query.error.status===403;
  const dateLabels=(row:TrainingReminder)=>row.reminderDays===null?
    "Каждый день":row.reminderDays.split(",").map(x=>dayLabels[Number(x)-1]).join(", ");
  return <section className={`${page.page} reminders-readonly next-reminders-page`}
    aria-label="Напоминания о тренировках" data-next-reminders>
    <div className={page.content}>
    <h1 className={page.heading}>Напоминания о тренировках</h1>
    <div className={original.container} data-next-reminders-source-layout>
      <h2 className={original.title}>◷ Напоминания о тренировках</h2>
      <p className={original.description}>
        Ваши напоминания о занятиях. Время указано в выбранном часовом поясе.
      </p>
    {(query.isPending||query.isFetching)&&
      <Loading message="Загружаем напоминания…" />}
    {query.isError&&<div role="alert" className="empty-state">
      <p>{unauthorized?"Сессия завершена. Войдите снова.":
        forbidden?"Нет доступа к напоминаниям.":
          "Не удалось загрузить напоминания."}</p>
      {unauthorized?<RouteLink to="/login">Войти</RouteLink>:
        !forbidden&&<PrimaryButton type="button" onClick={()=>void query.refetch()}>
          Повторить чтение
        </PrimaryButton>}
    </div>}
    {ready&&rows.length===0&&
      <p role="status" className="empty-state">Напоминаний пока нет.</p>}
    {ready&&rows.length>0&&<ul className={`${original.remindersList} reminder-list`}>
      {rows.map(row=><ReadonlyReminderRow key={row.id} row={row} days={dateLabels(row)}/>)}
    </ul>}
    <div className={original.infoBox}>
      <strong>Как это работает:</strong> Напоминания помогают соблюдать расписание тренировок.
      Изменение расписания здесь пока недоступно.
    </div>
    </div>
    </div>
  </section>;
}
