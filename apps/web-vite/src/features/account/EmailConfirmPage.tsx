import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { RouteLink } from "../../shared/router/location";
import { accountOperationError, confirmEmailChange } from "./accountApi";
import {PrimaryButton} from "../../shared/ui";

function initialToken(): string {
  if (typeof window === "undefined") return "";
  const tokens = new URLSearchParams(window.location.search).getAll("token");
  // Two capabilities in one link are ambiguous: do not select either.
  return tokens.length === 1 ? tokens[0].trim() : "";
}

function scrubTokenFromAddress(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  window.history.replaceState(window.history.state, "",
    url.pathname + url.search + url.hash);
}

/** Public capability flow: no useCurrentUser, no cookie or auth lookup on GET. */
export function EmailConfirmPage() {
  const [token, setToken] = useState(initialToken);
  const [state, setState] = useState<"ready" | "pending" | "success">("ready");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const done = useRef(false);
  const tokenGeneration = useRef(0);

  useLayoutEffect(() => {
    // Scrub on the initial deep link and after same-path browser navigation.
    // This only controls client history; real GET HTTP/log privacy needs AG4.
    scrubTokenFromAddress();
    function onLocationChange() {
      if (window.location.pathname !== "/profile/confirm-email") return;
      const nextToken = initialToken();
      scrubTokenFromAddress();
      // An already-sent prior capability can finish on the backend, but its
      // response must never mark a DIFFERENT newly opened link as confirmed.
      tokenGeneration.current += 1;
      inFlight.current = false;
      done.current = false;
      setToken(nextToken);
      setState("ready");
      setError("");
    }
    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("gafus:route-change", onLocationChange);
    return () => {
      tokenGeneration.current += 1;
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("gafus:route-change", onLocationChange);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || done.current) return;
    if (token.length < 32 || token.length > 128) {
      setError("Ссылка недействительна. Откройте письмо с новой ссылкой.");
      return;
    }
    inFlight.current = true;
    const submissionGeneration = tokenGeneration.current;
    setState("pending");
    setError("");
    try {
      await confirmEmailChange(token);
      if (submissionGeneration !== tokenGeneration.current) return;
      done.current = true;
      setToken("");
      setState("success");
    } catch (caught) {
      if (submissionGeneration !== tokenGeneration.current) return;
      setError(accountOperationError(caught, "confirm"));
      setState("ready");
    } finally {
      if (submissionGeneration === tokenGeneration.current) {
        inFlight.current = false;
      }
    }
  }

  return <main className="shell">
    <section className="account-card">
      {state === "success" ? <>
        <h1>Email подтверждён</h1>
        <p role="status">Адрес электронной почты обновлён.</p>
        <RouteLink to="/login">Войти</RouteLink>
      </> : <>
        <h1>Подтвердить новый email</h1>
        <p>Открытие ссылки ничего не изменяет. Для подтверждения нажмите кнопку.</p>
        {token.length < 32 || token.length > 128 ? (
          <p role="alert">Ссылка недействительна или неполная.</p>
        ) : <form onSubmit={submit}>
          <PrimaryButton type="submit" disabled={state === "pending"}>
            {state === "pending" ? "Подтверждаем…" : "Подтвердить email"}
          </PrimaryButton>
        </form>}
        {error && <p role="alert">{error}</p>}
        <RouteLink to="/login">Ко входу</RouteLink>
      </>}
    </section>
  </main>;
}
