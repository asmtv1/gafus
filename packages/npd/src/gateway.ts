export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type NpdErrorCode = "UNAUTHORIZED" | "RATE_LIMITED" | "TIMEOUT" | "NETWORK" | "MALFORMED_RESPONSE" | "API_ERROR" | "AMBIGUOUS_WRITE" | "UNAVAILABLE" | "INVALID_CONFIGURATION" | "INVALID_INPUT";
export class NpdGatewayError extends Error {
  constructor(public readonly code: NpdErrorCode, message: string, public readonly status?: number, public readonly details?: Record<string, unknown>) { super(message); this.name = "NpdGatewayError"; }
}
export type SmsChallenge = { challengeToken: string; expiresIn?: number };
export type Tokens = { accessToken: string; refreshToken: string; expiresAt?: string; profile?: NpdProfile };
export type NpdProfile = { inn: string; displayName?: string; phone?: string; email?: string };
export type NpdReceipt = { receiptUuid: string; printUrl: string; jsonUrl: string; totalAmount?: number; cancelled?: boolean };
/** `amount` is a decimal string with at most two fractional digits; never pass a JS float. */
export type CreateReceiptInput = { inn: string; operationAt: Date; services: { name: string; amount: string; quantity?: number }[]; buyer?: { displayName?: string; inn?: string; phone?: string; incomeType?: "FROM_INDIVIDUAL" | "FROM_LEGAL_ENTITY" | "FROM_FOREIGN_AGENCY" }; paymentType?: "CASH" | "ACCOUNT" };
export type CancelReceiptInput = { receiptUuid: string; reason: "CANCEL" | "REFUND"; operationAt?: Date; comment?: string };

