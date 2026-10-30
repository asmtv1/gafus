import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../shared/api/client";
import { navigate, RouteLink } from "../../shared/router/location";
import { NextProfileIcon } from "./NextProfileIcon";
import source from "../../brand/LegacySettingsActions.module.css";
import {SecondaryButton} from "../../shared/ui";

type Phase = "ready" | "confirm" | "pending" | "rejected" | "unknown";

/** The existing Core session-revocation transaction is the only authority.
 * Never retry an ambiguous logout-all POST: its SQL transaction may have
 * committed even when the browser did not receive a response. */
export function LogoutAllSessionsAction() {
  const cache = useQueryClient();
  const [phase, setPhase] = useState<Phase>("ready");
  const inFlight = useRef(false);
  const attempted = useRef(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (phase !== "confirm" || inFlight.current || attempted.current) return;
    attempted.current = true;
    inFlight.current = true;
    setError("");
    setPhase("pending");
    try {
      await apiRequest("/api/v1/auth/logout-all", {
        method: "POST", json: {}, browserAuth: true, expectedStatus: 200,
      });
      cache.clear();
      navigate("/");
    } catch (err) {
      // An explicit auth rejection is conclusive. A server/transport failure
      // is not: never claim remote devices have been logged out.
      const rejected = err instanceof ApiError && [400, 401, 403, 404].includes(err.status);
      setPhase(rejected ? "rejected" : "unknown");
      setError(rejected
        ? "Сессия не подтверждена. Войдите снова и повторите действие."
        : "Неизвестен результат завершения сеансов. Не отправляйте запрос повторно без нового входа.");
    } finally {
      inFlight.current = false;
    }
  }
  return <div className="next-profile-logout-all">
    {phase === "ready" && <button type="button"
      className={`${source.row} next-profile-settings-row`}
      onClick={() => setPhase("confirm")}>
      <NextProfileIcon name="logout"/><span>Выйти на всех устройствах</span>
      <span aria-hidden="true">›</span>
    </button>}
    {(phase === "confirm" || phase === "pending") && <div role="group"
      aria-label="Подтверждение выхода со всех устройств">
      <p>Завершить все сеансы, включая Web, Android и iOS? Потребуется повторный вход.</p>
      <SecondaryButton variant="red" type="button" disabled={phase === "pending"}
        onClick={() => void confirm()}>
        {phase === "pending" ? "Завершаем сеансы…" : "Да, выйти на всех устройствах"}
      </SecondaryButton>
      <SecondaryButton variant="red" type="button" disabled={phase === "pending"}
        onClick={() => setPhase("ready")}>Отмена</SecondaryButton>
    </div>}
    {(phase === "unknown" || phase === "rejected") && <div role="alert">
      <p>{error}</p><RouteLink to="/login">Войти заново</RouteLink>
    </div>}
  </div>;
}
