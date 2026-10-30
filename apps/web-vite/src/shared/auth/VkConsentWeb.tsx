import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { recordExplicitLogin } from "./useAuth";
import { registrationAttemptId, clearRegistrationAttempt } from "./registrationSession";
import type { AuthUser } from "./authApi";
import { RouteLink, navigate } from "../router/location";
import { PrimaryButton, SecondaryButtonLink } from "../ui";

const documents = [
  { key: "acceptPersonalData", label: "обработку персональных данных", href: "/personal.html" },
  { key: "acceptPrivacyPolicy", label: "Политику конфиденциальности", href: "/policy.html" },
  { key: "acceptDataDistribution", label: "публикацию данных в профиле", href: "/personal-distribution.html" },
] as const;

/** VK ID first-time registration must finish the same three legal consents
 * as password registration before a live Web auth cookie may be issued.
 * OAuth nonce/context are only in signed HttpOnly cookies, never URL/JS.
 */
export function VkConsentWeb() {
  const cache = useQueryClient();
  const [tempSessionId] = useState(() => registrationAttemptId(window.sessionStorage));
  const [accepted, setAccepted] = useState({
    acceptPersonalData: false, acceptPrivacyPolicy: false, acceptDataDistribution: false,
  });
  const [promoCode, setPromoCode] = useState("");
  const [error, setError] = useState("");
  const context = useQuery({
    queryKey: ["vk-consent", "web-context"],
    queryFn: () => apiRequest<{ selectedPromoCode: string | null }>(
      "/api/v1/auth/vk-web/consent"),
    retry: false, staleTime: 0,
  });
  const complete = useMutation({
    mutationFn: () => apiRequest<{ user: AuthUser }>("/api/v1/auth/vk-web/consent", {
      method: "POST", browserAuth: true, json: {
        tempSessionId, consentPayload: accepted,
        ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
      },
    }),
    onSuccess: ({ user }) => {
      clearRegistrationAttempt(window.sessionStorage);
      recordExplicitLogin(cache, user);
      navigate("/courses");
    },
    onError: () => setError("Не удалось завершить регистрацию через VK. Попробуйте снова."),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (complete.isPending) return;
    setError("");
    if (!Object.values(accepted).every(Boolean)) {
      setError("Подтвердите все три согласия для продолжения.");
      return;
    }
    complete.mutate();
  }
  if (context.isPending) return <main className="shell" role="status">Проверяем регистрацию VK…</main>;
  if (context.isError) return <main className="shell" role="alert">
    Сессия регистрации через VK истекла или недоступна.
    <p><RouteLink to="/login">Повторить вход</RouteLink></p>
  </main>;
  return <main className="shell" aria-label="Согласия для регистрации VK">
    <h1>Завершить регистрацию через VK</h1>
    <p>Подтвердите согласия, чтобы создать аккаунт Гафус.</p>
    <form onSubmit={submit}>
      {documents.map(document => <label key={document.key}>
        <input type="checkbox" required checked={accepted[document.key]}
          onChange={event => setAccepted(previous => ({
            ...previous, [document.key]: event.target.checked,
          }))} />
        <span>Согласен(на) на <a href={document.href} target="_blank" rel="noopener noreferrer">
          {document.label}</a></span>
      </label>)}
      <label htmlFor="vk-web-promo">Промокод (необязательно)</label>
      <input id="vk-web-promo" value={promoCode} maxLength={64}
        onChange={event => setPromoCode(event.target.value)}
        placeholder={context.data?.selectedPromoCode ?? ""} />
      {error && <p role="alert">{error}</p>}
      <PrimaryButton type="submit" disabled={complete.isPending}>
        {complete.isPending ? "Завершаем…" : "Создать аккаунт"}
      </PrimaryButton>
    </form>
    <p><SecondaryButtonLink href="/login" variant="red">Отмена</SecondaryButtonLink></p>
  </main>;
}
