import type { PublicProfile, UserWithTrainings } from "../data/user";
import type { Control, FieldErrors } from "../types/react-types";
import type { PetFormFieldsData } from "./forms";
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
export interface PetFormFieldsProps {
    control: Control<PetFormFieldsData>;
    errors: FieldErrors;
}
//# sourceMappingURL=profile.d.ts.map