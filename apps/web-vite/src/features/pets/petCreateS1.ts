/**
 * G05 AG4-approved S1, SOURCE/MOCK ONLY.
 * This module MUST NOT import apiRequest/fetch, perform writes or open a route.
 * The date-only wire normalization follows AG4-approved G05 UTC/Gregorian
 * producer policy, independent of host timezone. The 1990 minimum is an
 * AG4-retained CLIENT-only UX bound, NOT a server minimum.
 * Create weight/photo remain omitted from this legacy-compatible S1 form.
 */
export type PetCreateDraft = {
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm: string;
  neckGirthCm: string;
  muzzleGirthCm: string;
  bellyGirthCm: string;
  notes: string;
};
export type PetCreateBody = {
  name: string;
  type: "DOG" | "CAT";
  breed: string;
  birthDate: string;
  heightCm?: number;
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
  notes?: string;
};
export type PetCreateField = keyof PetCreateDraft;
export type PetCreatePlan =
  | { ok: true; body: PetCreateBody }
  | { ok: false; field: PetCreateField; message: string };
export type PetAck = { id: string; ownerId: string; name: string; type: "DOG" | "CAT" };
export type PetReply = { status: number; body: unknown };
export type PetResult =
  | { kind: "confirmed"; pet: PetAck }
  | { kind: "editable-error"; message: string }
  | { kind: "denied"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "unknown"; message: string };

export const emptyPetDraft: PetCreateDraft = {
  name: "", type: "DOG", breed: "", birthDate: "",
  heightCm: "", neckGirthCm: "", muzzleGirthCm: "",
  bellyGirthCm: "", notes: "",
};

function approvedUtcDateOnly(input: string): string | null {
  // DD.MM.YYYY is a UI input format only; direct Hono accepts YYYY-MM-DD.
  // Match the APPROVED server Gregorian/UTC-day rule: do not instantiate
  // Date(y,m,d), which rejects valid dates skipped in the local timezone
  // (Pacific/Apia 2011-12-30), nor compare against local "today".
  const value = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (!iso && !ru) return null;
  const year = Number(iso?.[1] ?? ru?.[3]);
  const month = Number(iso?.[2] ?? ru?.[2]);
  const day = Number(iso?.[3] ?? ru?.[1]);
  // AG4 explicitly retained this lower bound as CLIENT-ONLY legacy UX;
  // the backend has NO year-1990 minimum.
  if (year < 1990) return null;
  const normalized = String(year).padStart(4,"0") + "-" +
    String(month).padStart(2,"0") + "-" + String(day).padStart(2,"0");
  const date = new Date(normalized + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== normalized)
    return null;
  return normalized <= new Date().toISOString().slice(0,10) ? normalized : null;
}
function measure(value: string): number | null | "invalid" {
  const text = value.trim();
  if (!text) return null;
  // Client-only S1 centimenter syntax: decimal digits, optional '.' or ',',
  // no JS Number coercion of hex/scientific/+ tokens. Unlike the legacy
  // Number() coercion, reject decimal strings whose meaningful digits would
  // silently change when serialized to JSON. No arbitrary "two decimals"
  // weight rule is inferred: createPet does not send weight at all.
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return "invalid";
  const normalized=text.replace(",",".");
  const [whole, decimals] = normalized.split(".");
  const integer=whole.replace(/^0+(?=\d)/,"");
  const meaningfulDecimal=(decimals ?? "").replace(/0+$/,"");
  const canonical=integer+(meaningfulDecimal ? "."+meaningfulDecimal : "");
  const parsed=Number(normalized);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 200 &&
    String(parsed) === canonical ? parsed : "invalid";
}
export function mapPetCreateDraft(draft: PetCreateDraft): PetCreatePlan {
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 50 ||
    !/^[а-яёА-ЯЁa-zA-Z\s-]+$/.test(name))
    return { ok:false, field:"name", message:"Укажите имя из 2–50 букв." };
  if (draft.type !== "DOG" && draft.type !== "CAT")
    return { ok:false, field:"type", message:"Выберите собаку или кошку." };
  const breed = draft.breed.trim();
  if (breed.length < 2 || breed.length > 50)
    return { ok:false, field:"breed", message:"Укажите породу из 2–50 символов." };
  const birthDate = approvedUtcDateOnly(draft.birthDate);
  if (!birthDate)
    return { ok:false, field:"birthDate",
      message:"Проверьте дату рождения: ДД.ММ.ГГГГ, от 1990 года, не позже сегодняшнего дня UTC." };
  const fields = ["heightCm","neckGirthCm","muzzleGirthCm","bellyGirthCm"] as const;
  const numbers: Partial<Record<typeof fields[number],number>> = {};
  for (const field of fields) {
    const number = measure(draft[field]);
    if (number === "invalid")
      return { ok:false, field, message:"Размер должен быть от 1 до 200 см." };
    if (number !== null) numbers[field] = number;
  }
  const notes = draft.notes.trim();
  if (notes.length > 500)
    return { ok:false, field:"notes", message:"Максимум 500 символов." };
  return { ok:true, body:{
    name, type:draft.type, breed, birthDate, ...numbers,
    ...(notes ? {notes} : {}),
    // No id, userId, ownerId, weightKg or photoUrl in S1 proposal.
  } };
}
function petRecord(value: unknown): value is Record<string,unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function interpretPetCreateReply(
  reply: PetReply, actorId: string, expected: PetCreateBody,
): PetResult {
  if (reply.status !== 201) {
    if (reply.status === 400)
      return {kind:"editable-error", message:"Проверьте введённые данные."};
    if (reply.status === 401)
      return {kind:"denied",message:"Сессия закончилась. Войдите снова."};
    if (reply.status === 403)
      return {kind:"denied",message:"Недостаточно прав для создания питомца."};
    if (reply.status === 409)
      return {kind:"conflict",message:
        "Возник конфликт создания. Проверьте список питомцев; повтор с прежним ключом недоступен."};
    return {kind:"unknown",
      message:"Результат создания не подтверждён. Проверьте список питомцев перед повторной попыткой."};
  }
  const envelope = reply.body;
  const pet = petRecord(envelope) && envelope.success === true ? envelope.data : null;
  if (!petRecord(pet) || typeof pet.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(pet.id) ||
    pet.ownerId !== actorId || typeof pet.name !== "string" ||
    pet.name !== expected.name || pet.type !== expected.type) {
    return {kind:"unknown",
      message:"Ответ не подтверждает создание питомца. Проверьте список перед повторной попыткой."};
  }
  return {kind:"confirmed",pet:{
    id:pet.id,ownerId:actorId,name:pet.name,type:expected.type,
  }};
}
