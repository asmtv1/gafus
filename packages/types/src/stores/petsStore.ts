// ===== ТИПЫ =====
export interface Pet {
  id: string;
  name: string;
  type: string;
  breed: string;
  birthDate: Date;
  heightCm: number | null;
  weightKg: number | null;
  photoUrl: string | null;
  notes: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  awards: PetAward[];
}

export interface PetAward {
  id: string;
  title: string;
  event: string | null;
  date: Date | null;
  rank: string | null;
}

export interface CreatePetInput {
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}

export interface UpdatePetInput {
  id: string;
  name?: string;
  type?: string;
  breed?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}

export interface PetsState {
  // ===== СОСТОЯНИЕ =====
  pets: Pet[];
  activePetId: string | null;
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
  lastFetched: number | null;

  // ===== СЕТТЕРЫ =====
  setPets: (pets: Pet[]) => void;
  setActivePetId: (petId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // ===== ДЕЙСТВИЯ =====
  fetchPets: () => Promise<void>;
  createPet: (data: CreatePetInput) => Promise<Pet>;
  updatePet: (data: UpdatePetInput) => Promise<Pet>;
  deletePet: (petId: string) => Promise<void>;

  // ===== ГЕТТЕРЫ =====
  getActivePet: () => Pet | null;
  getPetById: (petId: string) => Pet | null;
  hasPets: () => boolean;
  getPetsCount: () => number;
}

// ===== КОНСТАНТЫ =====
export const CACHE_DURATION = 5 * 60 * 1000; // 5 минут
