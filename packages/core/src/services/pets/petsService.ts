import { parseBirthDateCreateWire, parseBirthDateEditWire } from "../common/birthDateValidation";
/**
 * Pets Service
 * Сервис для работы с питомцами
 */
import { createHash, randomUUID } from "crypto";

import { prisma } from "@gafus/prisma";
import {
  deleteFileFromCDN,
  getPetDocumentPath,
  getPetPhotoPath,
  getRelativePathFromCDNUrl,
  uploadFileToCDN,
  parsePrivateMediaLocation,
  signPrivateUserMedia,
  privateMediaEnabled,
  privateMediaLocation,
  isolatedAvatarLocationFromOwnPath,
} from "@gafus/cdn-upload";
import { createWebLogger } from "@gafus/logger";
import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  PET_DOCUMENTS_MAX_PER_PET,
  type PetDocumentAllowedMimeType,
  type PetDocumentDto,
} from "@gafus/types";

import type { PetType, Prisma } from "@gafus/prisma";
import { enqueuePetVetCleanup, lockVetPet } from "./petVetVisitService";
import { replaceOwnerPetPhoto } from "./petPhotoUpdateCoordinator";
import { enqueuePetMediaDeletionIntent, consumePetMediaUploadReservation,
  petMediaOutboxEnabled } from "./petMediaDeletionSql";

const logger = createWebLogger("core-pets");

const MIME_TYPE_TO_EXTENSION: Record<PetDocumentAllowedMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export interface CreatePetInput {
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
  photoUrl?: string;
  notes?: string;
  /** Optional UUID v4. Absent requests retain legacy non-idempotent creation. */
  clientRequestId?: string;
}

export interface UpdatePetInput {
  showInProfile?: boolean;
  name?: string;
  type?: string;
  breed?: string;
  birthDate?: string;
  heightCm?: number | null;
  weightKg?: number;
  neckGirthCm?: number | null;
  muzzleGirthCm?: number | null;
  bellyGirthCm?: number | null;
  photoUrl?: string;
  notes?: string;
}

interface UploadPetDocumentInput {
  name: string;
  type: string;
  size: number;
}

interface PrismaErrorLike {
  code?: string;
  message?: string;
}

function isPetDocumentTableMissingError(error: unknown): boolean {
  const prismaError = error as PrismaErrorLike;
  return (
    prismaError?.code === "P2021" &&
    typeof prismaError.message === "string" &&
    prismaError.message.includes("PetDocument")
  );
}

function toPetDocumentDto(document: {
  id: string;
  petId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}): PetDocumentDto {
  return {
    ...document,
    mimeType: document.mimeType as PetDocumentAllowedMimeType,
  };
}

async function presentPetDocumentDto(document: PetDocumentDto): Promise<PetDocumentDto> {
  // Existing Yandex URLs remain untouched. The Cloud.ru reference stays in the DB;
  // Web and Mobile receive a one-hour signed link only after an owner-scoped lookup.
  return parsePrivateMediaLocation(document.url)
    ? { ...document, url: await signPrivateUserMedia(document.url) }
    : document;
}

function getDocumentExtension(file: UploadPetDocumentInput): string {
  // Storage paths derive from the verified MIME, never an untrusted filename suffix.
  // A misleading .txt suffix must not silently fall back to the public legacy bucket.
  const extension = MIME_TYPE_TO_EXTENSION[file.type as PetDocumentAllowedMimeType];
  if (!extension) throw new Error("Недопустимый тип документа");
  return extension;
}

function getExtensionFromFileName(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  if (!ext || ext === fileName.toLowerCase()) {
    return null;
  }
  return ext;
}

/** Макс. длина базового имени (без расширения) — защита от раздувания строки в БД и заголовках. */
const PET_DOCUMENT_BASE_NAME_MAX_LENGTH = 200;

/**
 * Убирает управляющие символы и типичные «путь/файл»-символы из базы имени файла.
 * Имя хранится только как метаданные (путь в CDN от UUID), но так безопаснее для UI и Content-Disposition.
 */
