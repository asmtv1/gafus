import { useEffect, useRef, useState } from "react";
import type { PanelActor } from "./consultationContract";
import type { VisibleStepTransport } from "./TrainerVisibleStepsOptInRoute";

export type AuthoringPath = "/api/v1/trainer/authoring/steps" |
  "/api/v1/trainer/authoring/days" | "/api/v1/trainer/authoring/articles" |
  "/api/v1/trainer/authoring/courses";
export type TrainerAuthoringTransport = (request: {
  method: "POST"; path: AuthoringPath; body: unknown; signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export type TrainerAuthoringProps = {
  pathname: string;
  search?: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enableAuthoring?: boolean;
  authoringTransport?: TrainerAuthoringTransport;
  visibleStepsTransport?: VisibleStepTransport;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
};
export function useTrainerAuthoring(p: TrainerAuthoringProps, path: string) {
  const [phase, setPhase] = useState<"idle" | "pending" | "success" | "error" | "denied">("idle");
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const sessionRef = useRef(p.getCurrentSession);
  sessionRef.current = p.getCurrentSession;
  const identity = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, p.pathname]);
  const isCurrent = () => {
    const s = sessionRef.current ? sessionRef.current() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!s && s.actor.id === p.actor.id && s.actor.role === p.actor.role &&
      s.token === p.token && s.authEpoch === p.authEpoch;
  };
  const allowed = p.pathname === path && !!p.token && !!p.authEpoch &&
    p.enableAuthoring === true && !!p.authoringTransport &&
    (p.actor.role === "TRAINER" || p.actor.role === "ADMIN") && isCurrent();
  useEffect(() => {
    setPhase("idle"); setMessage("");
    busy.current = false;
    return () => { request.current?.abort(); request.current = null; busy.current = false; };
  }, [identity]);
  async function submit(body: unknown, endpoint: AuthoringPath) {
    if (!allowed || busy.current || phase === "success") return;
    busy.current = true;
    const controller = new AbortController();
    request.current = controller;
    setPhase("pending"); setMessage("");
    try {
      const result = await p.authoringTransport!({
        method: "POST", path: endpoint, body, signal: controller.signal,
      });
      if (controller.signal.aborted || !isCurrent()) return;
      const cache = (result.headers["cache-control"] ?? "").toLowerCase().split(",")
        .map(value => value.trim());
      if (!cache.includes("private") || !cache.includes("no-store") ||
        cache.includes("public")) throw Error("UNSAFE_CACHE");
      if (result.status === 401 || result.status === 403) {
        setPhase("denied"); setMessage("Недостаточно прав для сохранения");
      } else if (result.status === 201 && result.body &&
          typeof result.body === "object" && "success" in result.body &&
          result.body.success === true && "data" in result.body && result.body.data &&
          typeof result.body.data === "object" && "id" in result.body.data &&
          typeof result.body.data.id === "string" &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(result.body.data.id)) {
        setPhase("success");
      } else if (result.status === 400) {
        setPhase("error"); setMessage("Проверьте заполнение формы");
      } else {
        setPhase("error"); setMessage("Сохранение не удалось. Проверьте данные и повторите попытку");
      }
    } catch {
      if (!controller.signal.aborted && isCurrent()) {
        setPhase("error"); setMessage("Ошибка сети или ответа сервера");
      }
    } finally {
      if (request.current === controller) request.current = null;
      busy.current = false;
    }
  }
  return { allowed, phase, message, submit, isCurrent };
}
