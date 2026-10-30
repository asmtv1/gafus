import * as SecureStore from "expo-secure-store";
import {
  type PetDocumentDto, PET_DOCUMENT_ALLOWED_MIME_TYPES,
  isValidOwnedPetWeightId, parseOwnedPetWeightHistoryData,
} from "@gafus/types";

import { reportClientError } from "@/shared/lib/tracer";

import { apiClient, apiClientMultipart, type ApiResponse } from "./client";

const LOG_PREFIX = "[PetsAPI]";

/** Соответствует enum PetType в Prisma (только собака и кошка) */
export type PetKind = "DOG" | "CAT";

/** Приводит значение типа с API к PetKind (регистр и лишние пробелы) */
export function parsePetKind(value: unknown): PetKind {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return normalized === "CAT" ? "CAT" : "DOG";
}

export interface Pet {
  id: string;
  /** Required in the private list response; optional for existing create/edit DTO callers. */
  ownerId?: string;
  name: string;
  type: PetKind;
  breed: string | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg?: number | null;
  neckGirthCm: number | null;
  muzzleGirthCm: number | null;
  bellyGirthCm: number | null;
  photoUrl: string | null;
  showInProfile: boolean;
  notes: string | null;
  createdAt: string;
}

export interface PetWeightEntry {
  id: string;
  weightKg: number;
  measuredAt: string;
  createdAt: string;
}

export interface PetWeightHistory {
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  entries: PetWeightEntry[];
}

/**
 * The shared wire DTO deliberately strips ownerId before exposing it to UI.
 * A native owner-bound GET must therefore verify the raw row owner and unique
 * IDs *before* projection, without leaking those fields in returned data.
 */
function weightReadRowsMatchOwnerAndUnique(raw: unknown, expectedOwnerId?: string): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const rows = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(rows)) return false;
  const seen = new Set<string>();
  for (const value of rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const row = value as { id?: unknown; ownerId?: unknown };
    if (typeof row.id !== "string" || seen.has(row.id)) return false;
    if (expectedOwnerId !== undefined && row.ownerId !== expectedOwnerId) return false;
    seen.add(row.id);
  }
  return true;
}

export const petWeightApi = {
  get: async (petId: string, requestGuard?: (accessToken?: string | null) => boolean,
    expectedOwnerId?: string): Promise<ApiResponse<PetWeightHistory>> => {
    if (!isValidOwnedPetWeightId(petId)) {
      return { success: false, code: "INVALID_PET_ID", error: "Некорректный идентификатор питомца" };
    }
    const response = await apiClient<unknown>(`/api/v1/pets/${petId}/weight`, {
      ...(requestGuard ? { requestGuard } : {}),
    });
    if (!response.success) return response as ApiResponse<PetWeightHistory>;
    const safeRows = weightReadRowsMatchOwnerAndUnique(response.data, expectedOwnerId);
    const data = safeRows ? parseOwnedPetWeightHistoryData(response.data, petId) : null;
    return data ? { success: true, data } : {
      success: false, code: "INVALID_RESPONSE", error: "Некорректная история веса питомца",
    };
  },
  add: (petId: string, weightKg: number, measuredAt: string,
    requestGuard?: () => boolean) =>
    apiClient<PetWeightEntry>(`/api/v1/pets/${petId}/weight`, {
      method: "POST", body: { weightKg, measuredAt },
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    }),
  setTarget: (petId: string, targetWeightKg: number | null,
    requestGuard?: () => boolean) =>
    apiClient<void>(`/api/v1/pets/${petId}/weight/target`, {
      method: "PUT", body: { targetWeightKg },
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    }),
  remove: (petId: string, entryId: string, requestGuard?: () => boolean) =>
    apiClient<void>(`/api/v1/pets/${petId}/weight/${entryId}`, {
      method: "DELETE", skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    }),
};

export interface CreatePetData {
  clientRequestId?: string; // JSON UUIDv4; Idempotency-Key header unsupported
  name: string;
  type: PetKind;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
  photoUrl?: string;
  notes?: string;
}

export type UpdatePetData = Omit<
  Partial<CreatePetData>,
  "weightKg" | "heightCm" | "neckGirthCm" | "muzzleGirthCm" | "bellyGirthCm"
> & {
  heightCm?: number | null;
  neckGirthCm?: number | null;
  muzzleGirthCm?: number | null;
  bellyGirthCm?: number | null;
  showInProfile?: boolean;
};
export type PetDocument = PetDocumentDto;

export type PetPreventionType = "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";

export type PetPreventionReminderKind = "AFTER_DAYS" | "ON_DATE";