function sanitizePetDocumentFileBaseName(rawBase: string): string {
  const withoutControlChars = Array.from(rawBase)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code <= 31 || code === 127);
    })
    .join("");

  const collapsed = withoutControlChars
    .replace(/[/\\:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return collapsed.slice(0, PET_DOCUMENT_BASE_NAME_MAX_LENGTH);
}

function buildDocumentNameWithOriginalExtension(
  name: string,
  currentFileName: string,
  mimeType: string,
): string {
  const normalizedName = name.trim();
  const originalExtension =
    getExtensionFromFileName(currentFileName) ??
    MIME_TYPE_TO_EXTENSION[mimeType as PetDocumentAllowedMimeType] ??
    "bin";

  const extLower = originalExtension.toLowerCase();
  let basePart: string;

  if (normalizedName.toLowerCase().endsWith(`.${extLower}`)) {
    basePart = normalizedName.slice(0, normalizedName.length - extLower.length - 1);
  } else {
    basePart = normalizedName.replace(/\.[^./\\]+$/, "").trim();
    if (!basePart) {
      basePart = normalizedName;
    }
  }

  const safeBase = sanitizePetDocumentFileBaseName(basePart);
  if (!safeBase) {
    return `document.${originalExtension}`;
  }

  return `${safeBase}.${originalExtension}`;
}

function validatePetDocumentFile(file: UploadPetDocumentInput): void {
  if (!PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as PetDocumentAllowedMimeType)) {
    throw new Error("Недопустимый тип документа");
  }
  if (file.size > PET_DOCUMENT_MAX_SIZE_BYTES) {
    throw new Error("Размер документа превышает 10 МБ");
  }
}

// Preserve original public Core exports without eager-importing write modules in READ composition.
export { getUserPets, getPetById } from "./petsReadService";

/**
 * G05 AG4 approved create-idempotency: transactionally store the Pet and
 * original response in the same dedicated PostgreSQL ledger operation.
 * No shared Prisma generation is needed: the ledger is used through scoped
 * parameterized raw SQL, while Pet still uses the generated Prisma delegate.
 */
const CREATE_PET_REQUEST_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_PET_REPLAY_MARKER = Symbol.for("gafus.pet.create.replayed");
const CREATE_PET_CANONICAL_FIELDS = [
  "name",
  "type",
  "breed",
  "birthDate",
  "heightCm",
  "weightKg",
  "neckGirthCm",
  "muzzleGirthCm",
  "bellyGirthCm",
  "photoUrl",
  "notes",
] as const;

type PetWithAwards = Prisma.PetGetPayload<{ include: { awards: true } }>;
type PetCreateReceipt = {
  payloadHash: string;
  petId: string;
  responseJson: unknown;
};

type PetCreateIdempotencyCode =
  | "INVALID_CLIENT_REQUEST_ID"
  | "PET_CREATE_REQUEST_CONFLICT"
  | "PET_CREATE_RESULT_UNAVAILABLE"
  | "PET_CREATE_RESULT_UNCONFIRMED";

export class PetCreateIdempotencyError extends Error {
  constructor(public readonly code: PetCreateIdempotencyCode) {
    // Do not print request IDs, Pet notes, canonical request bytes, or SQL values.
    super(code);
    this.name = "PetCreateIdempotencyError";
  }
}

class ExistingPetCreateReceipt extends Error {
  constructor() {
    super("G05_REQUEST_KEY_ALREADY_COMMITTED");
  }
}

const PET_MEASUREMENT_FIELDS = [
  "heightCm",
  "neckGirthCm",
  "muzzleGirthCm",
  "bellyGirthCm",
] as const;

/** Defence in depth for original Core direct callers, matching Hono bounds. */
function assertPetMeasurements(data: CreatePetInput | UpdatePetInput, allowNull: boolean): void {
  for (const field of PET_MEASUREMENT_FIELDS) {
    const value = data[field];
    if (value === undefined || (value === null && allowNull)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error("Некорректное измерение питомца");
    }
  }
}

