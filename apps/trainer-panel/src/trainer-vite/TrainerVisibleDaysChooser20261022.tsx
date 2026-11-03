import { createElement, useEffect, useState, type ReactElement } from "react";
import {
  readVisibleDays,
  type VisibleDay,
  type VisibleDaysTransport,
} from "./trainerVisibleDaysRead20261022";
import type { PanelActor } from "./consultationContract";
import type { TrainerContentWriteTransport } from "./TrainerContentEditorRoute";
import { TrainerDaysLibraryView } from "./live/TrainerDaysLibraryView";
export function TrainerVisibleDaysChooser20261022(p: {
  actor: PanelActor;
  enabled?: boolean;
  transport?: VisibleDaysTransport;
  isCurrent: () => boolean;
  showEditorLinks?: boolean;
  writeTransport?: TrainerContentWriteTransport;
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
  return createElement(TrainerDaysLibraryView, {
    key: principal, actor: p.actor, rows: state.rows,
    search: query, onSearch: (value: string) => setSearch({ principal, value }),
    selected, onSelect: setSelected,
    showEditorLinks: p.showEditorLinks,
    write: p.writeTransport,
    transport: p.transport!, isCurrent: p.isCurrent,
    onRefresh: () => retry(x => x + 1),
  });
}
