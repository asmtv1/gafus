import { useRef, useState, type FormEvent } from "react";
import { AdminHttpError, requestAdmin } from "./api";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const controls = [
  {
    key: "twoWeeks",
    title: "Самостоятельный",
    enabled: "twoWeeksEnabled",
    price: "yookassaTwoWeeksPriceRub",
    days: "twoWeeksIntervalDays",
  },
  {
    key: "monthly",
    title: "Поддержка в чате",
    enabled: "monthlyEnabled",
    price: "yookassaMonthlyPriceRub",
    days: "monthlyIntervalDays",
  },
  {
    key: "threeMonths",
    title: "Полное сопровождение",
    enabled: "threeMonthsEnabled",
    price: "yookassaThreeMonthsPriceRub",
    days: "threeMonthsIntervalDays",
  },
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
  const [baseline, setBaseline] = useState<Record<string, unknown>>(() =>
    validPricingSettings(source) ? { ...source } : {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknownAck, setUnknownAck] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const writeLock = useRef(false);
  if (!validPricingSettings(source)) {
    return <p role="alert">Некорректный формат настроек тарифов</p>;
  }

  const changed = Object.keys(baseline).some((key) => draft[key] !== baseline[key]);
  const disabled = !canChange || saving || unknownAck;
  const update = (key: string, value: unknown) => {
    setError(null);
    setSuccess(null);
    setDraft((old) => ({ ...old, [key]: value }));
  };
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (writeLock.current || unknownAck || !canChange || !changed) return;
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
      setBaseline({ ...actual });
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
      setBaseline({ ...actual });
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
    <form className="content-card subscription-settings" onSubmit={save}>
      <header className="subscription-settings-header">
        <div>
          <h2>Тарифы Premium</h2>
          <p className="note">
            Цены и срок доступа для новых покупок через ЮKassa.
            Отключение тарифа не отменяет уже оформленные подписки.
          </p>
        </div>
        {changed && <span className="subscription-unsaved">Есть изменения</span>}
      </header>

      <div className="subscription-plan-list">
        {controls.map(({ key, title, enabled, price, days }) => (
          <section className="subscription-plan" key={key} aria-labelledby={`plan-${key}`}>
            <div className="subscription-plan-head">
              <div>
                <h3 id={`plan-${key}`}>{title}</h3>
                <span className="note">Оплата через ЮKassa</span>
              </div>
              <label className="subscription-plan-toggle">
                <input
                  type="checkbox"
                  className="feature-switch"
                  disabled={disabled}
                  checked={draft[enabled] === true}
                  onChange={(e) => update(enabled, e.target.checked)}
                />
                <span>{draft[enabled] === true ? "В продаже" : "Не продаётся"}</span>
              </label>
            </div>
            <div className="subscription-plan-fields">
              <label>
                Цена, ₽
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  required
                  disabled={disabled}
                  value={Number(draft[price] ?? 0)}
                  onChange={(e) => update(price, Number(e.target.value))}
                />
              </label>
              <label>
                Срок доступа, дней
                <input
                  type="number"
                  min="1"
                  max="366"
                  step="1"
                  required
                  disabled={disabled}
                  value={Number(draft[days] ?? 30)}
                  onChange={(e) => update(days, Number(e.target.value))}
                />
              </label>
            </div>
          </section>
        ))}
      </div>

      <details className="subscription-advanced">
        <summary>Настройки App Store <span>Месячная подписка</span></summary>
        <div className="subscription-advanced-body">
          <p className="note">
            Для покупок в App Store используется отдельный продукт. Его ID меняйте
            только при обновлении настроек магазина.
          </p>
          <label>
            Идентификатор продукта Apple
            <input
              disabled={disabled}
              maxLength={255}
              value={String(draft.monthlyAppleProductId ?? "")}
              onChange={(e) => update("monthlyAppleProductId", e.target.value.trim() || null)}
            />
          </label>
        </div>
      </details>

      <div className="subscription-settings-footer">
        {canChange ? (
          <button disabled={disabled || !changed} type="submit">
            {saving ? "Сохранение…" : "Сохранить изменения"}
          </button>
        ) : <p className="note">Изменять тарифы может только администратор.</p>}
        {unknownAck && canChange && (
          <button type="button" className="secondary" disabled={saving} onClick={() => void verify()}>
            Перечитать тарифы на сервере
          </button>
        )}
        {success && <p role="status" className="success">{success}</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </div>
    </form>
  );
}

function featureDraft(source: Record<string, unknown>): Record<string, unknown> {
  const { revision, ota, global, rewardedAds } = source;
  return { revision, ota, global, rewardedAds };
}
function validFeatureControl(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || Number(value.revision) <= 0) return false;
  if (!["global", "rewardedAds", "ota"].every(key => isRecord(value[key]))) return false;
  const ota = value.ota as Record<string, unknown>;
  return typeof ota.required === "boolean" &&
    (ota.version === null || typeof ota.version === "string") &&
    ["all", "ios", "android"].includes(String(ota.platform)) &&
    ["appSubscriptionPaywall", "appSubscriptionGating"]
      .every(flag => typeof (value.global as Record<string, unknown>)[flag] === "boolean");
}
const subscriptionFeatures = [
  {
    key: "appSubscriptionPaywall",
    title: "Экран покупки Premium",
    description: "Показывать предложение оформить подписку",
  },
  {
    key: "appSubscriptionGating",
    title: "Ограничение доступа",
    description: "Закрывать платный контент без активной подписки",
  },
] as const;

