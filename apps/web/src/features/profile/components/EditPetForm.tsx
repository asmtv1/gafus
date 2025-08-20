"use client";

import { PetFormFields } from "@shared/components/ui/PetFormFields";
import { usePetForm } from "@shared/hooks/usePetForm";
import { savePet } from "@shared/lib/pet/savePet";

import type { Pet, PetFormData } from "@gafus/types";

interface EditPetFormProps {
  pet: Pet;
  onClose: () => void;
  onSave: () => void;
}

export default function EditPetForm({ pet, onClose, onSave }: EditPetFormProps) {
  const form = usePetForm({
    ...pet,
    breed: pet.breed ?? "",
    photoUrl: pet.photoUrl ?? "",
    notes: pet.notes ?? "",
    birthDate: pet.birthDate instanceof Date ? pet.birthDate.toISOString().split("T")[0] : "",
    heightCm: pet.heightCm ?? undefined,
    weightKg: pet.weightKg ?? undefined,
  });

  const onSubmit = async (data: PetFormData) => {
    try {
      console.warn("Данные формы перед отправкой:", data);
      const { photoUrl: _photoUrl, ...petData } = data;
      console.warn("Данные для savePet:", petData);
      await savePet({ ...petData, photoUrl: undefined });

      // Принудительно обновляем форму с новыми данными
      form.reset(data);

      onSave();
    } catch (err) {
      console.error("Ошибка при сохранении питомца:", err);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} style={{ maxWidth: 400 }}>
      <PetFormFields form={form} />
      <div style={{ marginTop: 16 }}>
        <button type="submit">Сохранить изменения</button>
        <button type="button" onClick={onClose} style={{ marginLeft: 8 }}>
          Отмена
        </button>
      </div>
    </form>
  );
}
