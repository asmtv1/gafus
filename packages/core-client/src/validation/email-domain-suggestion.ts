/**
 * Расстояние Sift3 между двумя строками (алгоритм из mailcheck).
 * Лёгкая нечёткая метрика — нет внешних зависимостей.
 */
function sift3Distance(s1: string, s2: string): number {
  if (!s1 || s1.length === 0) return s2?.length ?? 0;
  if (!s2 || s2.length === 0) return s1.length;

  let c = 0;
  let offset1 = 0;
  let offset2 = 0;
  let lcs = 0;
  const maxOffset = 5;

  while (c + offset1 < s1.length && c + offset2 < s2.length) {
    if (s1[c + offset1] === s2[c + offset2]) {
      lcs++;
    } else {
      offset1 = 0;
      offset2 = 0;
      for (let i = 0; i < maxOffset; i++) {
        if (c + i < s1.length && s1[c + i] === s2[c]) {
          offset1 = i;
          break;
        }
        if (c + i < s2.length && s1[c] === s2[c + i]) {
          offset2 = i;
          break;
        }
      }
    }
    c++;
  }

  return (s1.length + s2.length) / 2 - lcs;
}

/**
 * Популярные почтовые домены — достаточно покрыть > 90% кейсов.
 */
const KNOWN_DOMAINS: readonly string[] = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "hotmail.ru",
  "outlook.com",
  "outlook.ru",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "mail.ru",
  "yandex.ru",
  "ya.ru",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  "rambler.ru",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
];

/** Максимальное расстояние, при котором предлагаем исправление. */
const DOMAIN_THRESHOLD = 2;

export interface RegisterEmailDomainSuggestion {
  address: string;
  domain: string;
  full: string;
}

/**
 * Подсказка при опечатке в домене. Не блокирует ввод — только для UI.
 * @param rawEmail — строка из поля до нормализации на сервере
 */
export function suggestRegisterEmailDomain(
  rawEmail: string,
): RegisterEmailDomainSuggestion | null {
  try {
    const email = rawEmail.trim().toLowerCase();
    const atIndex = email.lastIndexOf("@");
    if (atIndex <= 0 || atIndex >= email.length - 1) {
      return null;
    }

    const address = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);

    if (!domain || !address) {
      return null;
    }

    let closestDomain: string | null = null;
    let minDist = Infinity;

    for (const known of KNOWN_DOMAINS) {
      if (known === domain) {
        return null;
      }
      const dist = sift3Distance(domain, known);
      if (dist < minDist) {
        minDist = dist;
        closestDomain = known;
      }
    }

    if (closestDomain !== null && minDist <= DOMAIN_THRESHOLD) {
      return {
        address,
        domain: closestDomain,
        full: `${address}@${closestDomain}`,
      };
    }

    return null;
  } catch {
    return null;
  }
}
