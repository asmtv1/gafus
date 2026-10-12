import { createHash, createHmac, createSign } from "node:crypto";
import { prisma, ConsultationBookingStatus } from "@gafus/prisma";
import { ConsultationForbiddenError, ConsultationNotFoundError, ConsultationVideoUnavailableError } from "./errors";

/**
 * Vox credentials stay on server. Each GAFUS account has one stable Vox SDK identity
 * across bookings (avoid consuming a new Vox user for every trainer session).
 * Conference room remains booking-scoped and opaque.
 */
function config() {
  const applicationId = Number(process.env.VOXIMPLANT_APPLICATION_ID);
  const accountId = Number(process.env.VOXIMPLANT_ACCOUNT_ID);
  const accountName = process.env.VOXIMPLANT_ACCOUNT_NAME?.trim();
  const applicationName = process.env.VOXIMPLANT_APPLICATION_NAME?.trim();
  const keyId = process.env.VOXIMPLANT_KEY_ID?.trim();
  // GitHub Actions Secrets are single-line; a Base64 PEM avoids multiline
  // corruption in SSH scripts and Docker Compose's dotenv parsing.
  const privateKeyBase64 = process.env.VOXIMPLANT_PRIVATE_KEY_BASE64?.trim();
  const privateKey = privateKeyBase64
    ? (/^[A-Za-z0-9+/]+={0,2}$/.test(privateKeyBase64)
        ? Buffer.from(privateKeyBase64, "base64").toString("utf8")
        : undefined)
    : process.env.VOXIMPLANT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const secret = process.env.VOXIMPLANT_CREDENTIAL_SECRET;
  if (!Number.isSafeInteger(applicationId) || applicationId < 1 || !Number.isSafeInteger(accountId) ||
      accountId < 1 || !accountName || !applicationName || !keyId || !privateKey ||
      !secret || Buffer.byteLength(secret, "utf8") < 32 ||
      !/^[a-zA-Z0-9_-]+$/.test(applicationName) || !/^[a-zA-Z0-9_-]+$/.test(accountName)) {
    throw new ConsultationVideoUnavailableError("Voximplant не настроен на сервере");
  }
  return { applicationId, accountId, accountName, applicationName, keyId, privateKey, secret };
}

function digest(secret: string, text: string) {
  return createHmac("sha256", secret).update(text).digest("hex");
}
function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}
function identities(bookingId: string, actorUserId: string, secret: string) {
  const id = digest(secret, `gafus:vox:v1:${bookingId}`).slice(0, 30);
  const userHash = digest(secret, `gafus:vox:user:v1:${actorUserId}`).slice(0, 30);
  const username = `g_u_${userHash}`;
  const password = `Gf1!${digest(secret, `user-password:${actorUserId}`)}`;
  // Identical room for client and trainer. Conference routing must match this pattern.
  return { username, password, room: `gafus_${id}` };
}

function managementJwt(accountId: number, keyId: string, privateKey: string) {
  const iat = Math.floor(Date.now() / 1000);
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const content = `${b64({ alg: "RS256", typ: "JWT", kid: keyId })}.${b64({ iss: accountId, iat, exp: iat + 120 })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(content);
  signer.end();
  return `${content}.${signer.sign(privateKey).toString("base64url")}`;
}

async function managementRequest(method: "GetUsers" | "AddUser", params: Record<string, string | number>, cfg: ReturnType<typeof config>) {
  const url = new URL(`https://api.voximplant.com/platform_api/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${managementJwt(cfg.accountId, cfg.keyId, cfg.privateKey)}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    throw new ConsultationVideoUnavailableError("Сервис видеосвязи не отвечает");
  }
  if (!res.ok) throw new ConsultationVideoUnavailableError("Сервис видеосвязи недоступен");
  const data = await res.json().catch(() => null) as { result?: unknown; error?: unknown } | null;
  if (!data || data.error) throw new ConsultationVideoUnavailableError("Не удалось подготовить видеосвязь");
  return data.result;
}

