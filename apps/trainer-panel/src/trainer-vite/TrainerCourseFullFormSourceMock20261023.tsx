/** Dormant free/public CourseForm: no live fetch or Core writer. */
import { createElement, useEffect, useRef, useState, type ReactElement } from "react";
import type { PanelActor } from "./consultationContract";
import type { VisibleDay } from "./trainerVisibleDaysRead20261022";
import { readVisibleDays } from "./trainerVisibleDaysRead20261022";
import type { VersionedCourseEditorSnapshot } from "./trainerCourseDraftReadContract";
import {
  mockCreateCourse,
  mockReadEditorSnapshot,
  mockUpdateCourse,
  type CourseFormCreateBody,
  type CourseFormSourceMockTransport,
} from "./trainerCourseFullFormSourceMockTransport20261023";
const safeId = /^[A-Za-z0-9_-]{1,128}$/;
const levels = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;
type Level = (typeof levels)[number];
type Fields = {
  name: string;
  shortDesc: string;
  description: string;
  guideContent: string;
  duration: string;
  equipment: string;
  trainingLevel: Level;
  showInProfile: boolean;
  isPersonalized: boolean;
  trainingDays: string[];
};
type Phase =
  | "loading"
  | "ready"
  | "conflict"
  | "review"
  | "unknown"
  | "denied"
  | "error"
  | "created"
  | "saved"
  | "unverified";
const blank: Fields = {
  name: "",
  shortDesc: "",
  description: "",
  guideContent: "",
  duration: "",
  equipment: "",
  trainingLevel: "BEGINNER",
  showInProfile: true,
  isPersonalized: false,
  trainingDays: [],
};
const eligible = (s: VersionedCourseEditorSnapshot) =>
  !s.isPrivate && !s.isPaid && s.logoImg === "" && s.videoUrl === null && s.access.length === 0;
