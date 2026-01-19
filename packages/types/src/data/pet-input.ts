// Input типы для питомцев

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

export interface PetFormFieldsData {
  name: string;
  type: "DOG" | "CAT";
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}
