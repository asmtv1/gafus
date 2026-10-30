import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { getWalletStatus, type WalletStatus } from "../gafus/walletReadApi";
import {PrimaryButton} from "../../shared/ui";

const validId = (id: string) => /^c[a-z0-9]{24}$/.test(id);

/** Reuses the existing AG1 Core ledger. The backend, not Web, decides amount,
 * seven-day term, subscription bypass, concurrent requests and grants.
 * Do not retry a POST with a different clientRequestId after a lost ACK.
 */
export async function unlockTrainingStepWithGafus(input: {
  dayOnCourseId: string;
  stepOnDayId: string;
  clientRequestId: string;
}): Promise<void> {
  if (!validId(input.dayOnCourseId) || !validId(input.stepOnDayId) ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(input.clientRequestId)) {
    throw Error("INVALID_GAFUS_STEP_TARGET");
  }
  await apiRequest<unknown>("/api/v1/gafus/unlock", {
    method: "POST", browserAuth: true, expectedStatus: 200,
    json: {
      clientRequestId: input.clientRequestId,
      target: {
        type: "COURSE_STEP", dayOnCourseId: input.dayOnCourseId,
        stepOnDayId: input.stepOnDayId,
      },
    },
  });
}

// The local Hono proxy and browser fetch do not have a shared response deadline.
// Race even uncooperative transports (or a stalled response.json()) with a
// cancellable read-only timeout. POST /unlock is deliberately NOT retried.
export const GAFUS_WALLET_READ_TIMEOUT_MS = 10000;
async function readWalletWithDeadline(signal: AbortSignal): Promise<WalletStatus> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getWalletStatus(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("GAFUS_WALLET_READ_TIMEOUT"));
        }, GAFUS_WALLET_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    controller.abort();
  }
}

function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // WebCrypto only: never use Date.now/Math.random as an idempotency key.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
}