async function ensureVoxUser(ident: ReturnType<typeof identities>, cfg: ReturnType<typeof config>) {
  const query = { application_id: cfg.applicationId, user_name: ident.username };
  const users = await managementRequest("GetUsers", query, cfg);
  if (!Array.isArray(users)) throw new ConsultationVideoUnavailableError("Не удалось проверить участника видеосвязи");
  if (users.some((user: { user_name?: string; user_active?: boolean }) => user.user_name === ident.username && user.user_active !== false)) return;
  try {
    const result = await managementRequest("AddUser", {
      ...query, user_display_name: "Участник консультации GAFUS",
      user_password: ident.password, user_active: "true", parent_accounting: "true",
    }, cfg);
    if (result !== 1) throw new ConsultationVideoUnavailableError("Не удалось создать участника видеосвязи");
  } catch (error) {
    // Concurrent requests may both observe absent user. Re-read rather than
    // masking a genuine permission/credential problem as an already-created user.
    const existing = await managementRequest("GetUsers", query, cfg);
    if (Array.isArray(existing) && existing.some((user: { user_name?: string; user_active?: boolean }) =>
      user.user_name === ident.username && user.user_active !== false)) return;
    throw error;
  }
}

export function isConsultationCallTimeAllowed(startAt: Date, endAt: Date, now = new Date()) {
  return now.getTime() >= startAt.getTime() - 15 * 60_000 &&
    now.getTime() <= endAt.getTime() + 60 * 60_000;
}

async function authorizeParticipant(bookingId: string, actorUserId: string) {
  const booking = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    select: { status: true, clientId: true, slot: { select: { startAt: true, endAt: true } },
      cynologist: { select: { userId: true } } },
  });
  if (!booking) throw new ConsultationNotFoundError("Консультация");
  if (booking.clientId !== actorUserId && booking.cynologist.userId !== actorUserId) {
    throw new ConsultationForbiddenError();
  }
  if (booking.status !== ConsultationBookingStatus.CONFIRMED) {
    throw new ConsultationForbiddenError("Войти можно только в подтверждённую консультацию");
  }
  if (!isConsultationCallTimeAllowed(booking.slot.startAt, booking.slot.endAt)) {
    throw new ConsultationForbiddenError("Вход доступен за 15 минут до начала и в течение часа после окончания");
  }
}

export async function prepareConsultationCall(bookingId: string, actorUserId: string) {
  await authorizeParticipant(bookingId, actorUserId);
  const cfg = config();
  const identity = identities(bookingId, actorUserId, cfg.secret);
  await ensureVoxUser(identity, cfg);
  return {
    username: `${identity.username}@${cfg.applicationName}.${cfg.accountName}.voximplant.com`,
    room: identity.room,
  };
}

/**
 * Short-lived, booking-scoped admission proof for the VoxEngine scenario.
 * Only an authenticated and currently entitled participant can mint one.
 * VoxEngine rechecks signature + TTL + actual SDK caller username, rather than
 * accepting anyone who has a previously leaked/remembered conference room ID.
 */
export async function createConsultationCallAdmission(bookingId: string, actorUserId: string) {
  await authorizeParticipant(bookingId, actorUserId);
  const cfg = config();
  const admissionSecret = process.env.VOXIMPLANT_ADMISSION_SECRET;
  if (!admissionSecret || Buffer.byteLength(admissionSecret, "utf8") < 32) {
    throw new ConsultationVideoUnavailableError("Не настроен защищённый вход в видеокомнату");
  }
  const { username, room } = identities(bookingId, actorUserId, cfg.secret);
  const expires = Math.floor(Date.now() / 1000) + 90;
  const signature = digest(admissionSecret, `v1:${room}:${username}:${expires}`);
  return { admission: `${expires}.${signature}`, expires };
}

export async function signConsultationOneTimeKey(bookingId: string, actorUserId: string, key: string) {
  if (!/^[\x21-\x7e]{8,512}$/.test(key)) throw new ConsultationForbiddenError("Некорректный ключ входа");
  await authorizeParticipant(bookingId, actorUserId);
  const cfg = config();
  const { username, password } = identities(bookingId, actorUserId, cfg.secret);
  return md5(`${key}|${md5(`${username}:voximplant.com:${password}`)}`);
}
