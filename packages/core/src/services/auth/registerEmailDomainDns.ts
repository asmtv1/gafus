import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";

const TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
type Verdict = "accept" | "reject" | "unknown";
const cache = new Map<string, { verdict: Verdict; expiresAt: number }>();

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code) : undefined;
}

async function queryDomain(resolver: Resolver, domain: string): Promise<Verdict> {
  try {
    const mx = await resolver.resolveMx(domain);
    // c-ares can represent the DNS root label as an empty exchange.
    if (mx.length === 1 && mx[0]?.priority === 0 &&
        (mx[0].exchange === "." || mx[0].exchange === "")) return "reject";
    if (mx.some((record) => record.exchange !== "" && record.exchange !== ".")) return "accept";
    if (mx.length > 0) return "unknown"; // Malformed/conflicting MX: fail open.
  } catch (error) {
    if (errorCode(error) === "ENOTFOUND") return "reject";
    if (errorCode(error) !== "ENODATA") return "unknown";
  }

  // SMTP implicit MX: only fall back when MX is absent, never on a DNS failure.
  const address = async (lookup: () => Promise<string[]>): Promise<Verdict> => {
    try {
      return (await lookup()).length > 0 ? "accept" : "reject";
    } catch (error) {
      return ["ENODATA", "ENOTFOUND"].includes(errorCode(error) ?? "") ? "reject" : "unknown";
    }
  };
  const results = await Promise.all([
    address(() => resolver.resolve4(domain)),
    address(() => resolver.resolve6(domain)),
  ]);
  if (results.includes("accept")) return "accept";
  return results.every((result) => result === "reject") ? "reject" : "unknown";
}

/** Server-only infrastructure check; does not verify the mailbox or send mail.
 * Definitive verdicts are cached per process. Temporary failures are allowed and never cached.
 */
export async function canRegisterEmailDomain(domain: string): Promise<boolean> {
  const key = domainToASCII(domain.toLowerCase());
  if (!key) return true;
  const now = Date.now();
  for (const [cachedDomain, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(cachedDomain);
  }
  const cached = cache.get(key);
  if (cached) return cached.verdict !== "reject";

  const resolver = new Resolver();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const verdict = await Promise.race([
      queryDomain(resolver, key),
      new Promise<Verdict>((resolve) => {
        timer = setTimeout(() => resolve("unknown"), TIMEOUT_MS);
      }),
    ]);
    if (verdict !== "unknown") {
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { verdict, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return verdict !== "reject";
  } finally {
    clearTimeout(timer);
    resolver.cancel();
  }
}