const fromSnapshot = (s: VersionedCourseEditorSnapshot): Fields => ({
  name: s.name,
  shortDesc: s.shortDesc,
  description: s.description,
  guideContent: s.guideContent ?? "",
  duration: s.duration,
  equipment: s.equipment,
  trainingLevel: s.trainingLevel,
  showInProfile: s.showInProfile,
  isPersonalized: s.isPersonalized,
  trainingDays: s.dayLinks.map((link) => link.dayId),
});
function validate(f: Fields, days: VisibleDay[]): string | null {
  if (!f.name.trim() || f.name.length > 500) return "Название: от 1 до 500 символов";
  if (!f.duration.trim() || f.duration.length > 100)
    return "Продолжительность: от 1 до 100 символов";
  if (f.shortDesc.length > 2000 || f.guideContent.length > 200000 || f.equipment.length > 1000)
    return "Превышена длина поля";
  if (!levels.includes(f.trainingLevel)) return "Некорректный уровень";
  if (f.trainingDays.some((id) => !days.some((d) => d.id === id)))
    return "Выбранный день больше недоступен";
  return null;
}
const body = (f: Fields): CourseFormCreateBody => ({
  name: f.name,
  shortDesc: f.shortDesc,
  description: f.description,
  guideContent: f.guideContent || null,
  duration: f.duration,
  equipment: f.equipment,
  trainingLevel: f.trainingLevel,
  showInProfile: f.showInProfile,
  isPersonalized: f.isPersonalized,
  trainingDays: [...f.trainingDays],
  isPublic: true,
  isPaid: false,
  logoImg: "",
  videoUrl: null,
  allowedUsers: [],
});
export type CourseFormMockProps = {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
  enabled?: boolean;
  transport?: CourseFormSourceMockTransport;
};
export function TrainerCourseFullFormSourceMock20261023(p: CourseFormMockProps): ReactElement {
  const create = p.pathname === "/main-panel/courses/new";
  const courseId =
    /^\/main-panel\/courses\/([A-Za-z0-9_-]{1,128})\/edit\/?$/.exec(p.pathname)?.[1] ?? null;
  const identity = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname]);
  const [fields, setFields] = useState<Fields>(blank);
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<VersionedCourseEditorSnapshot | null>(null);
  const [ackId, setAckId] = useState<string | null>(null);
  const [available, setAvailable] = useState<VisibleDay[]>([]);
  const [daysReady, setDaysReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const pending = useRef<{ identity: string } | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const verified = () => {
    const now = p.getCurrentSession
      ? p.getCurrentSession()
      : { actor: p.actor, token: p.token, authEpoch: p.authEpoch };
    return (
      p.enabled === true &&
      !!p.transport &&
      !!p.token &&
      !!p.authEpoch &&
      safeId.test(p.actor.id) &&
      (p.actor.role === "TRAINER" || p.actor.role === "ADMIN") &&
      !!now &&
      now.actor.id === p.actor.id &&
      now.actor.role === p.actor.role &&
      now.token === p.token &&
      now.authEpoch === p.authEpoch &&
      (create || !!courseId)
    );
  };
  const allowed = verified();
  const take = () => {
    const ac = new AbortController();
    controllers.current.add(ac);
    return ac;
  };
  const finish = (ac: AbortController) => {
    controllers.current.delete(ac);
  };
  useEffect(() => {
    const serialRef = serial;
    const n = ++serialRef.current;
    const owned = controllers.current;
    pending.current = null;
    setFields(blank);
    setNotice("");
    setVersion(null);
    setSnapshot(null);
    setAckId(null);
    setAvailable([]);
    setDaysReady(false);
    setBusy(false);
    setPhase("loading");
    if (allowed && p.transport) {
      const ac = new AbortController();
      owned.add(ac);
      const current = () => n === serial.current && verified();
      const days = readVisibleDays({
        actorId: p.actor.id,
        role: p.actor.role as "TRAINER" | "ADMIN",
        signal: ac.signal,
        isCurrent: current,
        transport: (path, signal) => p.transport!({ path, method: "GET", signal }),
      })
        .then((items) => {
          if (current()) {
            setAvailable(items);
            setDaysReady(true);
          }
        })
        .catch(() => {
          if (current()) {
            setDaysReady(false);
            setNotice("Не удалось загрузить доступные дни");
          }
        });
      const read =
        create || !courseId
          ? Promise.resolve()
          : mockReadEditorSnapshot({
              transport: p.transport,
              courseId,
              signal: ac.signal,
              isCurrent: current,
            })
              .then((s) => {
                if (!current()) return;
                if (!eligible(s)) {
                  setPhase("denied");
                  return;
                }
                setSnapshot(s);
                setVersion(s.version);
                setFields(fromSnapshot(s));
                setPhase("ready");
              })
              .catch(() => {
                if (current()) setPhase("error");
              });
      if (create) setPhase("ready");
      void Promise.allSettled([days, read]).finally(() => owned.delete(ac));
    }
    return () => {
      serialRef.current++;
      for (const ac of owned) ac.abort();
      owned.clear();
      pending.current = null;
    };
    // Explicitly keyed mock route; no default write entry is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, allowed, p.transport]);
  const setText = (
    key: "name" | "shortDesc" | "description" | "guideContent" | "duration" | "equipment",
    value: string,
  ) => setFields((f) => ({ ...f, [key]: value }));
  const updateDays = (fn: (ids: string[]) => string[]) =>
    setFields((f) => ({ ...f, trainingDays: fn(f.trainingDays) }));
  async function save(): Promise<void> {
    if (
      !allowed ||
      !p.transport ||
      pending.current?.identity === identity ||
      phase !== "ready" ||
      !daysReady ||
      (!create && (!courseId || version === null || !snapshot))
    )
      return;
    const error = validate(fields, available);
    if (error) {
      setNotice(error);
      return;
    }
    const attempt = { identity };
    pending.current = attempt;
    setBusy(true);
    setNotice("");
    const ac = take();
    const n = serial.current;
    const current = () => serial.current === n && verified() && pending.current === attempt;
    const payload = body(fields);
    try {
      const result = create
        ? await mockCreateCourse({
            transport: p.transport,
            body: payload,
            signal: ac.signal,
            isCurrent: current,
          }).then((r) => ({
            kind: r.kind,
            data: r.kind === "success" ? { id: r.data.id, version: null } : null,
          }))
        : await mockUpdateCourse({
            transport: p.transport,
            courseId: courseId!,
            body: { ...payload, expectedVersion: version! },
            signal: ac.signal,
            isCurrent: current,
          }).then((r) => ({
            kind: r.kind,
            data: r.kind === "success" ? { id: r.data.id, version: r.data.version } : null,
          }));
      if (!current()) return;
      if (result.kind === "stale") {
        setVersion(null);
        setPhase("conflict");
        setNotice("Версия курса устарела. Ввод сохранён.");
        return;
      }
      if (result.kind === "invalid") {
        setNotice("Некорректные поля курса. Проверьте значения.");
        return;
      }
      if (result.kind === "denied") {
        setPhase("denied");
        setNotice("Операция недоступна.");
        return;
      }
      if (!result.data) {
        setPhase("unknown");
        setNotice(
          "Не удалось подтвердить сохранение. Не отправляйте повторно, проверьте состояние курса.",
        );
        return;
      }
      const { id, version: ackVersion } = result.data;
      setAckId(id);
      try {
        const fresh = await mockReadEditorSnapshot({
          transport: p.transport,
          courseId: id,
          signal: ac.signal,
          isCurrent: current,
        });
        if (!current()) return;
        if (!eligible(fresh) || (!create && ackVersion !== null && fresh.version < ackVersion)) {
          setPhase("unverified");
          setNotice("Ответ записи получен, но свежий снимок требует проверки.");
          return;
        }
        setSnapshot(fresh);
        setVersion(fresh.version);
        if (!create && ackVersion !== null && fresh.version > ackVersion) {
          setPhase("review");
          setNotice("Курс изменился после сохранения. Сверьте новый снимок.");
          return;
        }
        setPhase(create ? "created" : "saved");
        setNotice(create ? "Курс создан и проверен." : "Изменения сохранены и проверены.");
      } catch {
        if (current()) {
          setPhase("unverified");
          setNotice(
            "Запись подтверждена, но проверка курса не завершена. Повторите только чтение.",
          );
        }
      }
    } catch {
      if (current()) {
        setPhase("unknown");
        setNotice(
          "Не удалось подтвердить сохранение. Не отправляйте повторно, проверьте состояние курса.",
        );
      }
    } finally {
      finish(ac);
      if (pending.current === attempt) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  async function reread(): Promise<void> {
    if (
      !allowed ||
      !p.transport ||
      pending.current?.identity === identity ||
      !["conflict", "unknown", "unverified"].includes(phase)
    )
      return;
    const id = ackId ?? courseId;
    if (!id || !safeId.test(id)) return;
    const request = { identity };
    pending.current = request;
    setBusy(true);
    const ac = take();
    const n = serial.current;
    const current = () => serial.current === n && verified() && pending.current === request;
    try {
      const fresh = await mockReadEditorSnapshot({
        transport: p.transport,
        courseId: id,
        signal: ac.signal,
        isCurrent: current,
      });
      if (!current()) return;
      if (!eligible(fresh)) {
        setPhase("denied");
        return;
      }
      setSnapshot(fresh);
      if (phase === "unknown")
        setNotice(
          "Снимок получен; исход предыдущей записи неоднозначен. Повторная отправка заблокирована.",
        );
      else if (phase === "unverified" && create) {
        setPhase("created");
        setNotice("Курс найден и проверен.");
      } else if (phase === "unverified") {
        setPhase("review");
        setNotice("Сверьте серверный снимок после записи.");
      } else {
        setPhase("review");
        setNotice("Сравните серверный снимок с вашим несохранённым вводом.");
      }
    } catch {
      if (current()) setNotice("Не удалось перечитать снимок. Повторная запись заблокирована.");
    } finally {
      finish(ac);
      if (pending.current === request) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  function confirm(): void {
    if (!allowed || phase !== "review" || !snapshot || busy || create || ackId) return;
    setVersion(snapshot.version);
    setPhase("ready");
    setNotice("Новая версия подтверждена. Сохранение выполняется только вручную.");
  }
  const e = createElement;
  if (!allowed)
    return e("main", { role: "alert" }, "Полная форма выключена или доступ не подтверждён");
  const submit = phase === "ready" && !busy && daysReady;
  const textareaFields = (
    [
      ["name", "Название курса"],
      ["shortDesc", "Краткое описание"],
      ["description", "Полное описание"],
      ["guideContent", "Текст мини-гайда"],
      ["duration", "Продолжительность"],
      ["equipment", "Оборудование"],
    ] as const
  ).map(([key, label]) =>
    e(
      "label",
      { key },
      label,
      e("textarea", {
        "aria-label": label,
        value: fields[key],
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          setText(key, event.target.value),
      }),
    ),
  );
  const level = e(
    "label",
    null,
    "Уровень сложности",
    e(
      "select",
      {
        "aria-label": "Уровень сложности",
        value: fields.trainingLevel,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          setFields((f) => ({
            ...f,
            trainingLevel: event.target.value as Level,
          })),
      },
      ...levels.map((value) => e("option", { key: value, value }, value)),
    ),
  );
  const setting = (field: "showInProfile" | "isPersonalized", label: string) =>
    e(
      "label",
      { key: field },
      e("input", {
        type: "checkbox",
        checked: fields[field],
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          setFields((f) => ({
            ...f,
            [field]: event.target.checked,
          })),
      }),
      label,
    );
  const dayPicker = e(
    "section",
    { "aria-label": "Тренировочные дни" },
    e("h2", null, "Тренировочные дни"),
    !daysReady
      ? e("p", { role: "status" }, "Доступные дни не загружены")
      : e(
          "ul",
          { "aria-label": "Доступные дни" },
          ...available.map((day) =>
            e(
              "li",
              { key: day.id },
              day.title,
              e(
                "button",
                { type: "button", onClick: () => updateDays((ids) => [...ids, day.id]) },
                `Добавить ${day.title}`,
              ),
            ),
          ),
        ),
    e(
      "ol",
      { "aria-label": "Выбранные дни" },
      ...fields.trainingDays.map((id, index) =>
        e(
          "li",
          { key: `${id}-${index}` },
          available.find((day) => day.id === id)?.title ?? "Недоступный день",
          e(
            "button",
            {
              type: "button",
              "aria-label": `Удалить день ${index + 1}`,
              onClick: () => updateDays((ids) => ids.filter((_, i) => i !== index)),
            },
            "Удалить",
          ),
          e(
            "button",
            {
              type: "button",
              "aria-label": `Выше день ${index + 1}`,
              disabled: index === 0,
              onClick: () =>
                updateDays((ids) => {
                  const next = [...ids];
                  [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                  return next;
                }),
            },
            "Выше",
          ),
          e(
            "button",
            {
              type: "button",
              "aria-label": `Ниже день ${index + 1}`,
              disabled: index === fields.trainingDays.length - 1,
              onClick: () =>
                updateDays((ids) => {
                  const next = [...ids];
                  [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                  return next;
                }),
            },
            "Ниже",
          ),
        ),
      ),
    ),
  );
  return e(
    "main",
    { "data-tr012-fullform": "mock-only" },
    e("h1", null, create ? "Создание курса" : "Редактирование курса"),
    e("nav", null, e("a", { href: "/main-panel/courses" }, "К курсам")),
    e("p", null, "Бесплатный публичный курс — без медиа"),
    phase === "loading" ? e("p", { role: "status" }, "Загрузка курса") : null,
    notice ? e("p", { role: "alert" }, notice) : null,
    phase === "denied" ? e("p", { role: "alert" }, "Курс или операция недоступны.") : null,
    phase === "error" ? e("p", { role: "alert" }, "Не удалось получить снимок курса.") : null,
    snapshot && ["review", "unknown", "saved", "created", "unverified"].includes(phase)
      ? e(
          "section",
          { "aria-label": "Сверка серверного снимка" },
          e("p", null, `На сервере: ${snapshot.name}. Версия: ${snapshot.version}`),
          e("p", null, "Ваши поля сохранены локально для сверки."),
        )
      : null,
    ackId ? e("p", null, `Подтверждён ID курса: ${ackId}`) : null,
    e(
      "form",
      {
        onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void save();
        },
      },
      ...textareaFields,
      level,
      setting("showInProfile", "Показывать в профиле"),
      setting("isPersonalized", "Персонализированный"),
      dayPicker,
      e(
        "button",
        { type: "submit", disabled: !submit },
        create ? "Создать курс" : "Сохранить изменения",
      ),
    ),
    ["conflict", "unknown", "unverified"].includes(phase) && (ackId || courseId)
      ? e(
          "button",
          { type: "button", disabled: busy, onClick: () => void reread() },
          "Перечитать снимок",
        )
      : null,
    phase === "review" && !ackId && !create
      ? e(
          "button",
          { type: "button", onClick: confirm },
          "Сверил изменения — использовать новую версию",
        )
      : null,
  );
}
