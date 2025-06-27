export type Pet = {
  ownerId: string;
  id: string;
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm: number | null;
  weightKg: number | null;
  photoUrl: string | null;
  notes: string | null;
  awards: {
    id: string;
    title: string;
    event: string;
    date: string;
    rank?: string | null;
  }[];
};
export type PetFormData = {
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
};
