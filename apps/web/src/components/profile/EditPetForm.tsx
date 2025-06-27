"use client";

import { savePet } from "@/lib/pet/savePet";
import { PetFormFields } from "@/components/ui/PetFormFields";
import { usePetForm } from "@/hooks/usePetForm";
import { Pet, PetFormData } from "@/types/Pet";

type EditPetFormProps = {
  pet: Pet;
  onClose: () => void;
  onSave: () => void;
};

export default function EditPetForm({
  pet,
  onClose,
  onSave,
}: EditPetFormProps) {
  const form = usePetForm({
    ...pet,
    breed: pet.breed ?? "",
    photoUrl: pet.photoUrl ?? "",
    notes: pet.notes ?? "",
    birthDate: pet.birthDate?.split("T")[0] ?? "",
    heightCm: pet.heightCm ?? undefined,
    weightKg: pet.weightKg ?? undefined,
  });

  const onSubmit = async (data: PetFormData) => {
    try {
      await savePet(data);
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
