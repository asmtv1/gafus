import { useQuery } from "@tanstack/react-query";
import { RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import original from "../../brand/LegacyStudentNotes.module.css";
import { Loading } from "../../shared/ui";
import {NextProfileIcon} from "./NextProfileIcon";
import { getStudentNotes } from "./studentNotesApi";
import {PrimaryButton} from "../../shared/ui";

export const notesDate=(raw:string,withTime=false)=>{
  const date=new Date(raw);
  if(!Number.isFinite(date.getTime()))return "";
  // Next uses date-fns ru `d MMMM yyyy` and `d MMMM yyyy, HH:mm`.
  // Plain Intl.format() appends «г.» and «в» in Russian, causing a visible
  // mismatch. Use localized parts (including genitive month) with the same
  // viewer timezone and reproduce exactly the original date-fns punctuation.
  const parts=new Intl.DateTimeFormat("ru-RU",{
    day:"numeric",month:"long",year:"numeric",
    ...(withTime?{hour:"2-digit",minute:"2-digit",hourCycle:"h23" as const}:{}),
  }).formatToParts(date);
  const get=(type:Intl.DateTimeFormatPartTypes)=>
    parts.find(part=>part.type===type)?.value??"";
  const prefix=`${get("day")} ${get("month")} ${get("year")}`;
  return withTime?`${prefix}, ${get("hour")}:${get("minute")}`:prefix;
};

/** Mounted only after the own profile and current actor pass a fresh GET. */
export function StudentNotesPanel({ ownerId, isCurrent }: {
  ownerId: string;
  isCurrent(): boolean;
}) {
  const notes = useQuery({
    queryKey: ["user", "student-notes", ownerId],
    queryFn: getStudentNotes,
    enabled: isCurrent(),
    retry: false, staleTime: 0, gcTime: 0,
  });
  if (!isCurrent()) return null;
  const error = notes.error;
  const unauthenticated = error instanceof ApiError && error.status === 401;
  const forbidden = error instanceof ApiError && (error.status === 403 || error.status === 404);
  // Even a previously successful cache entry is private and must be hidden
  // during revalidation, failed validation or transport/auth errors.
  const ready = notes.isSuccess && !notes.isFetching;
  const list = ready ? notes.data : undefined;
  return <section aria-label="Заметки тренера"
    className={`${original.container} student-notes next-student-notes`} data-next-student-notes>
    <h2 className={original.title}>
      <NextProfileIcon name="trainer-notes"/> Заметки кинолога
    </h2>
    {(notes.isPending || notes.isFetching) &&
      <Loading message="Загрузка заметок…" />}
    {notes.isError && <div role="alert">
      {/* Original Next renders its error in StudentNotes.module.css .error,
          with a leading «Ошибка:». Do not surface raw Hono/server messages:
          cookie, permission and transport errors must remain sanitized. */}
      <p className={original.error}>Ошибка: {unauthenticated ?
        "Сессия завершена. Войдите снова." :
        forbidden ? "Нет доступа к заметкам тренера." :
          "Не удалось загрузить заметки тренера."}</p>
      {unauthenticated ? <RouteLink to="/login">Войти</RouteLink> :
        !forbidden && <PrimaryButton type="button" onClick={() => void notes.refetch()}>
          Повторить загрузку заметок
        </PrimaryButton>}
    </div>}
    {list?.length === 0 && <>
      <div style={{textAlign:"center"}}><NextProfileIcon name="notes-empty" size={64}/></div>
      <p className={original.empty}>Пока нет заметок от кинолога</p>
    </>}
    {list && list.length > 0 && <div className={`${original.notesList} student-notes-list`}>
      {list.map(note => <article key={note.id} data-note-id={note.id}
        className={original.noteCard}>
        {note.title && <h3 className={original.noteTitle}>{note.title}</h3>}
        <div className={original.noteMeta}>
          <span className={original.trainerInfo}>Кинолог: {note.trainerName}</span>
          <span className={original.noteDate}>{notesDate(note.createdAt)}</span>
        </div>
        <div className={original.entries}>
          {note.entries.map(item => <div className={original.entry} key={item.id}>
            <div className={original.entryContent}>{item.content}</div>
            <div className={original.entryMeta}>
              <span className={original.entryDate}>
                {notesDate(item.createdAt,true)}
                {new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime() &&
                  <> • Изменено: {notesDate(item.updatedAt,true)}</>}
              </span>
            </div>
          </div>)}
        </div>
      </article>)}
    </div>}
  </section>;
}
