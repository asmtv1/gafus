import { useRef, useState, type FormEvent } from "react";
import { AdminHttpError, requestAdmin } from "./api";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const controls = [
  { key: "twoWeeks", title: "Самостоятельный" },
  { key: "monthly", title: "Поддержка в чате" },
  { key: "threeMonths", title: "Полное сопровождение" },
] as const;
function validPricingSettings(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (!(value.monthlyAppleProductId === null ||
    (typeof value.monthlyAppleProductId === "string" && value.monthlyAppleProductId.length <= 255)))
    return false;
  const plans = [
    ["twoWeeksEnabled", "yookassaTwoWeeksPriceRub", "twoWeeksIntervalDays"],
    ["monthlyEnabled", "yookassaMonthlyPriceRub", "monthlyIntervalDays"],
    ["threeMonthsEnabled", "yookassaThreeMonthsPriceRub", "threeMonthsIntervalDays"],
  ] as const;
  return plans.every(([enabled, price, days]) =>
    typeof value[enabled] === "boolean" &&
    typeof value[price] === "number" && Number.isFinite(value[price]) &&
    (value[price] as number) >= 1 && (value[price] as number) <= 100000 &&
    Number.isSafeInteger(value[days]) && (value[days] as number) >= 1 &&
    (value[days] as number) <= 366);
}

