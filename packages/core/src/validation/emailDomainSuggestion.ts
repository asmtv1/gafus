import Mailcheck from "mailcheck";

/**
 * Популярные домены РФ/СНГ — дополняют встроенный список mailcheck (в основном западные).
 */
const REGISTER_EMAIL_EXTRA_DOMAINS: string[] = [
  "mail.ru",
  "yandex.ru",
  "ya.ru",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  "rambler.ru",
  "proton.me",
  "protonmail.com",
];

export interface RegisterEmailDomainSuggestion {
  address: string;
  domain: string;
  full: string;
}

function domainsForRegisterEmailHint(): string[] {
  return [...Mailcheck.defaultDomains, ...REGISTER_EMAIL_EXTRA_DOMAINS];
}

/**
 * Подсказка при опечатке в домене (mailcheck). Не блокирует ввод — только для UI.
 * @param rawEmail — как в поле, до нормализации на сервере
 */
export function suggestRegisterEmailDomain(
  rawEmail: string,
): RegisterEmailDomainSuggestion | null {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    return null;
  }

  const box: { current: RegisterEmailDomainSuggestion | null } = { current: null };
  Mailcheck.run({
    email,
    domains: domainsForRegisterEmailHint(),
    suggested: (s: { address: string; domain: string; full: string }) => {
      box.current = { address: s.address, domain: s.domain, full: s.full };
    },
  });

  const picked = box.current;
  if (picked === null) {
    return null;
  }
  if (picked.full === email) {
    return null;
  }
  return picked;
}
