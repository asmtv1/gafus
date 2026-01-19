// Типы для работы с питомцами

export interface Pet {
  id: string;
  name: string;
  type: string;
  breed: string | null;
  birthDate: Date;
  heightCm: number | null;
  weightKg: number | null;
  notes: string | null;
  photoUrl: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PetFormData {
  id: string;
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
  ownerId?: string;
}
