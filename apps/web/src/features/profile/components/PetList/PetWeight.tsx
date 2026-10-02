"use client";

import { useEffect, useMemo, useState } from "react";
import { useCSRFStore } from "@gafus/csrf";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import { reportClientError } from "@gafus/error-handling";
import { PrimaryButton } from "@/shared/components/ui";
import styles from "./PetWeight.module.css";

type Entry = { id: string; weightKg: number; measuredAt: string };
type WeightData = {
  targetWeightKg: number | null;
  currentWeightKg: number | null;
  entries: Entry[];
};
const formatWeight = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export function PetWeight({ petId, petName }: { petId: string; petName: string }) {
  const fetchToken = useCSRFStore((state) => state.fetchToken);
  const [data, setData] = useState<WeightData | null>(null);
  const [period, setPeriod] = useState<"3m" | "1y" | "all">("1y");
  const [weight, setWeight] = useState("");
  const [when, setWhen] = useState(localDate);
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<"weight" | "goal" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/v1/pets/${encodeURIComponent(petId)}/weight`;

  async function reload() {
    const response = await fetch(base, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.success)
      throw new Error(result.error || "Не удалось загрузить вес");
    setData(result.data);
    setGoal(result.data.targetWeightKg == null ? "" : String(result.data.targetWeightKg));
  }
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [petId]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => {
    if (!data) return [];
    if (period === "all") return data.entries;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (period === "3m" ? 3 : 12));
    return data.entries.filter((entry) => new Date(entry.measuredAt) >= cutoff);
  }, [data, period]);
  const latest = data?.entries.at(-1);
  const first = visible[0];
  const last = visible.at(-1);
  const values = visible.map((entry) => entry.weightKg);
  if (data?.targetWeightKg != null) values.push(data.targetWeightKg);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const padding = Math.max((max - min) * 0.2, 0.5);
  const lo = min - padding;
  const hi = max + padding;
  const x = (entry: Entry) =>
    first && last && first !== last
      ? 22 +
        ((new Date(entry.measuredAt).getTime() - new Date(first.measuredAt).getTime()) /
          Math.max(1, new Date(last.measuredAt).getTime() - new Date(first.measuredAt).getTime())) *
          456
      : 250;
  const y = (value: number) => 178 - ((value - lo) / (hi - lo)) * 150;
  const points = visible.map((entry) => `${x(entry)},${y(entry.weightKg)}`).join(" ");

  async function mutate(path: string, method: "POST" | "PUT" | "DELETE", body?: object) {
    setBusy(true);
    setError("");
    try {
      await fetchToken();
      const csrf = useCSRFStore.getState().token;
      if (!csrf) throw new Error("Не удалось получить защитный токен. Повторите попытку.");
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Не удалось сохранить данные");
      await reload();
      setMode(null);
      setWeight("");
    } catch (e) {
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "PetWeight",
        keys: { operation: method.toLowerCase(), petId },
      });
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-label={`Вес: ${petName}`}>
      <div className={styles.heading}>
        <div className={styles.title}><img src="/images/pet-weight-icon.png" alt="" /><h4>Вес</h4></div>
        {(latest || data?.currentWeightKg != null) && (
          <strong>
            {formatWeight(latest?.weightKg ?? data!.currentWeightKg!)} <small>кг</small>
          </strong>
        )}
      </div>
      <div className={styles.periods} aria-label="Период графика">
        {(
          [
            ["3m", "3 месяца"],
            ["1y", "Год"],
            ["all", "Всё"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className={styles.chart}>
          <svg
            viewBox="0 0 500 200"
            role="img"
            aria-label={`График веса: ${visible.length} измерений`}
            preserveAspectRatio="none"
          >
            {data?.targetWeightKg != null && (
              <>
                <line
                  x1="22"
                  x2="478"
                  y1={y(data.targetWeightKg)}
                  y2={y(data.targetWeightKg)}
                  className={styles.goalLine}
                />
                <text
                  x="26"
                  y={Math.max(16, y(data.targetWeightKg) - 8)}
                  className={styles.goalLabel}
                >
                  Цель {formatWeight(data.targetWeightKg)} кг
                </text>
              </>
            )}
            <line x1="22" x2="478" y1="180" y2="180" className={styles.axis} />
            {visible.length > 1 && <polyline points={points} className={styles.line} />}
            {visible.map((entry, index) => (
              <circle
                key={entry.id}
                cx={x(entry)}
                cy={y(entry.weightKg)}
                r={index === visible.length - 1 ? 6 : 4}
                className={index === visible.length - 1 ? styles.lastPoint : styles.point}
              >
                <title>
                  {formatDate(entry.measuredAt)}: {formatWeight(entry.weightKg)} кг
                </title>
              </circle>
            ))}
          </svg>
          <div className={styles.axisLabels}>
            <span>
              {first &&
                new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric" }).format(
                  new Date(first.measuredAt),
                )}
            </span>
            <span>
              {last &&
                new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric" }).format(
                  new Date(last.measuredAt),
                )}
            </span>
          </div>
        </div>
      ) : (
        <p className={styles.hint}>
          За этот период измерений нет. Запишите вес, чтобы увидеть изменение.
        </p>
      )}
      {data?.targetWeightKg != null && latest && (
        <p className={styles.summary}>
          {latest.weightKg === data.targetWeightKg
            ? "Целевой вес достигнут"
            : `До цели ${formatWeight(Math.abs(latest.weightKg - data.targetWeightKg))} кг · ${latest.weightKg > data.targetWeightKg ? "снижение" : "набор"} веса`}
        </p>
      )}
      <div className={styles.actions}>
        <PrimaryButton onClick={() => setMode(mode === "weight" ? null : "weight")}>
          Записать вес
        </PrimaryButton>
        <button type="button" onClick={() => setMode(mode === "goal" ? null : "goal")}>
          Цель
        </button>
      </div>
      {mode === "weight" && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(base, "POST", {
              weightKg: Number(weight.replace(",", ".")),
              measuredAt: (when === localDate() ? new Date() : new Date(`${when}T12:00:00`)).toISOString(),
            });
          }}
        >
          <label>
            Вес, кг
            <input
              type="number"
              min="0.1"
              max="200"
              step="0.01"
              required
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label>
            Дата
            <input
              type="date"
              required
              max={localDate()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <PrimaryButton type="submit" disabled={busy}>Сохранить</PrimaryButton>
        </form>
      )}
      {mode === "goal" && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(`${base}/target`, "PUT", {
              targetWeightKg: goal ? Number(goal.replace(",", ".")) : null,
            });
          }}
        >
          <label>
            Целевой вес, кг
            <input
              type="number"
              min="0.1"
              max="200"
              step="0.01"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Без цели"
            />
          </label>
          <PrimaryButton type="submit" disabled={busy}>Сохранить цель</PrimaryButton>
          <span>Очистите поле, чтобы убрать цель.</span>
        </form>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!!data?.entries.length && (
        <div className={styles.history}>
          <h5>Измерения</h5>
          {[...data.entries].reverse().map((entry) => (
            <div key={entry.id}>
              <span>{formatDate(entry.measuredAt)}</span>
              <strong>{formatWeight(entry.weightKg)} кг</strong>
              <button
                type="button"
                title="Удалить измерение"
                aria-label={`Удалить измерение от ${formatDate(entry.measuredAt)}`}
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Удалить это измерение?"))
                    void mutate(`${base}/${entry.id}`, "DELETE");
                }}
              >
                <DeleteRoundedIcon fontSize="small" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
