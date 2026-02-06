import * as SecureStore from "expo-secure-store";

import { apiClient, type ApiResponse } from "./client";
import { API_BASE_URL } from "@/constants";

const LOG_PREFIX = "[PetsAPI]";

export interface Pet {
  id: string;
  name: string;
  type: "DOG" | "CAT" | "OTHER";
  breed: string | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreatePetData {
  name: string;
  type: "DOG" | "CAT" | "OTHER";
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}

export interface UpdatePetData extends Partial<CreatePetData> {}

/**
 * API модуль для работы с питомцами
 */
export const petsApi = {
  /**
   * Получить список питомцев пользователя
   */
  getAll: async (): Promise<ApiResponse<Pet[]>> => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Запрос списка питомцев`);
    }
    try {
      const response = await apiClient<Pet[]>("/api/v1/pets");
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Получен ответ списка питомцев`, {
          success: response.success,
          count: response.data?.length || 0,
          error: response.error,
        });
      }
      return response;
    } catch (error) {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при получении списка питомцев`, {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
      throw error;
    }
  },

  /**
   * Создать питомца
   */
  create: async (data: CreatePetData): Promise<ApiResponse<Pet>> => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Создание питомца`, {
        name: data.name,
        type: data.type,
        breed: data.breed,
        birthDate: data.birthDate,
        hasHeight: !!data.heightCm,
        hasWeight: !!data.weightKg,
        hasNotes: !!data.notes,
      });
    }
    try {
      const response = await apiClient<Pet>("/api/v1/pets", {
        method: "POST",
        body: data,
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
  update: async (petId: string, data: UpdatePetData): Promise<ApiResponse<Pet>> => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Обновление питомца`, {
        petId,
        updatedFields: Object.keys(data),
        name: data.name,
        type: data.type,
      });
    }
    try {
      const response = await apiClient<Pet>(`/api/v1/pets/${petId}`, {
        method: "PUT",
        body: data,
      });
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Ответ обновления питомца`, {
          success: response.success,
          petId: response.data?.id,
          petName: response.data?.name,
          error: response.error,
        });
      }
      return response;
    } catch (error) {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при обновлении питомца`, {
          petId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
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

    const formData = new FormData();
    formData.append("file", {
      uri,
      type: mimeType,
      name: fileName,
    } as unknown as Blob);

    const response = await fetch(`${API_BASE_URL}/api/v1/pets/${petId}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Ошибка загрузки фото",
        code: data.code,
      };
    }
    return data;
  },
};