function assertPetCreateWeight(weight: unknown): void {
  if (weight === undefined) return;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0.1 || weight > 200) {
    throw new Error("Некорректный вес питомца");
  }
}

function petCreateFields(userId: string, data: CreatePetInput, birthDate: Date) {
  return {
    ownerId: userId,
    name: data.name,
    type: data.type as PetType,
    breed: data.breed,
    birthDate,
    heightCm: data.heightCm ?? null,
    weightKg: data.weightKg ?? null,
    neckGirthCm: data.neckGirthCm ?? null,
    muzzleGirthCm: data.muzzleGirthCm ?? null,
    bellyGirthCm: data.bellyGirthCm ?? null,
    photoUrl: data.photoUrl || null,
    notes: data.notes ?? null,
  };
}

function canonicalPetCreateHash(data: CreatePetInput): string {
  const allowed = data as unknown as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  for (const field of CREATE_PET_CANONICAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(allowed, field) && allowed[field] !== undefined) {
      canonical[field] = allowed[field];
    }
  }
  return createHash("sha256")
    .update("G05:create-pet:v1\0", "utf8")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}

async function loadCommittedPetCreate(
  userId: string,
  clientRequestId: string,
  expectedHash: string,
): Promise<PetWithAwards> {
  const rows = await prisma.$queryRawUnsafe<PetCreateReceipt[]>(
    `SELECT "payloadHash", "petId", "responseJson" FROM "PetCreateReceipt"
       WHERE "ownerId"=$1 AND "clientRequestId"=$2::uuid LIMIT 1`,
    userId,
    clientRequestId,
  );
  const saved = rows[0];
  if (!saved) throw new PetCreateIdempotencyError("PET_CREATE_RESULT_UNCONFIRMED");
  if (saved.payloadHash !== expectedHash) {
    throw new PetCreateIdempotencyError("PET_CREATE_REQUEST_CONFLICT");
  }
  // Tombstone semantics: retaining the receipt must not recreate a deleted Pet
  // or misreport a successful new create after deletion.
  const existingPet = await prisma.pet.findFirst({
    where: { id: saved.petId, ownerId: userId },
    select: { id: true },
  });
  if (!existingPet) {
    throw new PetCreateIdempotencyError("PET_CREATE_RESULT_UNAVAILABLE");
  }
  const body = saved.responseJson;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body as { success?: unknown }).success !== true ||
    !(body as { data?: unknown }).data ||
    typeof (body as { data?: unknown }).data !== "object" ||
    (body as { data: { id?: unknown; ownerId?: unknown } }).data.id !== saved.petId ||
    (body as { data: { id?: unknown; ownerId?: unknown } }).data.ownerId !== userId
  ) {
    throw new PetCreateIdempotencyError("PET_CREATE_RESULT_UNCONFIRMED");
  }
  // JSONB contains the immutable original HTTP-JSON snapshot. The marker is
  // a non-enumerable shared symbol so the existing success DTO stays identical.
  const pet = (body as { data: PetWithAwards }).data;
  Object.defineProperty(pet, CREATE_PET_REPLAY_MARKER, {
    value: true,
    enumerable: false,
  });
  return pet;
}

/** Stable HTTP-facing refusal for direct photo-URL mutation while the
 * provider-aware outbox owns the upload/replace workflow. No locator, pet or
 * storage details enter message/code; other Core errors remain server errors.
 */
export class PetMediaDirectPhotoUrlDeniedError extends Error {
  readonly code = "PET_MEDIA_DIRECT_PHOTO_URL_DENIED";
  constructor() {
    super("PET_MEDIA_DIRECT_PHOTO_URL_DENIED");
    this.name = "PetMediaDirectPhotoUrlDeniedError";
  }
}

