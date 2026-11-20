import { useEffect, useRef, useState } from "react";
import { requestAdmin } from "./api";

type Choice = {
  key: string;
  title: string;
  revision: number;
  compatible: number;
  excluded: number;
  complete: boolean;
  tested: boolean;
  newer: boolean;
  expanded: boolean;
  recoveryFor: number | null;
};
type Preview = {
  total: number;
  verified: number;
  token: string;
  choices: Choice[];
  active: {
    revision: number;
    title: string;
    public: boolean;
    required: boolean;
    action: string;
  } | null;
};
/** Treat a missing update list as empty, and fail closed for malformed metadata. */
export function normalizeVersionPreview(raw: unknown): Preview {
  if (!raw || typeof raw !== "object") {
    throw new Error("Некорректный ответ реестра OTA.");
  }
  const p = raw as Partial<Preview>;
  if (
    !Number.isInteger(p.total) ||
    !Number.isInteger(p.verified) ||
    typeof p.token !== "string" ||
    p.token.length === 0
  ) {
    throw new Error("Не удалось проверить готовность OTA. Обновите страницу.");
  }
  return {
    total: p.total!,
    verified: p.verified!,
    token: p.token,
    active: p.active ?? null,
    choices: Array.isArray(p.choices) ? p.choices : [],
  };
}

const endpoint = "/api/v1/admin/mobile-ota/version-publication";
export function VersionPublicationForm() {
  const [platform, setPlatform] = useState("ios");
  const [version, setVersion] = useState("1.7.5");
  const [choice, setChoice] = useState("");
  const [required, setRequired] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState("");
  const scope = platform + "/" + version;
  const [loaded, setLoaded] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setLoaded("");
    if (/^\d+\.\d+\.\d+$/.test(version))
      requestAdmin<Preview>(endpoint + "/" + scope, { signal: controller.signal })
        .then((raw) => {
          if (controller.signal.aborted) return;
          const p = normalizeVersionPreview(raw);
          setPreview(p);
          setLoaded(scope);
          setChoice((old) =>
            p.choices.some((c) => c.key === old)
              ? old
              : (p.choices.find((c) => c.recoveryFor === null)?.key ?? ""),
          );
        })
        .catch((e) => {
          if (!controller.signal.aborted) setMessage(e.message);
        });
    return () => controller.abort();
  }, [version, scope, reload]);
  const p = scope === loaded ? preview : null;
  const selected = p?.choices.find((c) => c.key === choice);
  const recovery = p?.choices
    .filter((c) => c.recoveryFor === p.active?.revision && c.complete && c.newer)
    .at(-1);
  const pending = !!p?.active && ["TEST", "STOP"].includes(p.active.action);
  async function publish(action: "TEST" | "ALL" | "RECOVER") {
    if (!p || locked.current) return;
    const audience =
      action === "ALL" || (action === "RECOVER" && p.active?.public)
        ? "всем пользователям"
        : "только admin и asmtv1";
    const target = action === "RECOVER" ? recovery : selected;
    const description = target
      ? target.title + " · ревизия " + target.revision
      : "безопасный пакет ещё не готов";
    if (
      !window.confirm(
        (action === "RECOVER"
          ? "Остановить новые платежи и откатить выпуск"
          : "Выпустить обновление") +
          " для " +
          platform +
          " " +
          version +
          "?\n" +
          description +
          "\nАудитория — " +
          audience +
          "\n" +
          (required || action === "RECOVER"
            ? "Обязательное обновление"
            : "Необязательное обновление"),
      )
    )
      return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      await requestAdmin(endpoint, {
        method: "POST",
        body: {
          platform,
          runtimeVersion: version,
          key: action === "RECOVER" ? null : choice,
          action,
          required,
          token: p.token,
          operationId: crypto.randomUUID(),
        },
      });
      setMessage(
        action === "RECOVER"
          ? "Безопасная ревизия опубликована."
          : "Обновление выпущено " + audience + ".",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось завершить операцию.");
    } finally {
      setLoaded("");
      setReload((v) => v + 1);
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="content-card">
      <h3>Выпуск по версии приложения</h3>
      <div className="filter-toolbar">
        <label>
          Платформа
          <select
            value={platform}
            disabled={busy}
            onChange={(e) => {
              setPlatform(e.target.value);
              setMessage("");
            }}
          >
            <option value="ios">iOS</option>
            <option value="android">Android</option>
          </select>
        </label>
        <label>
          Версия приложения
          <input
            value={version}
            disabled={busy}
            placeholder="1.7.5"
            onChange={(e) => {
              setVersion(e.target.value.trim());
              setMessage("");
            }}
          />
        </label>
        <label>
          OTA-обновление
          <select value={choice} disabled={busy || !p} onChange={(e) => setChoice(e.target.value)}>
            {!p?.choices.some((c) => c.recoveryFor === null) && (
              <option value="">Нет подготовленных обновлений</option>
            )}
            {p?.choices
              .filter((c) => c.recoveryFor === null)
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {c.title} · ревизия {c.revision}
                </option>
              ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={required}
            disabled={busy}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Обязательное обновление
        </label>
      </div>
      {p && (
        <p>
          Зарегистрировано сборок — {p.total}, подтверждено — {p.verified}. Текущая ревизия —{" "}
          {p.active?.revision ?? "нет"}.
          {p.active && " Аудитория — " + (p.active.public ? "все" : "admin и asmtv1") + "."}
          {p.active?.action === "STOP" && " Новые платежи остановлены, ожидается откат."}
        </p>
      )}
      {p && !p.verified && (
        <p role="status">
          Выпуск заблокирован. Требуется подтверждение нативной сборки на устройстве.
        </p>
      )}
      {selected && (
        <p>
          Подпись и файлы подтверждены для {selected.compatible} сборок, исключено —{" "}
          {selected.excluded}.
          {!selected.complete &&
            " Для части сборок отсутствует подтверждение совместимости или полный подписанный пакет."}
        </p>
      )}
      {p?.active && (
        <p>Безопасная ревизия для отката — {recovery?.revision ?? "ещё не подготовлена"}.</p>
      )}
      <div className="filter-toolbar">
        <button
          disabled={
            busy || !selected?.complete || (!selected.expanded && (!selected.newer || pending))
          }
          onClick={() => void publish("TEST")}
        >
          Выпустить тестерам
        </button>
        <button
          disabled={busy || !selected?.tested || !selected.complete}
          onClick={() => void publish("ALL")}
        >
          Выпустить всем
        </button>
        <button
          className="secondary"
          disabled={busy || !p?.active || p.active.action === "RECOVER"}
          onClick={() => void publish("RECOVER")}
        >
          Откатить
        </button>
        <button className="secondary" disabled={busy} onClick={() => setReload((v) => v + 1)}>
          Обновить проверку
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