export function FeatureFlagsEditor({
  source,
  onSaved,
  canChange = true,
}: {
  source: unknown;
  onSaved: () => void;
  canChange?: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    isRecord(source) ? featureDraft(source) : {},
  );
  const [baselineGlobal, setBaselineGlobal] = useState<Record<string, unknown>>(() =>
    isRecord(source) && isRecord(source.global) ? { ...source.global } : {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [verifyRequired, setVerifyRequired] = useState(false);
  const writeLock = useRef(false);

  if (
    !isRecord(source) ||
    !isRecord(draft.global) ||
    !isRecord(draft.rewardedAds) ||
    !isRecord(draft.ota)
  ) {
    return <p role="alert">Некорректный формат настроек приложения</p>;
  }

  const globalFlags = draft.global as Record<string, unknown>;

  const archivedAds = draft.rewardedAds as Record<string, unknown>;
  const legacyOta = draft.ota as Record<string, unknown>;
  const updatedBy = isRecord(source.updatedBy) ? source.updatedBy : null;
  const hasChanges = subscriptionFeatures.some(
    ({ key }) => globalFlags[key] !== baselineGlobal[key],
  );
  const updateGroup = (group: string, key: string, value: unknown) => {
    setSaved(null);
    setError(null);
    setDraft((old) => ({
      ...old,
      [group]: { ...(isRecord(old[group]) ? old[group] : {}), [key]: value },
    }));
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canChange || !hasChanges || writeLock.current || verifyRequired) return;
    if (!validFeatureControl(draft)) {
      setError("Некорректные настройки приложения. Перечитайте сервер.");
      return;
    }
    if (legacyOta.required && (
      !legacyOta.version || !/^\d+\.\d+\.\d+-ota\.[1-9]\d*$/.test(String(legacyOta.version))
    )) {
      setError("Некорректная архивная OTA-версия. Перечитайте сервер.");
      return;
    }
    if (!window.confirm("Сохранить изменения настроек подписки в приложении?")) return;

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
      if (
        Number(actual.revision) <= Number(submitted.revision) ||
        !Object.entries(submitted.ota as Record<string, unknown>).every(
          ([key, value]) => (actual.ota as Record<string, unknown>)[key] === value,
        ) ||
        !Object.entries(submitted.global as Record<string, unknown>).every(
          ([key, value]) => (actual.global as Record<string, unknown>)[key] === value,
        )
      ) {
        throw new Error("Настройки изменились при сохранении. Перечитайте сервер.");
      }
      setDraft(featureDraft(actual));
      setBaselineGlobal({ ...(actual.global as Record<string, unknown>) });
      setVerifyRequired(false);
      setSaved("Настройки сохранены и проверены на сервере");
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
    if (!canChange || writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const actual = await requestAdmin<Record<string, unknown>>("/api/v1/admin/feature-flags");
      if (!validFeatureControl(actual)) throw new Error("Некорректный ответ feature-flags");
      setDraft(featureDraft(actual));
      setBaselineGlobal({ ...(actual.global as Record<string, unknown>) });
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
    <form className="content-card feature-settings" onSubmit={save}>
      <header className="feature-settings-header">
        <div>
          <h2>Настройки приложения</h2>
          <p className="note">Основные функции GAFUS. Изменения применяются после сохранения.</p>
        </div>
        <span className="feature-settings-status" aria-live="polite">
          {hasChanges ? "Есть изменения" : "Актуально"}
        </span>
      </header>

      <section className="feature-settings-group" aria-labelledby="feature-subscriptions">
        <div className="feature-settings-group-heading">
          <div>
            <h3 id="feature-subscriptions">Подписка</h3>
            <p className="note">Управление доступом к Premium</p>
          </div>
        </div>
        {subscriptionFeatures.map(({ key, title, description }) => (
          <label className="feature-setting-row" key={key}>
            <span className="feature-setting-copy">
              <strong>{title}</strong>
              <span>{description}</span>
            </span>
            <input
              className="feature-switch"
              type="checkbox"
              aria-label={title}
              checked={globalFlags[key] === true}
              disabled={!canChange || saving || verifyRequired}
              onChange={(e) => updateGroup("global", key, e.target.checked)}
            />
          </label>
        ))}
        {!canChange && <p className="note">Изменять настройки может только администратор.</p>}
      </section>

      <section className="feature-settings-group" aria-labelledby="feature-ota">
        <div className="feature-settings-group-heading">
          <div>
            <h3 id="feature-ota">Обязательные обновления</h3>
            <p className="note">OTA для iOS и Android настраивается независимо.</p>
          </div>
          <a className="feature-settings-link" href="/mobile-ota">Мобильные релизы</a>
        </div>
        <p className="feature-settings-description">
          Управление обязательным OTA перенесено в раздел мобильных релизов.
          Старый общий переключатель здесь больше не действует для версии 1.7.5 и новее.
        </p>
      </section>

      <details className="feature-settings-extra">
        <summary>
          <span>
            <strong>Архив рекламы</strong>
            <small>Рекламные гафусы отключены от новой архитектуры</small>
          </span>
          <span className="feature-archive-tag">Только чтение</span>
        </summary>
        <div className="feature-settings-extra-body">
          <p className="note">
            Эти параметры сохранены для совместимости и не управляют действующими функциями.
          </p>
          <dl className="feature-settings-facts">
            <div><dt>Android-реклама</dt><dd>{archivedAds.androidEnabled ? "Была включена" : "Отключена"}</dd></div>
            <div><dt>Дневной лимит</dt><dd>{String(archivedAds.dailyAdLimit ?? "—")}</dd></div>
            <div><dt>Тестовый режим</dt><dd>{archivedAds.testMode ? "Включён" : "Отключён"}</dd></div>
          </dl>
        </div>
      </details>

      <details className="feature-settings-extra feature-settings-technical">
        <summary>
          <span><strong>Техническая информация</strong><small>Архивное OTA и сведения о последнем изменении</small></span>
        </summary>
        <div className="feature-settings-extra-body">
          <dl className="feature-settings-facts">
            <div><dt>Ревизия</dt><dd>{String(draft.revision)}</dd></div>
            <div><dt>Обновлено</dt><dd>{typeof source.updatedAt === "string" ? new Date(source.updatedAt).toLocaleString("ru-RU") : "—"}</dd></div>
            <div><dt>Изменил</dt><dd>{updatedBy ? String(updatedBy.username ?? updatedBy.id ?? "—") : "—"}</dd></div>
            <div><dt>Архивное OTA</dt><dd>{legacyOta.required ? "Обязательное" : "Необязательное"} · {String(legacyOta.version ?? "Без версии")} · {String(legacyOta.platform ?? "all")}</dd></div>
            <div><dt>Реклама Android ID</dt><dd>{String(archivedAds.yandexAndroidPlacementId ?? "—")}</dd></div>
            <div><dt>Реклама iOS ID</dt><dd>{String(archivedAds.yandexIosPlacementId ?? "—")}</dd></div>
          </dl>
          <p className="note">Ревизия используется сервером для защиты от одновременных изменений.</p>
        </div>
      </details>

      {(canChange || saved || error) && (
        <div className="feature-settings-footer">
          {canChange && (
            <button type="submit" disabled={!hasChanges || saving || verifyRequired}>
              {saving ? "Сохранение…" : "Сохранить изменения"}
            </button>
          )}
          {verifyRequired && canChange && (
            <button type="button" className="secondary" onClick={() => void verify()} disabled={saving}>
              Перечитать настройки
            </button>
          )}
          {saved && <p role="status" className="success">{saved}</p>}
          {error && <p role="alert" className="error">{error}</p>}
        </div>
      )}
    </form>
  );
}