/** Create one Pet; with clientRequestId, ensure exactly one durable SQL insert. */
export async function createPet(userId: string, data: CreatePetInput): Promise<PetWithAwards> {
  // A caller-supplied managed photo URL bypasses UUID candidate reservation
  // and permits a second owner's Pet row to race another owner's S3 cleanup.
  // Keep the original create API when the not-yet-deployed outbox is disabled.
  if (petMediaOutboxEnabled() && data.photoUrl)
    throw new PetMediaDirectPhotoUrlDeniedError();
  const clientRequestId = data.clientRequestId?.toLowerCase();
  try {
    // Before either legacy create or keyed transaction / receipt claim.
    // Only canonical date-only input can create a pet, as in existing POST.
    const birthDate = parseBirthDateCreateWire(data.birthDate);
    assertPetMeasurements(data, false);
    assertPetCreateWeight(data.weightKg);
    if (!clientRequestId) {
      // Keep the legacy no-key path byte-compatible and non-idempotent.
      return await prisma.pet.create({
        data: petCreateFields(userId, data, birthDate),
        include: { awards: true },
      });
    }
    if (!CREATE_PET_REQUEST_UUID_V4.test(clientRequestId)) {
      throw new PetCreateIdempotencyError("INVALID_CLIENT_REQUEST_ID");
    }
    const payloadHash = canonicalPetCreateHash(data);
    try {
      return await prisma.$transaction(
        async (tx) => {
          const pet = await tx.pet.create({
            data: petCreateFields(userId, data, birthDate),
            include: { awards: true },
          });
          const responseJson = JSON.stringify({ success: true, data: pet });
          // The unique claim is inserted AFTER Pet creation, but IN THE SAME
          // transaction. A lost race throws, rolling back the loser's Pet.
          const claimed = await tx.$queryRawUnsafe<{ petId: string }[]>(
            `INSERT INTO "PetCreateReceipt"
            ("ownerId", "clientRequestId", "payloadHash", "petId", "responseStatus", "responseJson")
            VALUES ($1, $2::uuid, $3, $4, 201, $5::jsonb)
            ON CONFLICT ("ownerId", "clientRequestId") DO NOTHING
            RETURNING "petId"`,
            userId,
            clientRequestId,
            payloadHash,
            pet.id,
            responseJson,
          );
          if (claimed.length !== 1) throw new ExistingPetCreateReceipt();
          return pet;
        },
        { maxWait: 10000, timeout: 20000 },
      );
    } catch (error) {
      if (!(error instanceof ExistingPetCreateReceipt)) throw error;
      // PostgreSQL unique index waited for the winner's commit. Read its
      // durable response AFTER losing transaction rollback. No mutation retry.
      return await loadCommittedPetCreate(userId, clientRequestId, payloadHash);
    }
  } catch (error) {
    if (error instanceof PetCreateIdempotencyError) throw error;
    logger.error("Ошибка при создании питомца", new Error("PET_CREATE_FAILED"));
    throw new Error("Не удалось создать питомца");
  }
}

/** Pet weight must use the dedicated history/target-weight workflow. */
export class PetWeightUpdateUnsupportedError extends Error {
  readonly code = "PET_WEIGHT_UPDATE_UNSUPPORTED";
  constructor() {
    super("Weight must be updated through the dedicated measurement endpoint");
    this.name = "PetWeightUpdateUnsupportedError";
  }
}

/**
 * Обновить питомца
 */
