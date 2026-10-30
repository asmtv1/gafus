import { useEffect, useRef, useState } from "react";
import { PrimaryButton } from "../../shared/ui";
import { apiRequest } from "../../shared/api/client";
import { getWalletStatus, type WalletStatus } from "../gafus/walletReadApi";
import styles from "./ArticleGafusUnlock.module.css";

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value =>
    value.toString(16).padStart(2, "0")).join("");
}

/** A Gafus purchase is idempotent and never inferred from a lost HTTP ACK. */
export function ArticleGafusUnlock({ articleId, userId, onVerify }: {
  articleId: string;
  userId: string;
  onVerify: () => Promise<boolean>;
}) {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingRequestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void getWalletStatus().then(value => {
      if (alive.current) setStatus(value);
    }).catch(() => {
      if (alive.current) setError("Не удалось проверить баланс гафусов.");
    });
    return () => { alive.current = false; };
  }, [userId, articleId]);

  const verify = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const allowed = await onVerify();
      if (!alive.current) return;
      if (allowed) {
        pendingRequestId.current = null;
        setNotice("Доступ подтверждён на сервере.");
      } else {
        setNotice("Доступ пока не подтверждён. Повторное списание не выполнялось.");
      }
    } catch {
      if (alive.current) setError("Проверка доступа не удалась. Списание не повторялось.");
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const unlock = async () => {
    if (inFlight.current || !status?.enabled.economy || !status.enabled.spending ||
      status.wallet.balance < 1) return;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const clientRequestId = pendingRequestId.current ?? requestId();
      pendingRequestId.current = clientRequestId;
      await apiRequest("/api/v1/gafus/unlock", {
        method: "POST", browserAuth: true, expectedStatus: 200,
        json: { clientRequestId, target: { type: "ARTICLE", articleId } },
      });
      const allowed = await onVerify();
      if (!alive.current) return;
      if (allowed) {
        pendingRequestId.current = null;
        setNotice("Статья открыта на 7 дней.");
      } else {
        setNotice("Проверяем доступ. Не повторяйте покупку с другим номером запроса.");
      }
    } catch {
      if (alive.current) setError(
        "Не удалось подтвердить покупку. Проверьте доступ перед повтором.",
      );
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setBusy(false);
        void getWalletStatus().then(value => {
          if (alive.current) setStatus(value);
        }).catch(() => undefined);
      }
    }
  };

  return <section className={styles.card} aria-label="Открыть статью за гафус">
    <div>
      <strong>Открыть статью на 7 дней</strong>
      <p>Одна статья — один гафус. Или оформите Premium для всех статей.</p>
    </div>
    <div className={styles.action}>
      <span>{status ? `Ваш баланс: ${status.wallet.balance} гафусов` : "Проверяем баланс…"}</span>
      <PrimaryButton disabled={busy || !status?.enabled.economy ||
        !status.enabled.spending || status.wallet.balance < 1}
        onClick={() => void unlock()}>
        {busy ? "Открываем…" : "Открыть за 1 гафус"}
      </PrimaryButton>
      {status && status.wallet.balance < 1 &&
        <small>Недостаточно гафусов. Получайте их за активность в «Моментах» и вопросах.</small>}
    </div>
    {(pendingRequestId.current || notice) && <button type="button"
      className={styles.verify} disabled={busy} onClick={() => void verify()}>
      Проверить доступ
    </button>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
