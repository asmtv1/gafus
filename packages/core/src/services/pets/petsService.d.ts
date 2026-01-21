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
    name?: string;
    type?: string;
    breed?: string;
    birthDate?: string;
    heightCm?: number;
    weightKg?: number;
    photoUrl?: string;
    notes?: string;
}
/**
 * Получить список питомцев пользователя
 */
export declare function getUserPets(userId: string): Promise<({
    awards: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        courseId: string | null;
        date: Date | null;
        petId: string;
        event: string | null;
        rank: string | null;
        examType: string | null;
        examScore: number | null;
    }[];
} & {
    type: import("@prisma/client").$Enums.PetType;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    birthDate: Date;
    ownerId: string;
    breed: string;
    heightCm: number | null;
    weightKg: number | null;
    photoUrl: string | null;
    notes: string | null;
})[]>;
/**
 * Получить питомца по ID
 */
export declare function getPetById(petId: string, userId: string): Promise<({
    awards: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        courseId: string | null;
        date: Date | null;
        petId: string;
        event: string | null;
        rank: string | null;
        examType: string | null;
        examScore: number | null;
    }[];
} & {
    type: import("@prisma/client").$Enums.PetType;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    birthDate: Date;
    ownerId: string;
    breed: string;
    heightCm: number | null;
    weightKg: number | null;
    photoUrl: string | null;
    notes: string | null;
}) | null>;
/**
 * Создать питомца
 */
export declare function createPet(userId: string, data: CreatePetInput): Promise<{
    awards: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        courseId: string | null;
        date: Date | null;
        petId: string;
        event: string | null;
        rank: string | null;
        examType: string | null;
        examScore: number | null;
    }[];
} & {
    type: import("@prisma/client").$Enums.PetType;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    birthDate: Date;
    ownerId: string;
    breed: string;
    heightCm: number | null;
    weightKg: number | null;
    photoUrl: string | null;
    notes: string | null;
}>;
/**
 * Обновить питомца
 */
export declare function updatePet(petId: string, userId: string, data: UpdatePetInput): Promise<({
    awards: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        courseId: string | null;
        date: Date | null;
        petId: string;
        event: string | null;
        rank: string | null;
        examType: string | null;
        examScore: number | null;
    }[];
} & {
    type: import("@prisma/client").$Enums.PetType;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    birthDate: Date;
    ownerId: string;
    breed: string;
    heightCm: number | null;
    weightKg: number | null;
    photoUrl: string | null;
    notes: string | null;
}) | null>;
/**
 * Удалить питомца
 */
export declare function deletePet(petId: string, userId: string): Promise<boolean>;
//# sourceMappingURL=petsService.d.ts.map