export async function updatePet(petId: string, userId: string, data: UpdatePetInput) {
  // Проверяем, что питомец принадлежит пользователю
  const existingPet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
  });

  if (!existingPet) {
    return null;
  }
  // This formerly silently ignored weightKg; reject direct Core callers too.
  if (data.weightKg !== undefined) throw new PetWeightUpdateUnsupportedError();
  assertPetMeasurements(data, true);
  const guardedPhotoChange = petMediaOutboxEnabled() && data.photoUrl !== undefined;
  // Only the specialized updatePetPhoto writes new object URLs. Existing
  // identical refs may be echoed by full-form clients; empty means clear.
  if (guardedPhotoChange && data.photoUrl && data.photoUrl !== existingPet.photoUrl)
    throw new PetMediaDirectPhotoUrlDeniedError();

  const updateData: Prisma.PetUpdateInput = {};

  if (data.showInProfile !== undefined) updateData.showInProfile = data.showInProfile;

  if (data.name !== undefined) updateData.name = data.name;
  if (data.type !== undefined) updateData.type = data.type as PetType;
  if (data.breed !== undefined) updateData.breed = data.breed;
  if (data.birthDate !== undefined) updateData.birthDate = parseBirthDateEditWire(data.birthDate);
  if (data.heightCm !== undefined) updateData.heightCm = data.heightCm ?? null;
  if (data.neckGirthCm !== undefined) updateData.neckGirthCm = data.neckGirthCm ?? null;
  if (data.muzzleGirthCm !== undefined) updateData.muzzleGirthCm = data.muzzleGirthCm ?? null;
  if (data.bellyGirthCm !== undefined) updateData.bellyGirthCm = data.bellyGirthCm ?? null;
  if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl || null;
  if (data.notes !== undefined) updateData.notes = data.notes ?? null;

  try {
    const pet = await prisma.$transaction(async (tx) => {
      if (guardedPhotoChange) {
        // Serialize direct photo clearing with photo upload, Pet deletion and
        // account deletion using the existing owner User lock.
        const owner = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
        if (!owner.length) return null;
        const current = await tx.pet.findFirst({
          where: { id: petId, ownerId: userId }, select: { photoUrl: true },
        });
        if (!current) return null;
        if (data.photoUrl && data.photoUrl !== current.photoUrl)
          throw new PetMediaDirectPhotoUrlDeniedError();
        if (!data.photoUrl && current.photoUrl)
          await enqueuePetMediaDeletionIntent(tx, userId, petId,
            current.photoUrl, "photo-replaced");
      }
      const updated = await tx.pet.update({
        where: { id: petId, ownerId: userId },
        data: updateData,
        include: { awards: true },
      });
      return updated;
    });

    return pet;
  } catch (error) {
    if (error instanceof PetMediaDirectPhotoUrlDeniedError) throw error;
    logger.error("Ошибка при обновлении питомца", new Error("PET_UPDATE_FAILED"));
    throw new Error("Не удалось обновить питомца");
  }
}

/**
 * Обновить фото питомца (загрузка в CDN и сохранение URL в БД)
 */
