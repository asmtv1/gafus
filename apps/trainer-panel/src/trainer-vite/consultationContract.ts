/** AG4 source-only consumer contract; no network, session, Next or Prisma. */
export type PanelActor = { role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" | "PARTNER" | "GUEST"; id: string };
export type StaffMethod = "GET" | "POST" | "PUT" | "DELETE";
export type ResultKind = "bookings" | "bookingId" | "availability" | "empty";
export type StaffDescriptor = { id: number; method: StaffMethod; route: string; result: ResultKind; requires: "trainerOwnOrAdmin" | "admin" };
export const trainerStaffMethods: readonly StaffDescriptor[] = [
  { id: 1, method: "GET", route: "/trainer/bookings", result: "bookings", requires: "trainerOwnOrAdmin" },
  { id: 2, method: "POST", route: "/trainer/bookings/:bookingId/confirm", result: "bookingId", requires: "trainerOwnOrAdmin" },
  { id: 3, method: "POST", route: "/trainer/bookings/:bookingId/complete", result: "bookingId", requires: "trainerOwnOrAdmin" },
  { id: 4, method: "POST", route: "/trainer/bookings/:bookingId/no-show", result: "bookingId", requires: "trainerOwnOrAdmin" },
  { id: 5, method: "POST", route: "/trainer/bookings/:bookingId/reject", result: "bookingId", requires: "trainerOwnOrAdmin" },
  { id: 6, method: "GET", route: "/trainer/availability", result: "availability", requires: "trainerOwnOrAdmin" },
  { id: 7, method: "PUT", route: "/trainer/availability", result: "empty", requires: "trainerOwnOrAdmin" },
  { id: 8, method: "POST", route: "/trainer/day-offs", result: "empty", requires: "trainerOwnOrAdmin" },
  { id: 9, method: "DELETE", route: "/trainer/day-offs/:dayOffId", result: "empty", requires: "trainerOwnOrAdmin" },
  { id: 10, method: "POST", route: "/trainer/exceptions", result: "empty", requires: "trainerOwnOrAdmin" },
  { id: 11, method: "DELETE", route: "/trainer/exceptions/:exceptionId", result: "empty", requires: "trainerOwnOrAdmin" },
];

/** UX guard only: server MUST independently enforce owner and roles. */
export function staffViewAllowed(actor: PanelActor, descriptor: StaffDescriptor, targetId?: string): boolean {
  if (actor.role === "ADMIN") return true;
  return descriptor.requires === "trainerOwnOrAdmin" && actor.role === "TRAINER" && (!targetId || targetId === actor.id);
}
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function nonempty(v: unknown): v is string { return typeof v === "string" && v.length > 0; }
function booking(v: unknown): boolean {
  return isRecord(v) && nonempty(v.id) && nonempty(v.status) &&
    isRecord(v.slot) && nonempty(v.slot.id) && nonempty(v.slot.startAtUtc) && nonempty(v.slot.endAtUtc) &&
    nonempty(v.cynologistUserId) && nonempty(v.confirmationDeadlineAt) && nonempty(v.createdAt);
}
/** Fail closed on malformed Hono success envelopes; no synthetic pagination. */
export function parseStaffSuccess(descriptor: StaffDescriptor, body: unknown): unknown {
  if (!isRecord(body) || body.success !== true || !Object.prototype.hasOwnProperty.call(body, "data")) throw new Error("INVALID_RESPONSE");
  const data = body.data;
  if (descriptor.result === "bookings") {
    if (!Array.isArray(data) || data.length > 200 || !data.every(booking)) throw new Error("INVALID_RESPONSE");
  } else if (descriptor.result === "bookingId") {
    if (!isRecord(data) || !nonempty(data.bookingId)) throw new Error("INVALID_RESPONSE");
  } else if (descriptor.result === "availability") {
    if (!isRecord(data) || typeof data.slotDurationMin !== "number" || !Number.isFinite(data.slotDurationMin) || data.slotDurationMin <= 0 ||
        !Array.isArray(data.rules) || !Array.isArray(data.dayOffs) || !Array.isArray(data.exceptions)) throw new Error("INVALID_RESPONSE");
  } else if (!isRecord(data) || Object.keys(data).length !== 0) throw new Error("INVALID_RESPONSE");
  return data;
}
export function parseStaffHttp(descriptor: StaffDescriptor, status: number, body: unknown, cacheHeader: string | null): unknown {
  if (!cacheHeader?.includes("no-store") || !cacheHeader.includes("private")) throw new Error("UNSAFE_CACHE");
  if (status === 200) return parseStaffSuccess(descriptor, body);
  if (![400, 401, 403, 404, 409, 500].includes(status) || !isRecord(body) || body.success !== false || typeof body.error !== "string") throw new Error("INVALID_RESPONSE");
  throw new Error(`STAFF_HTTP_${status}`);
}

/** Request fixture planning only. Never sends network requests or claims server RBAC. */
export function buildTrainerStaffRequest(descriptor: StaffDescriptor, actor: PanelActor, options: {
  targetTrainerId?: string; resourceId?: string; body?: unknown;
} = {}): { method: StaffMethod; path: string; body?: unknown } {
  if (!staffViewAllowed(actor, descriptor, options.targetTrainerId)) throw new Error("ROLE_DENIED");
  let route = descriptor.route;
  if (route.includes(":")) {
    if (!options.resourceId || !/^[a-zA-Z0-9_-]+$/.test(options.resourceId)) throw new Error("INVALID_RESOURCE_ID");
    route = route.replace(/:[a-zA-Z]+Id/, encodeURIComponent(options.resourceId));
  }
  const url = new URL(`/api/v1/consultations${route}`, "https://synthetic.invalid");
  if (actor.role === "ADMIN" && options.targetTrainerId && descriptor.id >= 6 && descriptor.id <= 11) {
    url.searchParams.set("trainerUserId", options.targetTrainerId);
  }
  const body = options.body;
  if (descriptor.id === 5 && body !== undefined && (!isRecord(body) || (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 500)))) throw new Error("INVALID_BODY");
  if (descriptor.id === 7 && (!isRecord(body) || !Array.isArray(body.rules) || body.rules.length === 0 || !body.rules.every(rule => isRecord(rule) && Number.isInteger(rule.weekday) && Number(rule.weekday) >= 0 && Number(rule.weekday) <= 6 && typeof rule.startTime === "string" && /^\d{2}:\d{2}$/.test(rule.startTime) && typeof rule.endTime === "string" && /^\d{2}:\d{2}$/.test(rule.endTime)))) throw new Error("INVALID_BODY");
  if (descriptor.id === 8 && (!isRecord(body) || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) throw new Error("INVALID_BODY");
  if (descriptor.id === 10 && (!isRecord(body) || typeof body.startAt !== "string" || typeof body.endAt !== "string" || !Number.isFinite(Date.parse(body.startAt)) || !Number.isFinite(Date.parse(body.endAt)) || Date.parse(body.endAt) <= Date.parse(body.startAt))) throw new Error("INVALID_BODY");
  return { method: descriptor.method, path: url.pathname + url.search, ...(body === undefined ? {} : { body }) };
}
