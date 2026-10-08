"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { CynologistChatStateDto, CynologistIntake } from "@gafus/consultation-shared";
import {
  cynologistIntakeSchema,
  INTAKE_FIELDS,
  CHAT_REPLY_COPY,
  CHAT_HOURS_COPY,
} from "@gafus/consultation-shared";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { PrimaryButton } from "@/shared/components/ui/PrimaryButton";
import { reportClientError } from "@gafus/error-handling";
import { useChatResource } from "./useChatResource";
import { chatApi } from "./api";
import { ConnectedChat } from "./ConnectedChat";
import styles from "./chat.module.css";
export default function ChatPage({ chatId }: { chatId?: string }) {
  const { accountId, state, session, error, setError, refresh } =
    useChatResource<CynologistChatStateDto>({ chatId });
  const [busy, setBusy] = useState(false);
  const startInFlight = useRef(false);
  const [intake, setIntake] = useState<Record<string, string>>({ petGender: "" });
  async function start() {
    if (startInFlight.current) return;
    const parsed = cynologistIntakeSchema.safeParse(state?.chat?.intake ?? intake);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    startInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await chatApi<CynologistChatStateDto>("start", {
        method: "POST",
        body: parsed.data as CynologistIntake,
      });
      await refresh();
    } catch (e) {
      reportClientError(e, { issueKey: "ChatPage", keys: { operation: "request" } });
      setError((e as Error).message);
    } finally {
      startInFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <h1>Чат с кинологом</h1>
      <p>{CHAT_REPLY_COPY}</p>
      <p>{CHAT_HOURS_COPY}</p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void refresh()}>
            Повторить загрузку
          </button>
        </div>
      )}
      {!state && !error && <LoadingState message="Загрузка сообщений…" />}
      {state && !state.chat && !state.canUseCynologistChat && (
        <p>
          Чат входит в месячный и трёхмесячный тариф.{" "}
          <Link href="/subscription">Выбрать тариф</Link>
        </p>
      )}
      {state && !state.enabled && <p>Новые сообщения временно недоступны.</p>}
      {state &&
        state.canUseCynologistChat &&
        state.enabled &&
        (!state.chat || state.chat.provisionStatus !== "READY") && (
          <form
            className={styles.intake}
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <p>Заполните анкету один раз. Она станет первым сообщением кинологу.</p>
            {!state.chat &&
              INTAKE_FIELDS.map(([key, label, max]) => (
                <label key={key}>
                  {label}
                  {key === "petGender" ? (
                    <select
                      required
                      value={intake[key] ?? ""}
                      onChange={(e) => setIntake({ ...intake, [key]: e.target.value })}
                    >
                      <option value="">Выберите пол</option>
                      <option value="MALE">Мальчик</option>
                      <option value="FEMALE">Девочка</option>
                    </select>
                  ) : (
                    <textarea
                      required
                      maxLength={max}
                      value={intake[key] ?? ""}
                      onChange={(e) => setIntake({ ...intake, [key]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? "Создание диалога…" : state.chat ? "Продолжить создание" : "Начать переписку"}
            </PrimaryButton>
          </form>
        )}
      {state && session && session.userId === `gafus-${accountId}` && (
        <ConnectedChat
          key={`${session.userId}:${session.channelId}`}
          state={state}
          session={session}
          refresh={refresh}
          chatId={chatId}
        />
      )}
      {state?.chat?.provisionStatus === "READY" && !session && !error && (
        <LoadingState message="Подключение…" />
      )}
    </main>
  );
}
