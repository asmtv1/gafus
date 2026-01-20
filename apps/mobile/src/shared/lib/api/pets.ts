import { apiClient, type ApiResponse } from "./client";

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
  breed?: string;
  birthDate?: string;
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
    return apiClient<Pet[]>("/api/v1/pets");
  },

  /**
   * Создать питомца
   */
  create: async (data: CreatePetData): Promise<ApiResponse<Pet>> => {
    return apiClient<Pet>("/api/v1/pets", {
      method: "POST",
      body: data,
    });
  },

  /**
   * Обновить питомца
   */
  update: async (petId: string, data: UpdatePetData): Promise<ApiResponse<Pet>> => {
    return apiClient<Pet>(`/api/v1/pets/${petId}`, {
      method: "PUT",
      body: data,
    });
  },

  /**
   * Удалить питомца
   */
  delete: async (petId: string): Promise<ApiResponse<void>> => {
    return apiClient<void>(`/api/v1/pets/${petId}`, {
      method: "DELETE",
    });
  },
};
