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
  checkout: boolean;
  nativeIds: string[];
  recoveryFor: number | null;
  publicAppStoreReady: boolean;
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
    key: string | null;
    nativeIds: string[];
  } | null;
};
/** Keep the UI conservative. Backend revalidates this with an explicit
 * production approval flag inside the publication transaction. */
export function hasSignedPublicCheckoutRecovery(selected: Choice, choices: readonly Choice[]): boolean {
  if (!selected.checkout || !selected.complete || !selected.publicAppStoreReady ||
      selected.nativeIds.length===0) return false;
  const natives = new Set(selected.nativeIds);
  if (natives.size!==selected.nativeIds.length) return false;
  return choices.some((c) => c.recoveryFor===selected.revision && !c.checkout &&
    c.complete && c.newer && c.nativeIds.length===natives.size &&
    c.nativeIds.every((id)=>natives.has(id)));
}
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
type NativeBuild = {
  id: string;
  platform: string;
  runtimeVersion: string;
  buildNumber: string;
  distribution: string;
  environment: string;
  channel: string;
  verified: boolean;
};

export function VersionPublicationForm({ nativeReleases }: { nativeReleases: NativeBuild[] }) {
  const [platform, setPlatform] = useState("ios");
  const [nativeId, setNativeId] = useState("");
  const builds = nativeReleases.filter(
    (build) =>
      build.platform === platform &&
      build.environment === "production" &&
      build.channel === "production" &&
      build.verified,
  );
  const native = builds.find((build) => build.id === nativeId);
  const version = native?.runtimeVersion ?? "";
  const [choice, setChoice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState("");
  const scope = platform + "/" + version;
  const selection = scope + "/" + nativeId;
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
          setLoaded(selection);
          const choices = p.choices.filter(
            (c) =>
              (c.recoveryFor === null || c.key === p.active?.key) &&
              c.nativeIds?.includes(nativeId),
          );
          setChoice((old) =>
            choices.some((c) => c.key === old)
              ? old
              : (choices.find((c) => c.key === p.active?.key)?.key ?? choices[0]?.key ?? ""),
          );
        })
        .catch((e) => {
          if (!controller.signal.aborted) setMessage(e.message);
        });
    return () => controller.abort();
  }, [version, scope, selection, nativeId, reload]);
  const p = selection === loaded ? preview : null;
  const choices =
    p?.choices.filter(
      (c) => (c.recoveryFor === null || c.key === p.active?.key) && c.nativeIds?.includes(nativeId),
    ) ?? [];
  const selected = choices.find((c) => c.key === choice);
  const activeContainsBuild =
    !!selected && p?.active?.key === selected.key && p.active.nativeIds?.includes(nativeId);
  const checkoutLabel = (c: Choice) =>
    !c.checkout
      ? "Обычная оплата"
      : platform === "ios" && version === "1.7.5"
        ? "ЮKassa — тестовый / публичный профиль"
        : "Тестовая ЮKassa";
  const recovery = p?.choices
    .filter((c) => c.recoveryFor === p.active?.revision && c.complete && c.newer)
    .at(-1);
  const pending = !!p?.active && ["TEST", "STOP"].includes(p.active.action);
  async function submit(action: "TEST" | "ALL" | "RECOVER" | "MANDATORY", required = false) {
    if (!p || locked.current) return;
    const audience =
      action === "ALL" || ((action === "RECOVER" || action === "MANDATORY") && p.active?.public)
        ? "всем пользователям"
        : "только admin и asmtv1";
    const target = action === "RECOVER" ? recovery : selected;
    const description = target
      ? target.title + " · ревизия " + target.revision
      : "безопасный пакет ещё не готов";
    const operation =
      action === "MANDATORY"
        ? required
          ? "Сделать обязательным опубликованный OTA"
          : "Отключить обязательность OTA"
        : action === "RECOVER"
          ? "Остановить новые платежи и откатить выпуск"
          : "Выпустить обновление";
    const update = action === "MANDATORY" ? `${version}-ota.${p.active?.revision}` : description;
    if (
      !window.confirm(
        `${operation} для ${platform} ${version}?\n${update}\nАудитория — ${audience}.` +
          (action === "ALL" && target?.checkout ?
            "\nВНИМАНИЕ: ЮKassa станет доступна всем только при явном разрешении сервера. До подтверждения проверьте StoreKit/App Review, тестовый платёж и пакет отката." : ""),
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
          key: action === "RECOVER" || (action === "MANDATORY" && !required) ? null : choice,
          action,
          required,
          token: p.token,
          operationId: crypto.randomUUID(),
        },
      });
      setMessage(
        action === "RECOVER"
          ? "Безопасная ревизия опубликована."
          : action === "MANDATORY"
            ? required
              ? "Обязательное обновление включено."
              : "Обязательное обновление отключено."
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
              setNativeId("");
              setMessage("");
            }}
          >
            <option value="ios">iOS</option>
            <option value="android">Android</option>
          </select>
        </label>
        <label>
          Подтверждённая нативная сборка
          <select
            value={native?.id ?? ""}
            disabled={busy}
            onChange={(e) => {
              setNativeId(e.target.value);
              setMessage("");
            }}
          >
            <option value="">
              {builds.length ? "Выберите сборку" : "Нет подтверждённых сборок"}
            </option>
            {builds.map((build) => (
              <option value={build.id} key={build.id}>
                {build.runtimeVersion} · сборка {build.buildNumber} · {build.distribution}
              </option>
            ))}
          </select>
        </label>
        <label>
          Подписанная OTA-ревизия
          <select
            value={selected?.key ?? ""}
            disabled={busy || !choices.length}
            onChange={(e) => setChoice(e.target.value)}
          >
            {!choices.length && <option value="">Нет подписанных ревизий для сборки</option>}
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {version}-ota.{c.revision} · {c.title} · {checkoutLabel(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {p && (
        <p>
          Зарегистрировано сборок — {p.total}, подтверждено — {p.verified}. Опубликованная ревизия —{" "}
          {p.active?.revision ?? "нет"}.
          {p.active && " Аудитория — " + (p.active.public ? "все" : "admin и asmtv1") + "."}
          {p.active &&
            (p.active.required ? " Обязательное обновление." : " Необязательное обновление.")}
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
            busy ||
            !selected?.complete ||
            selected.recoveryFor !== null ||
            (!selected.expanded && (!selected.newer || pending))
          }
          onClick={() => void submit("TEST")}
        >
          Выпустить тестерам
        </button>
        <button
          disabled={busy || !selected?.tested || !selected.complete ||
            (selected.checkout && !(platform === "ios" && version === "1.7.5"))}
          onClick={() => void submit("ALL")}
        >
          Выпустить всем
        </button>
        <button
          disabled={
            busy || !activeContainsBuild || p?.active?.required || p?.active?.action === "STOP" ||
            (p?.active?.public && selected?.checkout &&
              !(platform === "ios" && version === "1.7.5" &&
                hasSignedPublicCheckoutRecovery(selected,choices)))
          }
          onClick={() => void submit("MANDATORY", true)}
        >
          Сделать OTA обязательной
        </button>
        <button
          className="secondary"
          disabled={busy || !p?.active?.required || p.active.action === "STOP"}
          onClick={() => void submit("MANDATORY")}
        >
          Отключить обязательность
        </button>
        <button
          className="secondary"
          disabled={busy || !p?.active || p.active.action === "RECOVER"}
          onClick={() => void submit("RECOVER")}
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
