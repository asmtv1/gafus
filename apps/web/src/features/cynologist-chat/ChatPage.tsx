"use client";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { reportClientError } from "@gafus/error-handling";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chat, Channel, Window, MessageList, useCreateChatClient } from "stream-chat-react";
import type {
  CynologistChatStateDto,
  CynologistChatSessionDto,
  CynologistIntake,
} from "@gafus/consultation-shared";
import {
  cynologistIntakeSchema,
  INTAKE_FIELDS,
  CHAT_REPLY_COPY,
  CHAT_HOURS_COPY,
} from "@gafus/consultation-shared";
import { PrimaryButton } from "@/shared/components/ui/PrimaryButton";
import { useChatResource } from "./useChatResource";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import "stream-chat-react/css/index.css";

export function ConnectedChat({
  state,
  session,
  refresh,
  chatId,
  community = false,
}: {
  state: Pick<CynologistChatStateDto, "canSend">;
  session: CynologistChatSessionDto;
  refresh: () => Promise<void>;
  chatId?: string;
  community?: boolean;
}) {
  const userData = useMemo(() => ({ id: session.userId }), [session.userId]);
  const tokenOrProvider = useCallback(
    async () =>
      (await chatApi<CynologistChatSessionDto>("session", { method: "POST", chatId, community }))
        .token,
    [chatId, community],
  );
  const client = useCreateChatClient({ apiKey: session.apiKey, userData, tokenOrProvider });
  const channel = useMemo(
    () => client?.channel(session.channelType, session.channelId),
    [client, session.channelType, session.channelId],
  );
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [retrying, setRetrying] = useState(false);
  const operation = useRef(false);
  async function send() {
    if (operation.current || !state.canSend || (!text.trim() && !files.length)) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await chatApi("messages", {
        method: "POST",
        chatId,
        community,
        body: { clientMessageId: requestId, text, attachmentIds: files.map((f) => f.id) },
      });
      setText("");
      setFiles([]);
      setRequestId(crypto.randomUUID());
      setRetrying(false);
    } catch (e) {
      reportClientError(e, { issueKey: "ChatPage", keys: { operation: "request" } });
      setRetrying(true);
      setError((e as Error).message);
      await refresh().catch(() => undefined);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (operation.current || retrying || !state.canSend || files.length >= 5) return;
    const image = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const video = ["video/mp4", "video/quicktime"].includes(file.type);
    if ((!image && !video) || file.size > (image ? 10 : 100) * 1024 * 1024) {
      setError("Выберите фото до 10 МБ или видео до 100 МБ.");
      return;
    }
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await chatApi<{ id: string; name: string }>("attachments", {
        method: "POST",
        chatId,
        community,
        body,
      });
      setFiles((prev) => [...prev, result]);
    } catch (e) {
      reportClientError(e, { issueKey: "ChatPage", keys: { operation: "request" } });
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  if (!client || !channel) return <LoadingState message="Подключение к диалогу…" />;
  return (
    <div className={styles.dialog}>
      <Chat client={client}>
        <Channel
          channel={channel}
          markReadOnMount={!community}
          doMarkReadRequest={community ? () => undefined : undefined}
        >
          <Window>
            <MessageList messageActions={[]} disableQuotedMessages />
          </Window>
        </Channel>
      </Chat>
      {!state.canSend ? (
        <p>
          {community ? (
            "Общий чат временно недоступен."
          ) : (
            <>
              История доступна. <Link href="/subscription">Продлите тариф</Link>, чтобы отправлять
              сообщения.
            </>
          )}
        </p>
      ) : (
        <div className={styles.composer}>
          <textarea
            aria-label="Сообщение"
            maxLength={5000}
            value={text}
            disabled={busy || retrying}
            onChange={(e) => {
              setText(e.target.value);
              void channel?.keystroke().catch(() => undefined);
            }}
          />
          {files.map((f) => (
            <span key={f.id}>
              {f.name}{" "}
              <button
                type="button"
                aria-label={`Убрать ${f.name}`}
                disabled={busy || retrying}
                onClick={() => setFiles((old) => old.filter((file) => file.id !== f.id))}
              >
                ×
              </button>
            </span>
          ))}
          <label>
            Фото или видео
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              disabled={busy || retrying || files.length >= 5}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
          <small>Фото до 10 МБ · видео H.264 до 100 МБ и двух минут</small>
          <PrimaryButton
            disabled={busy || (!text.trim() && !files.length)}
            onClick={() => void send()}
          >
            {busy ? "Отправка…" : retrying ? "Повторить отправку" : "Отправить"}
          </PrimaryButton>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
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