export async function updatePetPhoto(petId: string, userId: string, file: File): Promise<string> {
  // The Hono transport already normalizes multipart image bytes and file name.
  // Direct Core callers must still not be able to pick an arbitrary S3 path.
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    throw new Error("Недопустимое расширение фотографии питомца");
  }
  if (!file.size || file.size > 2 * 1024 * 1024) {
    throw new Error("Недопустимый размер фотографии питомца");
  }
  if (({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif" } as Record<string, string>)[extension] !== file.type) {
    throw new Error("Недопустимый формат фотографии питомца");
  }
  const relativePath = getPetPhotoPath(userId, petId, randomUUID(), extension);
  const candidateLocator = process.env.GAFUS_ISOLATED_NONPROD_S3 !== undefined
    ? isolatedAvatarLocationFromOwnPath(relativePath) : relativePath;
  return replaceOwnerPetPhoto({
    candidatePath: relativePath,
    // Deny foreign/nonexistent pet before touching S3. Recheck after a
    // concurrent delete under the per-user row lock in the actual SQL write.
    checkOwner: async () => {
      if (petMediaOutboxEnabled()) {
        await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
          const own = await tx.pet.findFirst({
            where: { id: petId, ownerId: userId }, select: { id: true },
          });
          if (!own) throw new Error("Питомец не найден или не принадлежит пользователю");
          await enqueuePetMediaDeletionIntent(tx, userId, petId, candidateLocator,
            "candidate", new Date(Date.now() + 24 * 60 * 60 * 1000));
        });
        return;
      }
      const own = await prisma.pet.findFirst({
        where: { id: petId, ownerId: userId }, select: { id: true },
      });
      if (!own) throw new Error("Питомец не найден или не принадлежит пользователю");
    },
    upload: () => uploadFileToCDN(file, relativePath),
    writeOwnerPhoto: (location) => prisma.$transaction(async (tx) => {
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!owners.length) throw new Error("Пользователь не найден");
      const pet = await tx.pet.findFirst({
        where: { id: petId, ownerId: userId }, select: { photoUrl: true },
      });
      if (!pet) throw new Error("Питомец не найден или не принадлежит пользователю");
      if (petMediaOutboxEnabled()) {
        if (location !== candidateLocator)
          throw new Error("PET_MEDIA_CANDIDATE_LOCATION_MISMATCH");
        await consumePetMediaUploadReservation(tx, userId, candidateLocator);
        if (pet.photoUrl && pet.photoUrl !== location)
          await enqueuePetMediaDeletionIntent(tx, userId, petId,
            pet.photoUrl, "photo-replaced");
      }
      await tx.pet.update({
        where: { id: petId, ownerId: userId }, data: { photoUrl: location },
      });
      return pet.photoUrl;
    }, { timeout: 90_000 }),
    readOwnerPhoto: async () => (await prisma.pet.findFirst({
      where: { id: petId, ownerId: userId }, select: { photoUrl: true },
    }))?.photoUrl,
    deleteStorageObject: async (location) => {
      // Pre-upload candidate or old-photo cleanup is already reserved in SQL.
      // Never perform an unfenced direct DELETE while outbox mode is active.
      if (!petMediaOutboxEnabled())
        await deleteFileFromCDN(getRelativePathFromCDNUrl(location));
    },
    onCleanupFailure: (phase) => logger.error(
      phase === "previous" ? "PET_OLD_PHOTO_DELETE_FAILED" : "PET_CANDIDATE_CLEANUP_FAILED",
      new Error("PET_PHOTO_MEDIA_CLEANUP_FAILED"),
    ),
  });
}

/**
 * Получить документы питомца
 */
export async function listPetDocuments(petId: string, userId: string): Promise<PetDocumentDto[]> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
    select: { id: true },
  });
  if (!pet) {
    throw new Error("Питомец не найден");
  }

  const documents = await prisma.petDocument.findMany({
    where: { petId, ownerId: userId },
    orderBy: [{ createdAt: "desc" }],
  });
  return Promise.all(documents.map((doc) => presentPetDocumentDto(toPetDocumentDto(doc))));
}

/**
 * Получить все документы питомцев пользователя
 */
export async function listUserPetDocuments(userId: string): Promise<PetDocumentDto[]> {
  try {
    const documents = await prisma.petDocument.findMany({
      where: { ownerId: userId },
      orderBy: [{ createdAt: "desc" }],
    });
    return Promise.all(documents.map((doc) => presentPetDocumentDto(toPetDocumentDto(doc))));
  } catch (error) {
    if (isPetDocumentTableMissingError(error)) {
      logger.warn("Таблица документов питомцев отсутствует, возвращаем пустой список", {
        userId,
      });
      return [];
    }
    throw error;
  }
}

/**
 * Загрузить документ питомца
 */