export function TrainingStepUnlock({
  userId, dayOnCourseId, stepOnDayId, onVerify, compact = false,
}: {
  userId: string;
  dayOnCourseId: string;
  stepOnDayId: string;
  onVerify: () => Promise<boolean>;
  compact?: boolean;
}) {
  const cache = useQueryClient();
  const [shown, setShown] = useState(false);
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [retired, setRetired] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [manualChecked, setManualChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const flight = useRef(false);
  const epoch = useRef(0);
  const active = useRef(true);
  const walletReadController = useRef<AbortController | null>(null);
  // React StrictMode replays mount effects in development. A replay must
  // synchronously release a cancelled GET before the next effect calls
  // showWallet(); the old request's finally must not release the new flight.
  const cancelWalletRead = () => {
    const controller = walletReadController.current;
    if (!controller) return;
    walletReadController.current = null;
    flight.current = false;
    controller.abort();
  };
  useEffect(() => {
    active.current = true;
    const revision = epoch;
    const unsubscribe = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
          !event.query.queryKey.every((part: unknown, i: number) =>
            part === CURRENT_USER_QUERY_KEY[i])) return;
      revision.current++;
      cancelWalletRead();
      setRetired(true);
    });
    return () => {
      active.current = false;
      revision.current++;
      cancelWalletRead();
      unsubscribe();
    };
  }, [cache]);
  const current = () => active.current && !retired &&
    cache.getQueryData<{ id: string } | null>(CURRENT_USER_QUERY_KEY)?.id === userId;
  const actorOK = current();

  const showWallet = async () => {
    if (!actorOK || flight.current || shown) return;
    flight.current = true;
    const controller = new AbortController();
    walletReadController.current = controller;
    const seq = epoch.current;
    setBusy(true); setError("");
    try {
      const status = await readWalletWithDeadline(controller.signal);
      if (seq !== epoch.current || !current() || controller.signal.aborted) return;
      setWallet(status); setShown(true);
    } catch (cause) {
      if (seq === epoch.current && current() && !controller.signal.aborted)
        setError(cause instanceof Error && cause.message === "GAFUS_WALLET_READ_TIMEOUT"
          ? "Сервер слишком долго отвечает. Повторите загрузку баланса."
          : "Не удалось проверить баланс гафусов.");
    } finally {
      // A StrictMode replay or owner switch may have already started another
      // GET. Never clear the new request's flight or busy state from an old one.
      if (walletReadController.current === controller) {
        walletReadController.current = null;
        flight.current = false;
        if (seq === epoch.current && current()) setBusy(false);
      }
    }
  };

  // The step-scoped compact paywall reads the wallet as soon as it is opened.
  // This GET has no spending side effects. The POST remains user-initiated.
  useEffect(() => {
    if (!compact) return;
    void showWallet();
    // A new step target mounts a new access gate; no retry loops after errors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, userId, dayOnCourseId, stepOnDayId]);

  const verify = async () => {
    if (!actorOK || flight.current) return;
    flight.current = true;
    const seq = epoch.current;
    setBusy(true); setError(""); setMessage("");
    try {
      const granted = await onVerify();
      if (seq !== epoch.current || !current()) return;
      if (granted) {
        setUnknown(false); setManualChecked(false);
        setMessage("Доступ подтверждён на сервере.");
      } else {
        setUnknown(true); setManualChecked(true);
        setMessage("Доступ пока не подтверждён. Допустим повтор с тем же номером запроса.");
      }
    } catch {
      if (seq === epoch.current && current()) {
        setUnknown(true);
        setError("Не удалось проверить доступ. Списание не повторялось.");
      }
    } finally {
      flight.current = false;
      if (seq === epoch.current && current()) setBusy(false);
    }
  };

  const unlock = async () => {
    if (!actorOK || !wallet || !wallet.enabled.economy ||
        !wallet.enabled.spending || wallet.wallet.balance < wallet.rules.courseStepCost ||
        flight.current || (unknown && !manualChecked)) return;
    flight.current = true;
    const seq = epoch.current;
    setBusy(true); setError(""); setMessage("");
    let sent = false;
    try {
      if (!requestId.current) requestId.current = newRequestId();
      sent = true;
      await unlockTrainingStepWithGafus({
        dayOnCourseId, stepOnDayId, clientRequestId: requestId.current,
      });
      if (seq !== epoch.current || !current()) return;
      const granted = await onVerify();
      if (seq !== epoch.current || !current()) return;
      if (!granted) throw Error("GAFUS_GRANT_UNCONFIRMED");
      setUnknown(false); setManualChecked(false);
      setMessage("Доступ к шагу подтверждён на сервере.");
      // Wallet invalidation never fabricates an available balance.
      await cache.invalidateQueries({ queryKey: ["wallet", "owner", userId] });
    } catch {
      if (seq === epoch.current && current()) {
        if (sent) { setUnknown(true); setManualChecked(false); }
        setError(sent
          ? "Исход открытия неизвестен. Сначала проверьте доступ, не повторяйте списание."
          : "Не удалось отправить запрос на открытие шага.");
      }
    } finally {
      flight.current = false;
      if (seq === epoch.current && current()) setBusy(false);
    }
  };

  if (!actorOK) return <p role="alert">Сессия изменилась. Доступ нужно проверить снова.</p>;
  const canSpend = !!wallet && wallet.enabled.economy && wallet.enabled.spending &&
    wallet.wallet.balance >= wallet.rules.courseStepCost;
  const walletSummary = shown && wallet && <p className={compact ? "gafus-unlock-status" : undefined}>
    Гафусы: {wallet.wallet.balance}. Стоимость шага: {wallet.rules.courseStepCost}.
    Доступ действует {Math.floor(wallet.rules.accessDurationSeconds / 86400)} дней.
  </p>;
  const eligibilityMessage = shown && wallet &&
    (!wallet.enabled.economy || !wallet.enabled.spending ?
      <p>Открытие за гафусы сейчас недоступно.</p> :
      !canSpend ? <p>Недостаточно гафусов. Заработайте их активностью в сообществе.</p> : null);
  const confirmUnlock = <PrimaryButton type="button"
    disabled={busy || !canSpend || (unknown && !manualChecked)}
    onClick={() => void unlock()}>
    {unknown && manualChecked ? "Повторить тот же запрос" : "Открыть за гафусы"}
  </PrimaryButton>;

  return <div className={compact ? "training-step-unlock training-step-unlock--compact" :
    "training-step-unlock"} aria-label="Доступ за гафусы">
    {compact ? <>
      {walletSummary}
      {confirmUnlock}
      {!shown && !error && <Loading message="Проверяем баланс и стоимость (не более 10 секунд)…" className="gafus-unlock-status" />}
      {eligibilityMessage}
      {!shown && error && <button type="button" className="button-secondary"
        disabled={busy} onClick={() => void showWallet()}>Повторить загрузку баланса</button>}
    </> : <>
      {!shown && <button type="button" className="button-secondary" disabled={busy}
        onClick={() => void showWallet()}>{busy ? "Проверяем…" : "Открыть доступ"}</button>}
      {walletSummary}
      {shown && wallet && <>
        {eligibilityMessage}
        {canSpend && confirmUnlock}
      </>}
    </>}
    {shown && (unknown || message) && <button type="button" className="button-secondary"
      disabled={busy} onClick={() => void verify()}>
      Проверить доступ на сервере
    </button>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {!compact && <p className="note">Если материал включён в подписку, списывать гафусы не нужно.</p>}
  </div>;
}
