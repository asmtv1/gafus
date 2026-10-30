import { createElement, useEffect, useRef, useState, type ReactElement } from "react";
import { readBundleCandidates, type Candidate } from "./tr014BundleCandidatesRead20261022";
import { readDailyBundles, type DailyBundle } from "./tr014DailyBundlesRead20261022";
import type { PanelActor } from "./consultationContract";

export type DailyBundleTransport = (path: string, signal: AbortSignal) => Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
}>;

type ReadState<T> = { scope: string; kind: "loading" | "ready" | "error"; rows: T[] };

export function TrainerDailyBundlesOptInRoute(p: {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enableDailyBundles?: boolean;
  dailyBundleTransport?: DailyBundleTransport;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
}): ReactElement {
  const [bundleRetry, setBundleRetry] = useState(0);
  const [candidateRetry, setCandidateRetry] = useState(0);
  const [bundleSearch, setBundleSearch] = useState({ scope: "", value: "" });
  const [candidateSearch, setCandidateSearch] = useState({ scope: "", value: "" });
  const [candidateState, setCandidateState] = useState<ReadState<Candidate>>({
    scope: "", kind: "loading", rows: [],
  });
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [state, setState] = useState<ReadState<DailyBundle>>({
    scope: "", kind: "loading", rows: [],
  });
  const scope = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const check = () => {
    const n = p.getCurrentSession ? p.getCurrentSession() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!n && n.actor.id === p.actor.id && n.actor.role === p.actor.role &&
      n.token === p.token && n.authEpoch === p.authEpoch;
  };
  const allowed = p.pathname === "/main-panel/daily-course/bundles" &&
    p.enableDailyBundles === true && !!p.token && !!p.dailyBundleTransport &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role) && check();
  // The live session guard always evaluates the current props, without using
  // callback identity as an effect dependency (which would repeat both GETs).
  const checkRef = useRef(check);
  checkRef.current = check;
  const actorId = p.actor.id;
  const role = p.actor.role as "TRAINER" | "ADMIN" | "MODERATOR";

  // A scope/permission transition retires selections and private local search.
  // A manual retry of either independent GET deliberately does not.
  useEffect(() => {
    setSelectedBundle(null);
    setSelectedCandidate(null);
    setBundleSearch(previous => allowed && previous.scope === scope
      ? previous : { scope, value: "" });
    setCandidateSearch(previous => allowed && previous.scope === scope
      ? previous : { scope, value: "" });
  }, [scope, allowed]);

  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setState({ scope, kind: "loading", rows: [] });
    if (allowed) void readDailyBundles({
      enabled: true, role, actorId, signal: ac.signal,
      isCurrent: () => live && checkRef.current(),
      transport: p.dailyBundleTransport!,
    }).then(rows => {
      if (live && checkRef.current()) {
        setState({ scope, kind: "ready", rows });
        setSelectedBundle(id => id && rows.some(row => row.id === id) ? id : null);
      }
    }).catch(() => {
      if (live && checkRef.current()) setState({ scope, kind: "error", rows: [] });
    });
    return () => { live = false; ac.abort(); };
  }, [scope, allowed, bundleRetry, p.dailyBundleTransport, actorId, role]);

  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setCandidateState({ scope, kind: "loading", rows: [] });
    if (allowed) void readBundleCandidates({
      actorId, role, signal: ac.signal,
      isCurrent: () => live && checkRef.current(),
      transport: p.dailyBundleTransport!,
    }).then(rows => {
      if (live && checkRef.current()) {
        setCandidateState({ scope, kind: "ready", rows });
        setSelectedCandidate(id => id && rows.some(row => row.id === id) ? id : null);
      }
    }).catch(() => {
      if (live && checkRef.current()) setCandidateState({ scope, kind: "error", rows: [] });
    });
    return () => { live = false; ac.abort(); };
  }, [scope, allowed, candidateRetry, p.dailyBundleTransport, actorId, role]);

  if (!allowed || !check()) return createElement(
    "main", null, createElement("p", { role: "alert" }, "Связки отключены"),
  );
  const view = state.scope === scope ? state : { kind: "loading" as const, rows: [] };
  const candidates = candidateState.scope === scope ? candidateState : {
    kind: "loading" as const, rows: [],
  };
  const bundleQuery = allowed && bundleSearch.scope === scope ? bundleSearch.value : "";
  const candidateQuery = allowed && candidateSearch.scope === scope ? candidateSearch.value : "";
  const bundleNeedle = bundleQuery.trim().toLocaleLowerCase("ru");
  const candidateNeedle = candidateQuery.trim().toLocaleLowerCase("ru");
  const shownBundles = view.kind === "ready"
    ? view.rows.filter(x => x.title.toLocaleLowerCase("ru").includes(bundleNeedle)) : [];
  const shownCandidates = candidates.kind === "ready"
    ? candidates.rows.filter(x => x.title.toLocaleLowerCase("ru").includes(candidateNeedle)) : [];
  const bundle = shownBundles.find(x => x.id === selectedBundle);
  const candidate = shownCandidates.find(x => x.id === selectedCandidate);

  return createElement("main", { "data-tr014": "read-only" },
    createElement("h1", null, "Связки курса дня"),
    view.kind === "ready" ? createElement("label", null, "Поиск связки по названию",
      createElement("input", {
        type: "search", "aria-label": "Поиск связки по названию", value: bundleQuery,
        onInput: e => setBundleSearch({ scope, value: e.currentTarget.value }),
      })) : null,
    view.kind === "ready" ? createElement("p", null,
      `Загружено связок: ${view.rows.length}; показано: ${shownBundles.length}`) : null,
    view.kind === "ready" && bundleQuery.length > 0 ? createElement("button", {
      type: "button", onClick: () => setBundleSearch({ scope, value: "" }),
    }, "Очистить поиск связок") : null,
    view.kind === "loading"
      ? createElement("p", { role: "status" }, "Загрузка связок")
      : view.kind === "error"
        ? createElement("div", { role: "alert" }, "Не удалось загрузить связки",
          createElement("button", {
            type: "button", "aria-label": "Повторить загрузку связок",
            onClick: () => { if (check()) setBundleRetry(x => x + 1); },
          }, "Повторить загрузку связок"))
        : view.rows.length === 0
          ? createElement("p", { role: "status" }, "Связок нет")
          : shownBundles.length === 0
            ? createElement("p", { role: "status" }, "По запросу ничего не найдено среди связок")
            : createElement("ul", { "aria-label": "Связки курса дня" },
            ...shownBundles.map(x => createElement("li", { key: x.id },
              createElement("button", {
                type: "button", onClick: () => setSelectedBundle(x.id),
              }, x.title),
              createElement("span", null, " — ", x.authorUsername, " — ", x.stepsCount, " шагов")))),
    bundle ? createElement("section", { "aria-label": "Подробности связки" },
      createElement("h2", null, bundle.title),
      createElement("p", null, bundle.description),
      createElement("ol", null, ...bundle.steps.map(x =>
        createElement("li", { key: x.id }, x.title)))) : null,
    createElement("section", {
      "aria-label": "Доступные шаги курса дня", "aria-busy": candidates.kind === "loading",
    },
    createElement("h2", null, "Доступные шаги"),
    candidates.kind === "ready" ? createElement("label", null, "Поиск шага по названию",
      createElement("input", {
        type: "search", "aria-label": "Поиск шага по названию", value: candidateQuery,
        onInput: e => setCandidateSearch({ scope, value: e.currentTarget.value }),
      })) : null,
    candidates.kind === "ready" ? createElement("p", null,
      `Загружено шагов: ${candidates.rows.length}; показано: ${shownCandidates.length}`) : null,
    candidates.kind === "ready" && candidateQuery.length > 0 ? createElement("button", {
      type: "button", onClick: () => setCandidateSearch({ scope, value: "" }),
    }, "Очистить поиск шагов") : null,
    candidates.kind === "loading"
      ? createElement("p", { role: "status" }, "Загрузка шагов")
      : candidates.kind === "error"
        ? createElement("div", { role: "alert" }, "Не удалось загрузить шаги",
          createElement("button", {
            type: "button", "aria-label": "Повторить загрузку шагов",
            onClick: () => { if (check()) setCandidateRetry(x => x + 1); },
          }, "Повторить загрузку шагов"))
        : candidates.rows.length === 0
          ? createElement("p", { role: "status" }, "Шагов нет")
          : shownCandidates.length === 0
            ? createElement("p", { role: "status" }, "По запросу ничего не найдено среди шагов")
            : createElement("ul", null, ...shownCandidates.map(x =>
            createElement("li", { key: x.id }, createElement("button", {
              type: "button", onClick: () => setSelectedCandidate(x.id),
            }, x.title)))),
    candidate ? createElement("article", { "aria-label": "Подробности шага" },
      createElement("h3", null, candidate.title),
      createElement("p", null, candidate.type, " — ",
        candidate.durationSec === null ? "Без длительности" : `${candidate.durationSec} секунд`),
      createElement("p", null, candidate.authorUsername)) : null));
}