export async function uploadPetDocument(
  petId: string,
  userId: string,
  file: File,
): Promise<PetDocumentDto> {
  validatePetDocumentFile(file);
  // Never upload to a provider for an unauthenticated or foreign pet. The same
  // permission and quota are rechecked inside a short serializable owner lock.
  const authorizedPet = await prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
    select: { id: true },
  });
  if (!authorizedPet) throw new Error("Питомец не найден");

  const ext = getDocumentExtension(file);
  const relativePath = getPetDocumentPath(userId, petId, randomUUID(), ext);
  // A provider-qualified reservation is computable before S3 I/O. If a PUT
  // succeeds but the network times out, compensation can still find the UUID.
  const attempted = privateMediaEnabled()
    ? privateMediaLocation("documents", relativePath)
    : relativePath;
  let uploadedUrl: string | undefined;
  if (petMediaOutboxEnabled()) {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const owned = await tx.pet.findFirst({
        where: { id: petId, ownerId: userId }, select: { id: true },
      });
      if (!owned) throw new Error("Питомец не найден");
      await enqueuePetMediaDeletionIntent(tx, userId, petId, attempted,
        "candidate", new Date(Date.now() + 24 * 60 * 60 * 1000));
    });
  }
  try {
    uploadedUrl = await uploadFileToCDN(file, relativePath);
    if (petMediaOutboxEnabled() && uploadedUrl !== attempted)
      throw new Error("PET_DOCUMENT_CANDIDATE_LOCATION_MISMATCH");
    const result = await prisma.$transaction(
      async (tx) => {
        const owners = await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        if (!owners.length) throw new Error("Пользователь не найден");
        const pet = await tx.pet.findFirst({
          where: { id: petId, ownerId: userId },
          select: { id: true },
        });
        if (!pet) throw new Error("Питомец не найден");
        const documentsCount = await tx.petDocument.count({
          where: { petId, ownerId: userId },
        });
        if (documentsCount >= PET_DOCUMENTS_MAX_PER_PET)
          throw new Error("Достигнут лимит документов питомца");
        if (petMediaOutboxEnabled())
          await consumePetMediaUploadReservation(tx, userId, attempted);
        return tx.petDocument.create({
          data: {
            petId,
            ownerId: userId,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            url: uploadedUrl!,
          },
        });
      },
      { timeout: 10_000 },
    );
    // Signing is not a part of the DB transaction: transient S3 signing failures
    // cannot roll back an otherwise committed private document.
    return await presentPetDocumentDto(toPetDocumentDto(result));
  } catch (error) {
    // The computed UUID is safe to check even when an S3 PUT timed out without
    // returning a marker. A transient DB failure must never delete committed data.
    const candidate = uploadedUrl ?? attempted;
    try {
      const committed = await prisma.petDocument.findFirst({
        where: { url: candidate, petId, ownerId: userId },
        select: { id: true },
      });
      if (!committed && !petMediaOutboxEnabled())
        await deleteFileFromCDN(getRelativePathFromCDNUrl(candidate));
    } catch {
      logger.error(
        "Не удалось компенсировать загрузку документа",
        new Error("PET_DOCUMENT_COMPENSATION_FAILED"),
      );
    }
    logger.error("Ошибка при загрузке документа питомца", new Error("PET_DOCUMENT_UPLOAD_FAILED"));
    throw error;
  }
}

/**
 * Удалить документ питомца
 */
export async function deletePetDocument(
  documentId: string,
  userId: string,
  petId?: string,
): Promise<boolean> {
  if (petMediaOutboxEnabled()) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const doc = await tx.petDocument.findFirst({
        where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
      });
      if (!doc) return false;
      await enqueuePetMediaDeletionIntent(tx, userId, doc.petId,
        doc.url, "document-delete");
      await tx.petDocument.delete({ where: { id: documentId } });
      return true;
    });
  }
  const existingDocument = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
  });
  if (!existingDocument) {
    return false;
  }

  try {
    const relativePath = getRelativePathFromCDNUrl(existingDocument.url);
    await deleteFileFromCDN(relativePath);
  } catch (error) {
    logger.error(
      "Не удалось удалить документ питомца из CDN",
      new Error("PET_DOCUMENT_CDN_DELETE_FAILED"),
    );
    // A private Cloud.ru object must not be orphaned by deleting its DB locator.
    if (parsePrivateMediaLocation(existingDocument.url)) throw error;
  }

  await prisma.petDocument.delete({
    where: { id: documentId },
  });
  return true;
}

/**
 * Обновить название документа питомца
 */
export async function renamePetDocument(
  documentId: string,
  userId: string,
  name: string,
  petId?: string,
): Promise<PetDocumentDto | null> {
  const nextName = name.trim();
  if (!nextName) {
    throw new Error("Название документа не может быть пустым");
  }

  const existingDocument = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
  });
  if (!existingDocument) {
    return null;
  }

  const nextFileName = buildDocumentNameWithOriginalExtension(
    nextName,
    existingDocument.name,
    existingDocument.mimeType,
  );

  const updatedDocument = await prisma.petDocument.update({
    where: { id: documentId },
    data: { name: nextFileName },
  });
  return presentPetDocumentDto(toPetDocumentDto(updatedDocument));
}

