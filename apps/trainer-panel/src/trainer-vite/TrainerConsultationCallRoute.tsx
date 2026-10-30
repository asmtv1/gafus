import { useMemo, type ReactElement } from "react";
import { z } from "zod/v3";
import { VoxConsultationRoom } from "../../../../packages/ui-components/src/VoxConsultationRoom";
import type { PanelActor } from "./consultationContract";

const segment = /^[A-Za-z0-9_-]{1,128}$/;
const prepared = z.object({
  success: z.literal(true),
  data: z.object({
    username: z.string().min(1).max(240),
    room: z.string().regex(/^gafus_[a-f0-9]{30}$/),
  }).strict(),
}).strict();
const signature = z.object({
  success: z.literal(true), token: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();
const admission = z.object({
  success: z.literal(true),
  data: z.object({
    admission: z.string().regex(/^\d{10}\.[a-f0-9]{64}$/),
    expires: z.number().int().positive(),
  }).strict(),
}).strict();

export function trainerCallBookingId(pathname: string): string | null {
  const match = /^\/main-panel\/consultations\/call\/([^/]+)\/?$/.exec(pathname);
  return match && segment.test(match[1]!) ? match[1]! : null;
}

type CurrentSession = () => {
  actor: PanelActor; token: string | null; authEpoch?: string;
} | null;

/**
 * Strictly cookie-authenticated browser adapter. The Hono Core permission
 * guard rechecks booking participant, CONFIRMED status and call time window
 * for EVERY endpoint, including sign and admission; no Vox secrets in browser.
 */
export function createTrainerCallOperations(input: {
  bookingId: string; actor: PanelActor; token: string | null;
  authEpoch?: string; getCurrentSession: CurrentSession;
  fetchImpl: typeof fetch;
}) {
  const current = () => {
    const session = input.getCurrentSession();
    return !!input.token && !!input.authEpoch && !!session &&
      session.actor.id === input.actor.id &&
      session.actor.role === input.actor.role &&
      session.authEpoch === input.authEpoch &&
      session.token === input.token &&
      (input.actor.role === "TRAINER" || input.actor.role === "ADMIN");
  };
  const request = async <T,>(
    bookingId: string, operation: "prepare" | "sign" | "admission",
    body: object, schema: z.ZodType<T>,
  ): Promise<{ success: true; parsed: T } | { success: false; error: string }> => {
    if (!current() || bookingId !== input.bookingId || !segment.test(bookingId))
      return { success: false, error: "Сессия изменилась. Откройте страницу заново." };
    try {
      const response = await input.fetchImpl(
        "/api/v1/consultations/bookings/" + encodeURIComponent(bookingId) +
        "/voximplant/" + operation,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), cache: "no-store" },
      );
      if (!current()) return { success: false, error: "Сессия завершена." };
      if (!response.headers.get("cache-control")?.includes("no-store"))
        throw Error("UNSAFE_CALL_CACHE");
      const raw: unknown = await response.json();
      if (!response.ok) return {
        success: false,
        error: response.status === 403 || response.status === 404
          ? "Нет доступа к этой видеовстрече или время входа ещё не наступило."
          : response.status === 503 ? "Видеосвязь сейчас недоступна."
          : "Не удалось подключиться к видеовстрече.",
      };
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw Error("INVALID_VOX_RESPONSE");
      return { success: true, parsed: parsed.data };
    } catch {
      return { success: false, error: "Не удалось связаться с сервисом видеозвонков." };
    }
  };
  return {
    prepare: async (bookingId: string) => {
      const result = await request(bookingId, "prepare", {}, prepared);
      return result.success
        ? { success: true as const, data: result.parsed.data }
        : result;
    },
    signKey: async (bookingId: string, key: string) => {
      if (!/^[\x21-\x7e]{8,512}$/.test(key))
        return { success: false as const, error: "Некорректный ключ видеосвязи." };
      const result = await request(bookingId, "sign", { key }, signature);
      return result.success
        ? { success: true as const, token: result.parsed.token }
        : result;
    },
    authorizeJoin: async (bookingId: string) => {
      const result = await request(bookingId, "admission", {}, admission);
      return result.success
        ? { success: true as const, data: result.parsed.data }
        : result;
    },
  };
}

export function TrainerConsultationCallRoute(props: {
  pathname: string; actor: PanelActor; token: string | null;
  authEpoch?: string; getCurrentSession?: CurrentSession;
  fetchImpl: typeof fetch;
}): ReactElement {
  const bookingId = trainerCallBookingId(props.pathname);
  const session = props.getCurrentSession?.();
  const allowed = !!bookingId && !!session && !!props.token && !!props.authEpoch &&
    (props.actor.role === "TRAINER" || props.actor.role === "ADMIN") &&
    session.actor.id === props.actor.id && session.actor.role === props.actor.role &&
    session.token === props.token && session.authEpoch === props.authEpoch;
  const operations = useMemo(() => createTrainerCallOperations({
    bookingId: bookingId ?? "", actor: props.actor, token: props.token,
    authEpoch: props.authEpoch,
    getCurrentSession: props.getCurrentSession ?? (() => null),
    fetchImpl: props.fetchImpl,
  }), [bookingId, props.actor, props.token,
    props.authEpoch, props.getCurrentSession, props.fetchImpl]);
  if (!allowed || !bookingId) return <main><h1>Видеоконсультация</h1>
    <p role="alert">Нет доступа к видеовстрече.</p></main>;
  return <VoxConsultationRoom
    bookingId={bookingId}
    backHref="/main-panel/consultations"
    prepare={operations.prepare}
    signKey={operations.signKey}
    authorizeJoin={operations.authorizeJoin}
  />;
}
