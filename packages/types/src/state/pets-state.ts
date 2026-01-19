// State shape для питомцев (БЕЗ методов)

import type { Pet } from "../data/pet";

export interface PetsStateData {
  // Состояние
  pets: Pet[];
  activePetId: string | null;
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
  lastFetched: number | null;
}

// Константы
export const PETS_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