export interface PetPreventionEntry {
  id: string;
  petId: string;
  type: PetPreventionType;
  performedAt: string;
  productName?: string | null;
  notes?: string | null;
  clientId?: string | null;
  reminderEnabled?: boolean;
  reminderKind?: PetPreventionReminderKind;
  reminderDaysAfter?: number | null;
  reminderOnDate?: string | null;
  remindAt?: string | null;
  reminderTimes?: string[];
  lastNotifiedForRemindAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePreventionEntryData {
  type: PetPreventionType;
  performedAt: string;
  productName?: string;
  notes?: string;
  reminderEnabled?: boolean;
  reminderKind?: PetPreventionReminderKind;
  reminderDaysAfter?: number;
  reminderOnDate?: string;
  reminderTimes?: string[];
}

export interface BatchPreventionEntry extends CreatePreventionEntryData {
  clientId: string;
}

/**
 * API модуль для работы с питомцами
 */
export const petsApi = {
  /**
   * Получить список питомцев пользователя
   */
  getAll: async (requestGuard?: () => boolean): Promise<ApiResponse<Pet[]>> => {
    try {
      return await apiClient<Pet[]>("/api/v1/pets", {
        ...(requestGuard ? { requestGuard } : {}),
      });
    } catch {
      reportClientError(new Error("PETS_LIST_GET_FAILED"), {
        issueKey: "PetsApi", keys: { operation: "get_all" },
      });
      throw new Error("PETS_LIST_GET_FAILED");
    }
  },

  /**
   * Получить питомца по id
   */
  getById: async (petId: string, requestGuard?: () => boolean): Promise<ApiResponse<Pet>> => {
    try {
      return await apiClient<Pet>(`/api/v1/pets/${petId}`, {
        ...(requestGuard ? { requestGuard } : {}),
      });
    } catch {
      // Native/private GET failures can contain owner notes or signed URLs;
      // never forward arbitrary transport error data to tracer, console or UI.
      reportClientError(new Error("PET_DETAIL_GET_FAILED"), {
        issueKey: "PetsApi",
        keys: { operation: "get_by_id" },
      });
      throw new Error("PET_DETAIL_GET_FAILED");
    }
  },

  /**
   * Создать питомца
   */
  create: async (data: CreatePetData, requestGuard?: () => boolean): Promise<ApiResponse<Pet>> => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Создание питомца`, {
        name: data.name,
        type: data.type,
        breed: data.breed,
        birthDate: data.birthDate,
        hasHeight: !!data.heightCm,
        hasWeight: !!data.weightKg,
        hasNeckGirth: !!data.neckGirthCm,
        hasMuzzleGirth: !!data.muzzleGirthCm,
        hasBellyGirth: !!data.bellyGirthCm,
        hasNotes: !!data.notes,
      });
    }
    try {
      const response = await apiClient<Pet>("/api/v1/pets", {
        method: "POST",
        body: data,
        requestGuard,
      });
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Ответ создания питомца`, {
          success: response.success,
          petId: response.data?.id,
          petName: response.data?.name,
          error: response.error,
        });
      }
      return response;
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "create" },
      });
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при создании питомца`, {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          petData: { name: data.name, type: data.type },
        });
      }
      throw error;
    }
  },

  /**
   * Обновить питомца
   */
  update: async (
    petId: string,
    data: UpdatePetData,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<Pet>> => {
    // No arbitrary caller may bypass the AG4-approved weight-only endpoint.
    if (Object.prototype.hasOwnProperty.call(data, "weightKg"))
      return {
        success: false,
        code: "PET_VALIDATION_ERROR",
        error: "Поле веса недоступно для изменения",
        details: { fieldErrors: { weightKg: "UNSUPPORTED_FIELD" } },
      };
    try {
      const response = await apiClient<Pet>(`/api/v1/pets/${petId}`, {
        method: "PUT",
        body: data,
        ...(requestGuard ? { requestGuard } : {}),
      });

      return response;
    } catch (error) {
      reportClientError(new Error("PET_EDIT_NETWORK_UNKNOWN"), {
        issueKey: "PetsApi",
        keys: { operation: "update" },
      });
      throw error;
    }
  },

  /**
   * Удалить питомца
   */
  delete: async (petId: string): Promise<ApiResponse<void>> => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Удаление питомца`, { petId });
    }
    try {
      const response = await apiClient<void>(`/api/v1/pets/${petId}`, {
        method: "DELETE",
      });
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Ответ удаления питомца`, {
          success: response.success,
          petId,
          error: response.error,
        });
      }
      return response;
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "delete" },
      });
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при удалении питомца`, {
          petId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
      throw error;
    }
  },

  /**
   * Загрузить фото питомца (multipart/form-data).
   */
  uploadPhoto: async (
    petId: string,
    uri: string,
    mimeType: string,
    fileName: string,
  ): Promise<ApiResponse<{ photoUrl: string }>> => {
    const token = await SecureStore.getItemAsync("auth_token");
    if (!token) {
      return { success: false, error: "Не авторизован", code: "UNAUTHORIZED" };
    }

    return apiClientMultipart<{ photoUrl: string }>(
      `/api/v1/pets/${encodeURIComponent(petId)}/photo`,
      () => {
        const formData = new FormData();
        formData.append("file", {
          uri,
          type: mimeType,
          name: fileName,
        } as unknown as Blob);
        return formData;
      },
    );
  },

  getDocuments: async (petId: string): Promise<ApiResponse<PetDocument[]>> => {
    try {
      return await apiClient<PetDocument[]>(`/api/v1/pets/${encodeURIComponent(petId)}/documents`);
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "get_documents" },
      });
      throw error;
    }
  },

  uploadDocument: async (
    petId: string,
    uri: string,
    mimeType: string,
    fileName: string,
  ): Promise<ApiResponse<PetDocument>> => {
    const token = await SecureStore.getItemAsync("auth_token");
    if (!token) {
      return { success: false, error: "Не авторизован", code: "UNAUTHORIZED" };
    }
    if (
      !PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(
        mimeType as (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      return {
        success: false,
        error: "Недопустимый тип документа. Разрешены PDF, JPEG и PNG",
        code: "INVALID_DOCUMENT_TYPE",
      };
    }

    return apiClientMultipart<PetDocument>(
      `/api/v1/pets/${encodeURIComponent(petId)}/documents`,
      () => {
        const formData = new FormData();
        formData.append("file", {
          uri,
          type: mimeType,
          name: fileName,
        } as unknown as Blob);
        return formData;
      },
    );
  },

  deleteDocument: async (petId: string, documentId: string): Promise<ApiResponse<void>> => {
    try {
      return await apiClient<void>(
        `/api/v1/pets/${encodeURIComponent(petId)}/documents/${encodeURIComponent(documentId)}`,
        {
          method: "DELETE",
        },
      );
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "delete_document" },
      });
      throw error;
    }
  },

  renameDocument: async (
    petId: string,
    documentId: string,
    name: string,
  ): Promise<ApiResponse<PetDocument>> => {
    try {
      return await apiClient<PetDocument>(
        `/api/v1/pets/${encodeURIComponent(petId)}/documents/${encodeURIComponent(documentId)}`,
        {
          method: "PUT",
          body: { name },
        },
      );
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "rename_document" },
      });
      throw error;
    }
  },

  // ==================== Prevention Journal ====================

  getPreventionEntries: async (petId: string): Promise<ApiResponse<PetPreventionEntry[]>> => {
    try {
      return await apiClient<PetPreventionEntry[]>(`/api/v1/pets/${petId}/prevention`);
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "get_prevention_entries" },
      });
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка получения записей профилактики`, {
          petId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },

  addPreventionEntry: async (
    petId: string,
    data: CreatePreventionEntryData,
  ): Promise<ApiResponse<PetPreventionEntry>> => {
    try {
      return await apiClient<PetPreventionEntry>(`/api/v1/pets/${petId}/prevention`, {
        method: "POST",
        body: data,
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "add_prevention_entry" },
      });
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка добавления записи профилактики`, {
          petId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },

  updatePreventionEntry: async (
    petId: string,
    entryId: string,
    data: Partial<CreatePreventionEntryData>,
  ): Promise<ApiResponse<PetPreventionEntry>> => {
    try {
      return await apiClient<PetPreventionEntry>(`/api/v1/pets/${petId}/prevention/${entryId}`, {
        method: "PUT",
        body: data,
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "update_prevention_entry" },
      });
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка обновления записи профилактики`, {
          petId,
          entryId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },

  deletePreventionEntry: async (petId: string, entryId: string): Promise<ApiResponse<void>> => {
    try {
      return await apiClient<void>(`/api/v1/pets/${petId}/prevention/${entryId}`, {
        method: "DELETE",
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "delete_prevention_entry" },
      });
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка удаления записи профилактики`, {
          petId,
          entryId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },

  batchUpsertPreventionEntries: async (
    petId: string,
    entries: BatchPreventionEntry[],
  ): Promise<ApiResponse<{ created: number; updated: number; errors: string[] }>> => {
    try {
      return await apiClient<{
        created: number;
        updated: number;
        errors: string[];
      }>(`/api/v1/pets/${petId}/prevention/batch`, {
        method: "POST",
        body: { entries },
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsApi",
        keys: { operation: "batch_upsert_prevention_entries" },
      });
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка batch sync профилактики`, {
          petId,
          count: entries.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },
};
