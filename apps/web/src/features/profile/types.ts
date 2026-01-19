// Feature-level типы для profile

import type { PublicProfile, UserWithTrainings } from "@gafus/types";

export interface BioProps {
  publicData: PublicProfile;
  isOwner: boolean;
  username: string;
  userData?: UserWithTrainings | null;
}

export interface PrivateProfileSectionProps {
  children: React.ReactNode;
  isOwner: boolean;
}

export interface EditPetFormProps {
  pet?: {
    id: string;
    name: string;
    type: string;
    breed: string;
    birthDate: string;
    heightCm: number | null;
    weightKg: number | null;
    notes: string | null;
  };
  onSave: (pet: {
    id: string;
    name: string;
    type: string;
    breed: string;
    birthDate: string;
    heightCm: number | null;
    weightKg: number | null;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}

export interface ProfileClientProps {
  publicData: PublicProfile;
  isOwner: boolean;
  username: string;
}
