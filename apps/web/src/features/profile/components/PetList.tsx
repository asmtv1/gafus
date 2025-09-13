"use client";

import DeleteForeverSharpIcon from "@mui/icons-material/DeleteForeverSharp";
import EditSharpIcon from "@mui/icons-material/EditSharp";
import { deletePet } from "@shared/lib/pet/deletePet";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";

import EditablePetAvatar from "./EditablePetAvatar";
import EditPetForm from "./EditPetForm";
import styles from "./PetList.module.css";

import type { PublicProfile, Pet } from "@gafus/types";

type PetFromPublicProfile = PublicProfile['pets'][0];

import { getAgeWithMonths, declOfNum } from "@/utils";
import { Avatar, IconButton, Modal, Box } from "@/utils/muiImports";
import { getPetTypeLabel } from "@/utils/petType";

const handleDelete = (
  petId: string,
  router: ReturnType<typeof useRouter>,
  startTransition: (callback: () => void) => void,
  isPending: boolean,
) => {
  if (isPending) return;
  const confirmDelete = confirm("Удалить этого питомца?");
  if (!confirmDelete) return;

  startTransition(async () => {
    try {
      await deletePet(petId, "/profile");
      router.refresh();
    } catch {
      alert("Ошибка при удалении питомца");
    }
  });
};

export default function PetList({ pets, isOwner }: { pets: PetFromPublicProfile[]; isOwner: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);

  const handleEditClick = (pet: PetFromPublicProfile) => {
    // Преобразуем PetFromPublicProfile в Pet для EditPetForm
    const petForEdit: Pet = {
      ...pet,
      breed: pet.breed || "",
      birthDate: pet.birthDate || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setSelectedPet(petForEdit);
    setShowEdit(true);
  };

  const PetCard = ({ pet }: { pet: PetFromPublicProfile }) => (
    <li className={styles.dog_item} key={pet.id}>
      {isOwner ? (
        <EditablePetAvatar avatarUrl={pet.photoUrl} petId={pet.id} />
      ) : (
        <Avatar
          alt={`${pet.name} фото питомца`}
          src={pet.photoUrl || "/pet-avatar.jpg"}
          sx={{ width: 50, height: 50 }}
        />
      )}

      <div className={styles.dog_info}>
        <h3>
          {pet.name} ({getPetTypeLabel(pet.type)})
        </h3>
        <p>Порода: {pet.breed}</p>

        {pet.birthDate && (() => {
          const age = getAgeWithMonths(
            pet.birthDate instanceof Date ? pet.birthDate.toISOString() : pet.birthDate,
          );
          return (
            <p>
              Возраст: {age.years} {declOfNum(age.years, ["год", "года", "лет"])}
              {age.months > 0 && (
                <>
                  {age.months} {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                </>
              )}
            </p>
          );
        })()}
        {pet.heightCm && <p>Рост: {pet.heightCm} см</p>}
        {pet.weightKg && <p>Вес: {pet.weightKg} кг</p>}
        {pet.notes && <p>Заметки: {pet.notes}</p>}
      </div>
      {isOwner ? (
        <div className={styles.dog_actions}>
          <IconButton
            onClick={() => handleEditClick(pet)}
            size="small"
            aria-label="Редактировать питомца"
          >
            <EditSharpIcon />
          </IconButton>
          <IconButton
            onClick={() => handleDelete(pet.id, router, startTransition, isPending)}
            size="small"
            aria-label="Удалить питомца"
            disabled={isPending}
          >
            <DeleteForeverSharpIcon />
          </IconButton>
        </div>
      ) : null}
    </li>
  );

  return (
    <div className={styles.container}>
      <h2>Питомцы</h2>
      {pets.length === 0 ? (
        <p className={styles.no_pets}>Питомцы не добавлены</p>
      ) : (
        <ul className={styles.dog_list}>
          {pets.map((pet) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
        </ul>
      )}

      {showEdit && selectedPet && (
        <Modal open={showEdit} onClose={() => setShowEdit(false)} aria-labelledby="edit-pet-modal">
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 400,
              bgcolor: "background.paper",
              border: "2px solid #000",
              boxShadow: 24,
              p: 4,
            }}
          >
            <EditPetForm
              pet={selectedPet}
              onClose={() => setShowEdit(false)}
              onSave={() => {
                setShowEdit(false);
                router.refresh();
              }}
            />
          </Box>
        </Modal>
      )}
    </div>
  );
}