const PRODUCTION_HOST = "lknpd.nalog.ru";
const secretPattern = /(bearer\s+|refreshToken["':=\s]+|challengeToken["':=\s]+|\btoken["':=\s]+)([^\s",}]+)/gi;
export function redactNpd(value: unknown): string { return String(value).replace(secretPattern, "$1[REDACTED]").slice(0, 1024); }
const object = (value: unknown, context: string): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new NpdGatewayError("MALFORMED_RESPONSE", `${context}: expected JSON object`); return value as Record<string, unknown>; };
const string = (data: Record<string, unknown>, key: string, context: string): string => { if (typeof data[key] !== "string" || !data[key]) throw new NpdGatewayError("MALFORMED_RESPONSE", `${context}: missing ${key}`); return data[key] as string; };

export class NpdGateway {
  private accessToken?: string;
  private readonly baseUrl: URL;
  constructor(private readonly options: { deviceId: string; accessToken?: string; timeoutMs?: number; baseUrl?: string; fetch?: FetchLike }) {
    this.baseUrl = new URL(options.baseUrl ?? "https://lknpd.nalog.ru/api/v1");
    if (this.baseUrl.protocol !== "https:" || this.baseUrl.hostname !== PRODUCTION_HOST) throw new NpdGatewayError("INVALID_CONFIGURATION", "NPD base URL is not allowlisted");
    this.accessToken = options.accessToken;
  }
  async startSms(phone: string): Promise<SmsChallenge> { const data = await this.request("POST", "https://lknpd.nalog.ru/api/v2/auth/challenge/sms/start", { phone: normalizePhone(phone), requireTpToBeActive: true, deviceData: { sourceType: "WEB" } }, false); return { challengeToken: string(data, "challengeToken", "startSms"), expiresIn: typeof data.expireIn === "number" ? data.expireIn : undefined }; }
  async completeSms(phone: string, challengeToken: string, smsCode: string): Promise<Tokens> { return this.takeTokens(await this.request("POST", "auth/challenge/sms/verify", { phone: normalizePhone(phone), challengeToken, code: smsCode, deviceInfo: this.deviceInfo() }, false), "completeSms"); }
  async refresh(refreshToken: string): Promise<Tokens> { return this.takeTokens(await this.request("POST", "auth/token", { refreshToken, deviceInfo: this.deviceInfo() }, false), "refresh"); }
  async getProfile(): Promise<NpdProfile> { const data = await this.request("GET", "user"); return { inn: string(data, "inn", "getProfile"), displayName: optional(data, "displayName"), phone: optional(data, "phone"), email: optional(data, "email") }; }
  async createReceipt(input: CreateReceiptInput): Promise<NpdReceipt> {
    const services = input.services.map((service) => ({ ...service, ...decimalService(service) }));
    const totalKopecks = services.reduce((sum, service) => checkedAdd(sum, checkedMultiply(service.amountKopecks, service.quantity)), 0);
    try {
      const data = await this.request("POST", "income", { operationTime: iso(input.operationAt), requestTime: iso(new Date()), paymentType: input.paymentType ?? "ACCOUNT", ignoreMaxTotalIncomeRestriction: false, client: { incomeType: input.buyer?.incomeType ?? "FROM_INDIVIDUAL", displayName: input.buyer?.displayName ?? null, contactPhone: input.buyer?.phone ?? null, inn: input.buyer?.inn ?? null }, services: services.map(({ amountKopecks: _amountKopecks, ...service }) => ({ ...service, amount: kopecksToDecimal(_amountKopecks) })), totalAmount: kopecksToDecimal(totalKopecks) }, true);
      try { return this.receipt(input.inn, string(data, "approvedReceiptUuid", "createReceipt")); }
      catch (error) { if (error instanceof NpdGatewayError) throw new NpdGatewayError("AMBIGUOUS_WRITE", "NPD create receipt outcome is ambiguous"); throw error; }
    } catch (error) {
      if (error instanceof NpdGatewayError) throw error;
      throw new NpdGatewayError("AMBIGUOUS_WRITE", "NPD create receipt outcome is ambiguous");
    }
  }
  async getReceipt(inn: string, receiptUuid: string): Promise<NpdReceipt> { const data = await this.request("GET", `receipt/${encodeURIComponent(inn)}/${encodeURIComponent(receiptUuid)}/json`); return { ...this.receipt(inn, receiptUuid), totalAmount: typeof data.totalAmount === "number" ? data.totalAmount : undefined, cancelled: data.cancellationInfo != null }; }
  async listRecentReceipts(): Promise<NpdReceipt[]> { throw new NpdGatewayError("UNAVAILABLE", "NPD receipt-list protocol is not fixture-evidenced; production reconciliation must remain disabled"); }
  async cancelReceipt(input: CancelReceiptInput): Promise<void> { await this.request("POST", "cancel", { receiptUuid: input.receiptUuid, comment: input.comment ?? (input.reason === "REFUND" ? "Возврат средств" : "Чек сформирован ошибочно"), operationTime: iso(input.operationAt ?? new Date()), requestTime: iso(new Date()), partnerCode: null }, true); }
  private receipt(inn: string, receiptUuid: string): NpdReceipt { const root = this.baseUrl.toString().replace(/\/$/, ""); const id = encodeURIComponent(receiptUuid); return { receiptUuid, printUrl: `${root}/receipt/${encodeURIComponent(inn)}/${id}/print`, jsonUrl: `${root}/receipt/${encodeURIComponent(inn)}/${id}/json` }; }
  private deviceInfo() { return { sourceDeviceId: this.options.deviceId, sourceType: "WEB", appVersion: "gafus-npd/1", metaDetails: { userAgent: "gafus-npd" } }; }
  private takeTokens(data: Record<string, unknown>, context: string): Tokens { const accessToken = string(data, "token", context); const refreshToken = string(data, "refreshToken", context); this.accessToken = accessToken; const profile = data.profile && typeof data.profile === "object" ? data.profile as Record<string, unknown> : undefined; return { accessToken, refreshToken, expiresAt: optional(data, "tokenExpireIn"), profile: profile && typeof profile.inn === "string" ? { inn: profile.inn, displayName: optional(profile, "displayName"), phone: optional(profile, "phone") } : undefined }; }
  private async request(method: string, endpoint: string, body?: unknown, write = false): Promise<Record<string, unknown>> { const url = endpoint.startsWith("http") ? new URL(endpoint) : new URL(endpoint, `${this.baseUrl.toString().replace(/\/$/, "")}/`); if (url.protocol !== "https:" || url.hostname !== PRODUCTION_HOST) throw new NpdGatewayError("INVALID_CONFIGURATION", "NPD request host is not allowlisted"); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000); try { const response = await (this.options.fetch ?? fetch)(url.toString(), { method, signal: controller.signal, headers: { Accept: "application/json", "Content-Type": "application/json", ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const raw = await response.text(); let parsed: unknown; try { parsed = raw ? JSON.parse(raw) : {}; } catch { throw new NpdGatewayError(write ? "AMBIGUOUS_WRITE" : "MALFORMED_RESPONSE", "NPD returned malformed JSON", response.status); } if (!response.ok) { const api = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; const duplicate = String(api.code ?? "").toUpperCase().includes("DUPLICATE"); if (write && (response.status === 408 || response.status >= 500 || duplicate)) throw new NpdGatewayError("AMBIGUOUS_WRITE", "NPD write delivery is ambiguous", response.status, { code: redactNpd(api.code) }); const code: NpdErrorCode = response.status === 401 ? "UNAUTHORIZED" : response.status === 429 ? "RATE_LIMITED" : "API_ERROR"; throw new NpdGatewayError(code, redactNpd(api.message ?? `NPD HTTP ${response.status}`), response.status, { code: redactNpd(api.code) }); } return object(parsed, "NPD response"); } catch (error) { if (error instanceof NpdGatewayError) throw error; const code: NpdErrorCode = write ? "AMBIGUOUS_WRITE" : error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK"; throw new NpdGatewayError(code, code === "AMBIGUOUS_WRITE" ? "NPD write delivery is ambiguous" : "NPD request failed"); } finally { clearTimeout(timer); } }
}
const optional = (data: Record<string, unknown>, key: string) => typeof data[key] === "string" ? data[key] as string : undefined;
const normalizePhone = (phone: string) => { const digits = phone.replace(/\D/g, ""); return digits.length === 10 ? `7${digits}` : digits.startsWith("8") && digits.length === 11 ? `7${digits.slice(1)}` : digits; };
const iso = (date: Date) => date.toISOString().replace("Z", "+00:00");
const decimalService = (service: CreateReceiptInput["services"][number]) => {
  if (!Number.isSafeInteger(service.quantity ?? 1) || (service.quantity ?? 1) < 1) throw new NpdGatewayError("INVALID_INPUT", "Receipt quantity must be a positive integer");
  return { amountKopecks: decimalToKopecks(service.amount), quantity: service.quantity ?? 1 };
};
export const decimalToKopecks = (value: string): number => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new NpdGatewayError("INVALID_INPUT", "Receipt amount must be an exact non-negative decimal with at most two fractional digits");
  const [whole, fraction = ""] = value.split(".");
  const kopecks = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(kopecks)) throw new NpdGatewayError("INVALID_INPUT", "Receipt amount is outside the supported kopeck range");
  return kopecks;
};
const kopecksToDecimal = (kopecks: number) => `${Math.floor(kopecks / 100)}.${String(kopecks % 100).padStart(2, "0")}`;
const checkedMultiply = (left: number, right: number) => { const value = left * right; if (!Number.isSafeInteger(value)) throw new NpdGatewayError("INVALID_INPUT", "Receipt total is outside the supported kopeck range"); return value; };
const checkedAdd = (left: number, right: number) => { const value = left + right; if (!Number.isSafeInteger(value)) throw new NpdGatewayError("INVALID_INPUT", "Receipt total is outside the supported kopeck range"); return value; };
