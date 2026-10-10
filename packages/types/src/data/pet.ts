// Типы для работы с питомцами

export interface Pet {
  id: string;
  name: string;
  type: string;
  breed: string | null;
  birthDate: Date;
  heightCm: number | null;
  weightKg: number | null;
  neckGirthCm: number | null;
  muzzleGirthCm: number | null;
  bellyGirthCm: number | null;
  notes: string | null;
  photoUrl: string | null;
  showInProfile: boolean;
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
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
  photoUrl?: string;
  notes?: string;
  ownerId?: string;
}
