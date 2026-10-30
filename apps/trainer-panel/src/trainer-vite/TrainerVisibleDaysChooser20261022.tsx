import { createElement, useEffect, useState, type ReactElement } from "react";
import {
  readVisibleDays,
  type VisibleDay,
  type VisibleDaysTransport,
} from "./trainerVisibleDaysRead20261022";
import type { PanelActor } from "./consultationContract";
export function TrainerVisibleDaysChooser20261022(p: {
  actor: PanelActor;
  enabled?: boolean;
  transport?: VisibleDaysTransport;
  isCurrent: () => boolean;
  showEditorLinks?: boolean;
}): ReactElement {
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{ phase: "loading" | "ready" | "error"; rows: VisibleDay[] }>({
    phase: "loading",
    rows: [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState<{ principal: string; value: string }>({principal: "", value: ""});
  // This chooser receives no auth epoch; scope local search only to the exposed actor id/role.
  const principal = JSON.stringify([p.actor.id, p.actor.role]);
  const allowed =
    p.enabled === true &&
    !!p.transport &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role) &&
    p.isCurrent();
  // A disabled chooser or retired actor must not retain a prior local search.
  const query = allowed && search.principal === principal ? search.value : "";
  useEffect(() => {
    setSearch((previous) =>
      allowed && previous.principal === principal ? previous : { principal, value: "" },
    );
  }, [principal, allowed]);
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setState({ phase: "loading", rows: [] });
    setSelected(null);
    if (allowed)
      void readVisibleDays({
        actorId: p.actor.id,
        role: p.actor.role as "TRAINER" | "ADMIN" | "MODERATOR",
        signal: ac.signal,
        isCurrent: () => live && p.isCurrent(),
        transport: p.transport!,
      })
        .then((rows) => {
          if (live && p.isCurrent()) setState({ phase: "ready", rows });
        })
        .catch(() => {
          if (live && p.isCurrent()) setState({ phase: "error", rows: [] });
        });
    return () => {
      live = false;
      ac.abort();
    };
  // Retain existing effect dependencies; adding the unstable props object would replay GETs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.actor.id, p.actor.role, p.transport, allowed, attempt]);
  if (!allowed)
    return createElement(
      "section",
      { "aria-label": "Выбор тренировочного дня" },
      createElement("p", { role: "alert" }, "Список дней недоступен"),
    );
  if (state.phase === "loading")
    return createElement(
      "section",
      { "aria-label": "Выбор тренировочного дня" },
      createElement("p", { role: "status" }, "Загрузка тренировочных дней"),
    );
  if (state.phase === "error")
    return createElement(
      "section",
      { "aria-label": "Выбор тренировочного дня" },
      createElement("p", { role: "alert" }, "Не удалось загрузить дни"),
      createElement(
        "button",
        { type: "button", onClick: () => retry((x) => x + 1) },
        "Повторить чтение дней",
      ),
    );
  const titleQuery = query.trim().toLocaleLowerCase("ru");
  const shown = state.rows.filter((x) => x.title.toLocaleLowerCase("ru").includes(titleQuery));
  const day = shown.find((x) => x.id === selected);
  return createElement(
    "section",
    { "aria-label": "Выбор тренировочного дня", "data-readonly": "true" },
    createElement("h2", null, "Тренировочные дни"),
    createElement(
      "label", null, "Поиск дня по названию",
      createElement("input", {
        type: "search", "aria-label": "Поиск дня по названию", value: query,
        onInput: (event) => setSearch({ principal, value: event.currentTarget.value }),
      }),
    ),
    createElement("p", null, `Загружено дней: ${state.rows.length}; показано: ${shown.length}`),
    query.length > 0
      ? createElement("button", { type: "button", onClick: () => setSearch({ principal, value: "" }) },
          "Очистить поиск")
      : null,
    !state.rows.length
      ? createElement("p", { role: "status" }, "Дней нет")
      : shown.length === 0
        ? createElement("p", { role: "status" }, "По запросу ничего не найдено")
        : createElement(
          "ul",
          null,
          ...shown.map((x) =>
            createElement(
              "li",
              { key: x.id },
              createElement(
                "button",
                {
                  type: "button",
                  onClick: () => setSelected(x.id),
                  "aria-pressed": x.id === selected,
                },
                x.title,
              ),
              createElement("span", null, " — ", x.stepLinks.length, " шагов"),
              p.showEditorLinks && (p.actor.role === "ADMIN" ||
                (p.actor.role === "TRAINER" && x.authorId === p.actor.id))
                ? createElement("a", {
                  href: "/main-panel/days/" + encodeURIComponent(x.id) + "/edit",
                }, " Редактировать")
                : null,
            ),
          ),
        ),
    day
      ? createElement(
          "article",
          { "aria-label": "Подробности выбранного дня" },
          createElement("h3", null, day.title),
          createElement("p", null, day.description),
          createElement("p", null, "Тип: ", day.type.trim() || "Не указано"),
          createElement("p", null, "Оборудование: ", day.equipment.trim() || "Не указано"),
          createElement("h4", null, "Шаги"),
          createElement(
            "ol",
            null,
            ...day.stepLinks.map((l) => createElement("li", { key: l.id }, l.step.title)),
          ),
          createElement("h4", null, "Курсы"),
          createElement(
            "ol",
            null,
            ...day.dayLinks.map((l) => createElement("li", { key: l.id }, l.course.name)),
          ),
        )
      : null,
  );
}
