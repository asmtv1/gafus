import validator from "validator";
import { z } from "zod";

const IS_EMAIL_OPTS: validator.IsEmailOptions = {
  allow_utf8_local_part: false,
  require_tld: true,
  allow_ip_domain: false,
};

const IS_FQDN_OPTS: validator.IsFQDNOptions = {
  require_tld: true,
  allow_underscores: false,
  allow_trailing_dot: false,
};

/**
 * Проверка email после нормализации (нижний регистр): формат и домен как FQDN с TLD.
 * Использует пакет `validator` (не самописная регулярка).
 */
export function isRegisterEmailWithValidDomain(emailLowercase: string): boolean {
  if (!validator.isEmail(emailLowercase, IS_EMAIL_OPTS)) {
    return false;
  }
  const at = emailLowercase.lastIndexOf("@");
  if (at <= 0 || at === emailLowercase.length - 1) {
    return false;
  }
  const domain = emailLowercase.slice(at + 1);
  return validator.isFQDN(domain, IS_FQDN_OPTS);
}

/**
 * Поле email для регистрации: trim, lowerCase, длина, затем validator (email + FQDN домена).
 */
export const coreRegisterEmailSchema = z
  .string()
  .trim()
  .max(255, "максимум 255 символов")
  .transform((v) => v.toLowerCase())
  .refine((v) => isRegisterEmailWithValidDomain(v), {
    message: "Некорректный email или домен",
  });