/**
 * Получить документ питомца для скачивания
 */
export async function getPetDocumentById(
  documentId: string,
  userId: string,
  petId?: string,
): Promise<PetDocumentDto | null> {
  const document = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
  });
  if (!document) {
    return null;
  }
  return presentPetDocumentDto(toPetDocumentDto(document));
}

export interface PetDocumentDownloadPayload {
  documentId: string;
  fileName: string;
  mimeType: PetDocumentAllowedMimeType;
  sizeBytes: number;
  downloadUrl: string;
}

/**
 * Подготовить данные документа питомца для скачивания
 */
export async function preparePetDocumentDownload(
  documentId: string,
  userId: string,
  petId?: string,
): Promise<PetDocumentDownloadPayload | null> {
  const document = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
    select: {
      id: true,
      name: true,
      mimeType: true,
      sizeBytes: true,
      url: true,
    },
  });
  if (!document) {
    return null;
  }

  return {
    documentId: document.id,
    fileName: document.name,
    mimeType: document.mimeType as PetDocumentAllowedMimeType,
    sizeBytes: document.sizeBytes,
    // Owner check above precedes this short-lived direct private-bucket URL.
    downloadUrl: parsePrivateMediaLocation(document.url)
      ? await signPrivateUserMedia(document.url, 120, document.name)
      : document.url,
  };
}

/**
 * Удалить питомца
 */
export async function deletePet(petId: string, userId: string): Promise<boolean> {
  let committed: { photoUrl: string | null; documents: string[] } | null;
  try {
    committed = await prisma.$transaction(async (tx) => {
      // Serialize photo updates, owner deletion and Vet cleanup through the
      // same owner lock. Foreign/nonexistent IDs never reach media deletion.
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!owners.length) return null;
      const pet = await tx.pet.findFirst({
        where: { id: petId, ownerId: userId }, select: { photoUrl: true },
      });
      if (!pet) return null;
      const documents = await tx.petDocument.findMany({
        where: { petId, ownerId: userId }, select: { url: true },
      });
      await lockVetPet(tx, petId, userId);
      await enqueuePetVetCleanup(tx, petId, userId);
      if (petMediaOutboxEnabled()) {
        const locations = [pet.photoUrl, ...documents.map(doc => doc.url)].filter(
          (location): location is string => typeof location === "string" && !!location,
        );
        for (const location of new Set(locations))
          await enqueuePetMediaDeletionIntent(tx, userId, petId, location, "pet-delete");
      }
      await tx.pet.delete({ where: { id: petId, ownerId: userId } });
      return { photoUrl: pet.photoUrl, documents: documents.map((doc) => doc.url) };
    });
  } catch {
    // A failed transaction must never have already deleted the old media.
    logger.error("Ошибка при удалении питомца", new Error("PET_DELETE_FAILED"));
    throw new Error("Не удалось удалить питомца");
  }
  if (!committed) return false;
  // Once the reviewed outbox schema is deployed, a separately gated worker
  // owns deletion and verified HEAD: crashes cannot lose the committed intent.
  if (petMediaOutboxEnabled()) return true;

  // Only after the DB commit: an S3 error must not pretend the Pet still
  // exists, nor ever delete media while its row can roll back. Physical
  // cleanup failures are separately logged for eventual orphan recovery.
  const media = [committed.photoUrl, ...committed.documents].filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  for (const location of new Set(media)) {
    try {
      await deleteFileFromCDN(getRelativePathFromCDNUrl(location));
    } catch {
      logger.error("PET_MEDIA_POSTCOMMIT_CLEANUP_FAILED",
        new Error("PET_MEDIA_POSTCOMMIT_CLEANUP_FAILED"));
    }
  }
  return true;
}
