import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import type { PanelActor } from "./consultationContract";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";

const entrySchema = z
  .object({
    id: z.string(),
    content: z.string(),
    order: z.number(),
    isVisibleToStudent: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
const noteSchema = z
  .object({
    id: z.string(),
    trainerId: z.string(),
    title: z.string().nullable(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    entries: z.array(entrySchema),
    students: z.array(
      z
        .object({
          id: z.string(),
          username: z.string(),
          profile: z
            .object({ fullName: z.string().nullable(), avatarUrl: z.string().nullable() })
            .partial()
            .nullable()
            .optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const pageSchema = z.object({
  success: z.literal(true),
  data: z.object({
    notes: z.array(noteSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().nonnegative(),
    pageSize: z.number().int().positive(),
  }),
});
type Note = z.infer<typeof noteSchema>;
type NotesPage = z.infer<typeof pageSchema>["data"];
type EntryDraft = { content: string; isVisibleToStudent: boolean; order: number };
const emptyEntries = (): EntryDraft[] => [{ content: "", isVisibleToStudent: false, order: 0 }];
const privateCache = (headers: Record<string, string>) => {
  const tokens = (headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  return tokens.includes("private") && tokens.includes("no-store") && !tokens.includes("public");
};

export type TrainerNotesManageTransport = (request: {
  method: "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;

export function TrainerNotesManageRoute(p: {
  pathname: string;
  search?: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enabled?: boolean;
  notesReadTransport?: NotesReadTransport;
  notesManageTransport?: TrainerNotesManageTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const [page, setPage] = useState(0);
  const [studentFilter, setStudentFilter] = useState(
    () => new URLSearchParams(p.search ?? "").get("studentId") ?? "",
  );
  const [state, setState] = useState<{
    kind: "loading" | "ready" | "error" | "denied";
    data?: NotesPage;
  }>({ kind: "loading" });
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [studentIds, setStudentIds] = useState("");
  const [tags, setTags] = useState("");
  const [entries, setEntries] = useState<EntryDraft[]>(emptyEntries);
  const [studentSearch, setStudentSearch] = useState("");
  const [foundStudents, setFoundStudents] = useState<{ id: string; username: string }[]>([]);
  const [studentLookupBusy, setStudentLookupBusy] = useState(false);
  const [studentLabels, setStudentLabels] = useState<Record<string, string>>({});
  const studentLookupRef = useRef<AbortController | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const currentSessionRef = useRef(p.getCurrentSession);
  currentSessionRef.current = p.getCurrentSession;
  const identity = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const current = useCallback(() => {
    const session = currentSessionRef.current?.();
    return (
      !!session &&
      session.actor.id === p.actor.id &&
      session.actor.role === p.actor.role &&
      session.token === p.token &&
      session.authEpoch === p.authEpoch
    );
  }, [p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const allowed =
    !!p.enabled &&
    p.pathname === "/main-panel/notes" &&
    !!p.token &&
    !!p.authEpoch &&
    current() &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role) &&
    !!p.notesReadTransport &&
    !!p.notesManageTransport;
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const generation = generationRef;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generation.current++;
      requestRef.current?.abort();
      studentLookupRef.current?.abort();
    };
  }, [identity]);
  const scope = JSON.stringify([identity, page, studentFilter, refresh]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const generationCounter = generationRef;
    const generation = ++generationCounter.current;
    setState({ kind: "loading" });
    const param = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (studentFilter) param.set("studentId", studentFilter);
    void p.notesReadTransport!("/api/v1/trainer/notes/manage?" + param, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || generation !== generationRef.current || !current()) return;
        if (result.status === 401 || result.status === 403) {
          setState({ kind: "denied" });
          return;
        }
        if (result.status !== 200 || !privateCache(result.headers)) throw Error("INVALID_RESPONSE");
        const data = pageSchema.parse(result.body).data;
        if (data.page !== page || data.pageSize !== 50) throw Error("INVALID_PAGE");
        setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!controller.signal.aborted && generation === generationRef.current && current())
          setState({ kind: "error" });
      });
    return () => {
      controller.abort();
      generationCounter.current++;
    };
  }, [scope, allowed, current, p.notesReadTransport, page, studentFilter, refresh]);

  function resetForm() {
    setEditId(null);
    setTitle("");
    setStudentIds("");
    setTags("");
    setEntries(emptyEntries());
    setStudentSearch("");
    setFoundStudents([]);
    setStudentLabels({});
    setMessage("");
  }
  async function findStudents() {
    const query = studentSearch.trim();
    if (
      !allowed ||
      !current() ||
      busyRef.current ||
      query.length < 2 ||
      query.length > 50 ||
      studentLookupBusy
    )
      return;
    const controller = new AbortController();
    studentLookupRef.current?.abort();
    studentLookupRef.current = controller;
    setStudentLookupBusy(true);
    setFoundStudents([]);
    try {
      const response = await p.notesReadTransport!(
        "/api/v1/trainer/notes/manage/lookup?query=" + encodeURIComponent(query),
        controller.signal,
      );
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status !== 200 || !privateCache(response.headers))
        throw Error("LOOKUP_UNAVAILABLE");
      const result = z
        .object({
          success: z.literal(true),
          data: z.array(z.object({ id: z.string(), username: z.string() })),
        })
        .parse(response.body);
      setFoundStudents(result.data);
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setMessage("Поиск учеников недоступен. Повторите поиск.");
    } finally {
      if (studentLookupRef.current === controller) studentLookupRef.current = null;
      if (mountedRef.current && current()) setStudentLookupBusy(false);
    }
  }
  function addStudent(student: { id: string; username: string }) {
    if (!allowed || !current() || busyRef.current) return;
    setStudentIds((old) =>
      [
        ...new Set([
          ...old
            .split(/[\s,;]+/)
            .map((x) => x.trim())
            .filter(Boolean),
          student.id,
        ]),
      ].join(", "),
    );
    setStudentLabels((old) => ({ ...old, [student.id]: student.username }));
    setFoundStudents([]);
    setStudentSearch("");
  }
  function beginEdit(note: Note) {
    if (busyRef.current || !current()) return;
    setEditId(note.id);
    setTitle(note.title ?? "");
    setStudentIds(note.students.map((x) => x.id).join(", "));
    setStudentLabels(Object.fromEntries(note.students.map((x) => [x.id, x.username])));
    setFoundStudents([]);
    setStudentSearch("");
    setTags(note.tags.join(", "));
    setEntries(
      note.entries
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((x, index) => ({
          order: index,
          content: x.content,
          isVisibleToStudent: x.isVisibleToStudent,
        })),
    );
    setMessage("");
  }
  async function mutate(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) {
    if (!allowed || !current() || busyRef.current || state.kind !== "ready") return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await p.notesManageTransport!({
        method,
        path,
        body,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (!privateCache(result.headers)) throw Error("CACHE");
      if (result.status === 401 || result.status === 403) {
        setState({ kind: "denied" });
        return;
      }
      if (
        (method === "POST" ? result.status !== 201 : result.status !== 200) ||
        !result.body ||
        typeof result.body !== "object" ||
        !("success" in result.body) ||
        result.body.success !== true
      )
        throw Error("FAILED");
      resetForm();
      setMessage("Сохранено на сервере. Список загружен заново.");
      setPage(0);
      setRefresh((x) => x + 1);
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setMessage("Сохранение не подтверждено. Проверьте список перед повторной попыткой.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const students = [
      ...new Set(
        studentIds
          .split(/[\s,;]+/)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ];
    const content = entries.map((x, i) => ({
      order: i,
      content: x.content.trim(),
      isVisibleToStudent: x.isVisibleToStudent,
    }));
    if (
      content.length < 1 ||
      content.some((x) => !x.content || x.content.length > 10000) ||
      (editId === null && !students.length)
    ) {
      setMessage("Нужны ученик и хотя бы одна непустая запись.");
      return;
    }
    const payload = {
      title: title.trim() || null,
      studentIds: students,
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      entries: content,
    };
    void mutate(
      editId ? "PUT" : "POST",
      editId
        ? "/api/v1/trainer/notes/manage/" + encodeURIComponent(editId)
        : "/api/v1/trainer/notes/manage",
      payload,
    );
  }
  function remove(note: Note) {
    if (busyRef.current || !current()) return;
    // Explicit confirmation; never issue the DELETE on a simple list click.
    if (!window.confirm("Удалить заметку «" + (note.title || "Без названия") + "»?")) return;
    void mutate("DELETE", "/api/v1/trainer/notes/manage/" + encodeURIComponent(note.id));
  }
  if (!allowed) return <main role="alert">Заметки недоступны для текущей сессии</main>;
  return (
    <main>
      <h1>Заметки тренера</h1>
      <p>Содержимое заметок доступно только сотрудникам с соответствующими правами.</p>
      <label>
        Фильтр по ID ученика
        <input
          value={studentFilter}
          onChange={(e) => {
            setPage(0);
            setStudentFilter(e.target.value.trim());
          }}
          placeholder="ID ученика"
          disabled={busy}
        />
      </label>
      {state.kind === "loading" && <p role="status">Загрузка заметок…</p>}
      {state.kind === "error" && (
        <p role="alert">
          Не удалось загрузить заметки.
          <button type="button" onClick={() => setRefresh((x) => x + 1)}>
            Повторить
          </button>
        </p>
      )}
      {state.kind === "denied" && <p role="alert">Доступ к заметкам запрещён</p>}
      {state.kind === "ready" && (
        <section aria-label="Список заметок">
          <p>Всего заметок: {state.data?.total ?? 0}</p>
          <ul>
            {state.data?.notes.map((note) => (
              <li key={note.id}>
                <strong>{note.title || "Без названия"}</strong>
                <p>
                  Ученики:{" "}
                  {note.students.map((x) => x.profile?.fullName || x.username).join(", ") || "—"}
                </p>
                <p>Метки: {note.tags.join(", ") || "—"}</p>
                <ol>
                  {note.entries
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((item) => (
                      <li key={item.id}>
                        {item.content}{" "}
                        {item.isVisibleToStudent ? "(видно ученику)" : "(личная запись)"}
                      </li>
                    ))}
                </ol>
                <button type="button" disabled={busy} onClick={() => beginEdit(note)}>
                  Редактировать
                </button>
                <button type="button" disabled={busy} onClick={() => remove(note)}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
          {!state.data?.notes.length && <p>Заметок нет</p>}
          <nav aria-label="Страницы заметок">
            <button
              type="button"
              disabled={page === 0 || busy}
              onClick={() => setPage((x) => Math.max(0, x - 1))}
            >
              Назад
            </button>
            <span> Страница {page + 1} </span>
            <button
              type="button"
              disabled={busy || (page + 1) * 50 >= (state.data?.total ?? 0)}
              onClick={() => setPage((x) => x + 1)}
            >
              Далее
            </button>
          </nav>
        </section>
      )}
      {state.kind === "ready" && (
        <section>
          <h2>{editId ? "Редактировать заметку" : "Новая заметка"}</h2>
          <form onSubmit={submit}>
            <label>
              Заголовок{" "}
              <input
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
              />
            </label>
            <fieldset>
              <legend>Ученики</legend>
              <label>
                Найти по имени пользователя
                <input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Минимум 2 символа"
                  disabled={busy || studentLookupBusy}
                />
              </label>
              <button
                type="button"
                onClick={() => void findStudents()}
                disabled={busy || studentLookupBusy || studentSearch.trim().length < 2}
              >
                {studentLookupBusy ? "Поиск…" : "Найти учеников"}
              </button>
              <ul>
                {foundStudents.map((student) => (
                  <li key={student.id}>
                    {student.username}
                    <button type="button" disabled={busy} onClick={() => addStudent(student)}>
                      Добавить
                    </button>
                  </li>
                ))}
              </ul>
              <p>
                Выбраны:{" "}
                {studentIds
                  .split(/[\s,;]+/)
                  .filter(Boolean)
                  .map((id) => studentLabels[id] ?? id)
                  .join(", ") || "нет"}
              </p>
              <label>
                ID учеников (через запятую)
                <input
                  value={studentIds}
                  onChange={(e) => setStudentIds(e.target.value)}
                  disabled={busy}
                  required
                  placeholder="Можно вставить ID вручную"
                />
              </label>
            </fieldset>
            <label>
              Метки (через запятую)
              <input value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} />
            </label>
            <fieldset>
              <legend>Записи заметки</legend>
              {entries.map((item, index) => (
                <div key={index}>
                  <label>
                    Запись {index + 1}
                    <textarea
                      required
                      maxLength={10000}
                      value={item.content}
                      disabled={busy}
                      onChange={(e) =>
                        setEntries((old) =>
                          old.map((x, i) => (i === index ? { ...x, content: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.isVisibleToStudent}
                      disabled={busy}
                      onChange={(e) =>
                        setEntries((old) =>
                          old.map((x, i) =>
                            i === index ? { ...x, isVisibleToStudent: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    Показывать ученику
                  </label>
                  <button
                    type="button"
                    disabled={busy || entries.length === 1}
                    onClick={() => setEntries((old) => old.filter((_, i) => i !== index))}
                  >
                    Убрать запись
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setEntries((old) => [
                    ...old,
                    { content: "", order: old.length, isVisibleToStudent: false },
                  ])
                }
              >
                Добавить запись
              </button>
            </fieldset>
            <button type="submit" disabled={busy}>
              {busy ? "Сохранение…" : editId ? "Сохранить изменения" : "Создать заметку"}
            </button>
            {editId && (
              <button type="button" disabled={busy} onClick={resetForm}>
                Отмена
              </button>
            )}
          </form>
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
