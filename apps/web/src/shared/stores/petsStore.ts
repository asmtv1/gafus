import { PETS_CACHE_DURATION } from "@gafus/types";
import { createPet, deletePet, getUserPets, updatePet } from "@shared/lib/pets";
import { createWebLogger } from "@gafus/logger";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { UpdatePetInput } from "@gafus/types";
import type { PetsStore } from "./types";

// Создаем логгер для pets store
const logger = createWebLogger("web-pets-store");

// Утилиты для проверки кэша
const isStale = (timestamp: number, maxAge: number = PETS_CACHE_DURATION) => {
  return Date.now() - timestamp > maxAge;
};

// ===== STORE =====
export const usePetsStore = create<PetsStore>()(
  persist(
    (set, get) => ({
      // ===== СОСТОЯНИЕ =====
      pets: [],
      activePetId: null,
      isLoading: false,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
      error: null,
      lastFetched: null,

      // ===== СЕТТЕРЫ =====
      setPets: (pets) => {
        set({ pets, error: null, lastFetched: Date.now() });
      },

      setActivePetId: (petId) => {
        set({ activePetId: petId });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error });
      },

      // ===== ДЕЙСТВИЯ =====
      fetchPets: async () => {
        const state = get();

        // Проверяем кэш
        if (state.pets.length > 0 && state.lastFetched && !isStale(state.lastFetched)) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const pets = await getUserPets();
          set({
            pets,
            isLoading: false,
            lastFetched: Date.now(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ошибка загрузки питомцев";
          set({
            error: errorMessage,
            isLoading: false,
          });
          logger.error("Ошибка загрузки питомцев", error as Error, {
            operation: "load_pets_error",
          });
        }
      },

      createPet: async (data) => {
        set({ isCreating: true, error: null });

        try {
          const newPet = await createPet(data);
          set((state) => ({
            pets: [...state.pets, newPet],
            isCreating: false,
            lastFetched: Date.now(),
          }));
          return newPet;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ошибка создания питомца";
          set({
            error: errorMessage,
            isCreating: false,
          });
          logger.error("Ошибка создания питомца", error as Error, {
            operation: "create_pet_error",
            petData: data,
          });
          throw error;
        }
      },

      updatePet: async (data) => {
        set({ isUpdating: true, error: null });

        try {
          const updatedPet = await updatePet(data as UpdatePetInput);
          set((state) => ({
            pets: state.pets.map((pet) => (pet.id === data.id ? updatedPet : pet)),
            isUpdating: false,
            lastFetched: Date.now(),
          }));
          return updatedPet;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ошибка обновления питомца";
          set({
            error: errorMessage,
            isUpdating: false,
          });
          logger.error("Ошибка обновления питомца", error as Error, {
            operation: "update_pet_error",
            petId: data.id,
            updateData: data,
          });
          throw error;
        }
      },

      deletePet: async (petId) => {
        set({ isDeleting: true, error: null });

        try {
          await deletePet(petId);
          set((state) => ({
            pets: state.pets.filter((pet: { id: string }) => pet.id !== petId),
            activePetId: state.activePetId === petId ? null : state.activePetId,
            isDeleting: false,
            lastFetched: Date.now(),
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ошибка удаления питомца";
          set({
            error: errorMessage,
            isDeleting: false,
          });
          logger.error("Ошибка удаления питомца", error as Error, {
            operation: "delete_pet_error",
            petId: petId,
          });
          throw error;
        }
      },

      // ===== ГЕТТЕРЫ =====
      getActivePet: () => {
        const state = get();
        if (!state.activePetId) return null;
        return state.pets.find((pet) => pet.id === state.activePetId) || null;
      },

      getPetById: (petId) => {
        const state = get();
        return state.pets.find((pet) => pet.id === petId) || null;
      },

      hasPets: () => {
        const state = get();
        return state.pets.length > 0;
      },

      getPetsCount: () => {
        const state = get();
        return state.pets.length;
      },
    }),
    {
      name: "pets-store",
      partialize: (state) => ({
        // Сохраняем только важные данные
        pets: state.pets,
        activePetId: state.activePetId,
        lastFetched: state.lastFetched,
      }),
    },
  ),
);

// ===== ХУКИ ДЛЯ УДОБСТВА =====
export const usePetsData = () => {
  const { pets, activePetId, isLoading, error, fetchPets } = usePetsStore();

  return {
    pets,
    activePetId,
    isLoading,
    error,
    fetchPets,
  };
};

export const usePetsActions = () => {
  const { createPet, updatePet, deletePet, setActivePetId, isCreating, isUpdating, isDeleting } =
    usePetsStore();

  return {
    createPet,
    updatePet,
    deletePet,
    setActivePetId,
    isCreating,
    isUpdating,
    isDeleting,
  };
};

export const useActivePet = () => {
  const { getActivePet, setActivePetId, getPetById } = usePetsStore();

  return {
    activePet: getActivePet(),
    setActivePetId,
    getPetById,
  };
};