export function PricingEditor({
  source, onSaved, canChange = true,
}: { source: unknown; onSaved: () => void; canChange?: boolean }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    validPricingSettings(source) ? { ...source } : {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknownAck, setUnknownAck] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const writeLock = useRef(false);
  if (!validPricingSettings(source))
    return <p role="alert">Некорректный формат настроек тарифов</p>;
  const update = (key: string, value: unknown) => setDraft((old) => ({ ...old, [key]: value }));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (writeLock.current || unknownAck || !canChange) return;
    if (!validPricingSettings(draft)) {
      setError("Проверьте цены, периоды и Apple Product ID");
      return;
    }
    if (!window.confirm("Сохранить изменения тарифов и цен подписки?")) return;
    writeLock.current = true;
    setError(null);
    setSuccess(null);
    setSaving(true);
    let acknowledged = false;
    try {
      await requestAdmin("/api/v1/admin/settings/subscriptions", { method: "PUT", body: draft });
      acknowledged = true;
      const actual = await requestAdmin<unknown>("/api/v1/admin/settings/subscriptions");
      if (!validPricingSettings(actual)) throw new Error("Некорректный ответ тарифов");
      setDraft(actual);
      setUnknownAck(false);
      setSuccess("Настройки тарифов сохранены");
      onSaved();
    } catch (cause) {
      const rejected = !acknowledged && cause instanceof AdminHttpError &&
        cause.status >= 400 && cause.status < 500;
      setUnknownAck(!rejected);
      setError(rejected && cause instanceof Error ? cause.message
        : "Результат изменения тарифов неизвестен. Перечитайте сервер перед повтором.");
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  async function verify() {
    if (!canChange || writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    try {
      const actual = await requestAdmin<unknown>("/api/v1/admin/settings/subscriptions");
      if (!validPricingSettings(actual)) throw new Error("Некорректный ответ настроек тарифов");
      setDraft(actual);
      setUnknownAck(false);
      setError(null);
      setSuccess("Тарифы перечитаны с сервера");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось перечитать тарифы");
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  return (
    <form className="content-card settings-editor" onSubmit={save}>
      <h2>Настройки тарифов Premium</h2>
      <p className="note">
        ЮKassa: три тарифа; App Store: только месячный. Отключение тарифа останавливает
        новые продажи, но не продления.
      </p>
      <div className="operation-grid">
        {controls.map(({ key, title }) => (
          <fieldset key={key} disabled={!canChange || saving || unknownAck}>
            <legend>{title}</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={draft[`${key}Enabled`] === true}
                onChange={(e) => update(`${key}Enabled`, e.target.checked)}
              />
              Показывать в ЮKassa
            </label>
            <label>
              Цена YooKassa (₽)
              <input
                type="number"
                min="1"
                max="100000"
                step="1"
                required
                value={Number(
                  draft[
                    key === "twoWeeks"
                      ? "yookassaTwoWeeksPriceRub"
                      : key === "monthly"
                        ? "yookassaMonthlyPriceRub"
                        : "yookassaThreeMonthsPriceRub"
                  ] ?? 0,
                )}
                onChange={(e) =>
                  update(
                    key === "twoWeeks"
                      ? "yookassaTwoWeeksPriceRub"
                      : key === "monthly"
                        ? "yookassaMonthlyPriceRub"
                        : "yookassaThreeMonthsPriceRub",
                    Number(e.target.value),
                  )
                }
              />
            </label>
            <label>
              Количество дней
              <input
                type="number"
                min="1"
                max="366"
                step="1"
                required
                value={Number(draft[`${key}IntervalDays`] ?? 30)}
                onChange={(e) => update(`${key}IntervalDays`, Number(e.target.value))}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <label>
        Apple Product ID
        <input
          disabled={!canChange || saving || unknownAck}
          maxLength={255}
          value={String(draft.monthlyAppleProductId ?? "")}
          onChange={(e) => update("monthlyAppleProductId", e.target.value.trim() || null)}
        />
        <span className="note">Используется только App Store для месячного тарифа</span>
      </label>
      {!canChange && <p className="note">Только ADMIN может изменять настройки тарифов.</p>}
      <button disabled={!canChange || saving || unknownAck} type="submit">
        {saving ? "Сохранение…" : "Сохранить"}
      </button>
      {unknownAck && canChange && (
        <button type="button" className="secondary" disabled={saving} onClick={() => void verify()}>
          Перечитать тарифы на сервере
        </button>
      )}
      {success && <p role="status" className="success">{success}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

const featureKeys = [
  ["vkLogin", "Вход ВКонтакте"],
  ["iosRuCardPayment", "Оплата российской картой iOS"],
  ["subscriptionPromoCodes", "Промокоды"],
  ["iosRuCardPaymentHint", "Подсказка об оплате"],
] as const;
function featureDraft(source: Record<string, unknown>): Record<string, unknown> {
  const { revision, iosReviewVersion, ota, released, review, global, rewardedAds } = source;
  return { revision, iosReviewVersion, ota, released, review, global, rewardedAds };
}
function validFeatureControl(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) ||
    !(Number(value.revision) > 0) ||
    !(value.iosReviewVersion === null || typeof value.iosReviewVersion === "string")) return false;
  if (!["released", "review", "global", "rewardedAds", "ota"].every(key => isRecord(value[key]))) return false;
  const ota = value.ota as Record<string, unknown>;
  if (typeof ota.required !== "boolean" ||
    !(ota.version === null || typeof ota.version === "string") ||
    !["all", "ios", "android"].includes(String(ota.platform))) return false;
  const profiles = ["released", "review"];
  return profiles.every(profile =>
    ["vkLogin", "iosRuCardPayment", "subscriptionPromoCodes", "iosRuCardPaymentHint", "rewardedAds"]
      .every(flag => typeof (value[profile] as Record<string, unknown>)[flag] === "boolean")) &&
    ["appSubscriptionPaywall", "appSubscriptionGating"]
      .every(flag => typeof (value.global as Record<string, unknown>)[flag] === "boolean");
}
export function FeatureFlagsEditor({ source, onSaved }: { source: unknown; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    if (!isRecord(source)) return {};
    const { revision, iosReviewVersion, ota, released, review, global, rewardedAds } = source;
    return { revision, iosReviewVersion, ota, released, review, global, rewardedAds };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [verifyRequired, setVerifyRequired] = useState(false);
  const writeLock = useRef(false);
  if (
    !isRecord(source) ||
    !isRecord(draft.released) ||
    !isRecord(draft.review) ||
    !isRecord(draft.global) ||
    !isRecord(draft.rewardedAds) ||
    !isRecord(draft.ota)
  )
    return <p role="alert">Некорректный формат настроек feature-flags</p>;
  const updateGroup = (group: string, key: string, value: unknown) =>
    setDraft((old) => ({
      ...old,
      [group]: { ...(isRecord(old[group]) ? old[group] : {}), [key]: value },
    }));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (writeLock.current || verifyRequired) return;
    const ota = draft.ota as Record<string, unknown>;
    if (ota.required && (
      !ota.version || !/^\d+\.\d+\.\d+-ota\.[1-9]\d*$/.test(String(ota.version))
    )) {
      setError("Для обязательного OTA укажите опубликованную версию вида 1.7.3-ota.1");
      return;
    }
    if (!window.confirm(ota.required
      ? `Включить обязательное OTA ${String(ota.version)} для ${String(ota.platform)}? Убедитесь, что обновление опубликовано и доступно.`
      : "Опубликовать новые значения feature-flags?")) return;
    writeLock.current = true;
    setSaving(true);
    setError(null);
    setSaved(null);
    let acknowledged = false;
    try {
      await requestAdmin("/api/v1/admin/feature-flags", { method: "PUT", body: draft });
      acknowledged = true;
      const actual = await requestAdmin<Record<string, unknown>>("/api/v1/admin/feature-flags");
      if (!validFeatureControl(actual)) throw new Error("Некорректный ответ feature-flags");
      const submitted = draft;
      if (Number(actual.revision) <= Number(submitted.revision) ||
        actual.iosReviewVersion !== submitted.iosReviewVersion ||
        !Object.entries(submitted.ota as Record<string, unknown>).every(([key, value]) =>
          (actual.ota as Record<string, unknown>)[key] === value) ||
        !["released", "review", "global"].every((group) =>
          Object.entries(submitted[group] as Record<string, unknown>).every(([key, value]) =>
            (actual[group] as Record<string, unknown>)[key] === value))) {
        throw new Error("Настройки изменились при сохранении. Перечитайте сервер.");
      }
      setDraft(featureDraft(actual));
      setVerifyRequired(false);
      setSaved("Настройки проверены повторным чтением с сервера");
      onSaved();
    } catch (cause) {
      const definitiveRejection = !acknowledged && cause instanceof AdminHttpError &&
        cause.status >= 400 && cause.status < 500;
      setVerifyRequired(!definitiveRejection);
      setError(definitiveRejection && cause instanceof Error ? cause.message
        : "Результат сохранения неизвестен. Перечитайте сервер перед повтором.");
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  async function verify() {
    if (writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const actual = await requestAdmin<Record<string, unknown>>("/api/v1/admin/feature-flags");
      if (!validFeatureControl(actual)) throw new Error("Некорректный ответ feature-flags");
      setDraft(featureDraft(actual));
      setVerifyRequired(false);
      setSaved("Текущие значения перечитаны с сервера");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось перечитать настройки");
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  return (
    <form className="content-card settings-editor" onSubmit={save}>
      <h2>Флаги мобильного приложения</h2>
      <p className="note">
        Ревизия: {String(draft.revision)}. Изменения со старой ревизией отклоняются (409).
      </p>
      <div className="operation-grid">
        {(["released", "review"] as const).map((profile) => (
          <fieldset key={profile} disabled={saving || verifyRequired}>
            <legend>{profile === "released" ? "Публичный релиз" : "Режим ревью"}</legend>
            {featureKeys.map(([key, title]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={(draft[profile] as Record<string, unknown>)[key] === true}
                  onChange={(e) => updateGroup(profile, key, e.target.checked)}
                />
                {title}
              </label>
            ))}
          </fieldset>
        ))}
        <fieldset disabled={saving || verifyRequired}>
          <legend>Глобальные настройки</legend>
          {(["appSubscriptionPaywall", "appSubscriptionGating"] as const).map((key) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={(draft.global as Record<string, unknown>)[key] === true}
                onChange={(e) => updateGroup("global", key, e.target.checked)}
              />
              {key}
            </label>
          ))}
          <label>
            Версия ревью iOS
            <input
              placeholder="1.7.3"
              value={String(draft.iosReviewVersion ?? "")}
              onChange={(e) =>
                setDraft((old) => ({
                  ...old,
                  iosReviewVersion: e.target.value || null,
                }))
              }
            />
          </label>
        </fieldset>
        <fieldset disabled={saving || verifyRequired}>
          <legend>OTA-обновления · приложение 1.7.3</legend>
          <p className="note">
            Независимо от принудительных обновлений App Store / Google Play.
            Включайте обязательность только после публикации OTA для нужных платформ.
          </p>
          <label>
            Минимальная OTA-версия
            <input
              placeholder="1.7.3-ota.1"
              maxLength={48}
              value={String((draft.ota as Record<string, unknown>).version ?? "")}
              onChange={(e) => updateGroup("ota", "version", e.target.value.trim() || null)}
            />
          </label>
          <label>
            Платформы
            <select
              value={String((draft.ota as Record<string, unknown>).platform)}
              onChange={(e) => updateGroup("ota", "platform", e.target.value)}
            >
              <option value="all">iOS и Android</option>
              <option value="ios">Только iOS</option>
              <option value="android">Только Android</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={(draft.ota as Record<string, unknown>).required === true}
              onChange={(e) => updateGroup("ota", "required", e.target.checked)}
            />
            Обязательное OTA-обновление
          </label>
          <p className="note">
            Выключено: OTA применяется как обычно. Включено: старая OTA-ревизия
            блокируется до успешной установки; при ошибке доступна повторная попытка.
          </p>
        </fieldset>
        <fieldset disabled>
          <legend>Rewarded Ads (архив, только чтение)</legend>
          <p className="note">Рекламные гафусы исключены из новой архитектуры. Архивные параметры нельзя изменять или активировать.</p>
          {(["androidEnabled", "testMode"] as const).map((key) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={(draft.rewardedAds as Record<string, unknown>)[key] === true}
                onChange={(e) => updateGroup("rewardedAds", key, e.target.checked)}
              />
              {key}
            </label>
          ))}
          <label>
            Лимит в день
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={Number((draft.rewardedAds as Record<string, unknown>).dailyAdLimit ?? 0)}
              onChange={(e) => updateGroup("rewardedAds", "dailyAdLimit", Number(e.target.value))}
            />
          </label>
          {(["yandexAndroidPlacementId", "yandexIosPlacementId"] as const).map((key) => (
            <label key={key}>
              {key}
              <input
                maxLength={256}
                value={String((draft.rewardedAds as Record<string, unknown>)[key] ?? "")}
                onChange={(e) => updateGroup("rewardedAds", key, e.target.value || null)}
              />
            </label>
          ))}
        </fieldset>
      </div>
      <button type="submit" disabled={saving || verifyRequired}>
        {saving ? "Сохранение…" : "Сохранить флаги"}
      </button>
      {verifyRequired && (
        <button type="button" className="secondary" onClick={verify} disabled={saving}>
          Перечитать флаги перед повтором
        </button>
      )}
      {saved && <p role="status" className="success">{saved}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
