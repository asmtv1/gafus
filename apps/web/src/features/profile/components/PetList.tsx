"use client";


import { createWebLogger } from "@gafus/logger";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { deletePet } from "@shared/lib/pet/deletePet";
import { savePet } from "@shared/lib/pet/savePet";
import { showEditPetAlert, showSuccessAlert, showErrorAlert } from "@shared/utils/sweetAlert";
import Swal from 'sweetalert2';
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import EditablePetAvatar from "./EditablePetAvatar";
import styles from "./PetList.module.css";

import type { PublicProfile, PetFormData } from "@gafus/types";

type PetFromPublicProfile = PublicProfile['pets'][0];

import { getAgeWithMonths, declOfNum } from "@/utils";
import { Avatar, IconButton } from "@/utils/muiImports";
import { getPetTypeLabel } from "@/utils/petType";

// Создаем логгер для pet-list
const logger = createWebLogger('web-pet-list');

const handleDelete = async (
  petId: string,
  petName: string,
  router: ReturnType<typeof useRouter>,
  startTransition: (callback: () => void) => void,
  isPending: boolean,
) => {
  if (isPending) return;
  
  try {
    const result = await Swal.fire({
      title: 'Удалить питомца?',
      text: `Вы уверены, что хотите удалить питомца "${petName}"? Это действие нельзя отменить.`,
      imageUrl: '/uploads/logo.png',
      imageWidth: 80,
      imageHeight: 80,
      imageAlt: 'Гафус',
      showCancelButton: true,
      confirmButtonText: 'Да, удалить',
      cancelButtonText: 'Отмена',
      confirmButtonColor: '#d32f2f',
      cancelButtonColor: '#F5F0E8',
      customClass: {
        popup: 'swal2-popup-custom',
        title: 'swal2-title-custom',
        htmlContainer: 'swal2-content-custom',
        confirmButton: 'swal2-confirm-custom',
        cancelButton: 'swal2-cancel-custom',
      },
    });

    if (result.isConfirmed) {
      startTransition(async () => {
        try {
          await deletePet(petId, "/profile");
          await showSuccessAlert(`Питомец "${petName}" успешно удален!`);
          router.refresh();
        } catch {
          logger.error("Ошибка при удалении питомца");
          await showErrorAlert("Произошла ошибка при удалении питомца");
        }
      });
    }
  } catch (error) {
    logger.error("Ошибка при показе диалога удаления", error as Error, { operation: 'show_delete_dialog_error' });
  }
};

export default function PetList({ pets, isOwner }: { pets: PetFromPublicProfile[]; isOwner: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleEditClick = async (pet: PetFromPublicProfile) => {
    // Преобразуем PetFromPublicProfile в PetFormData для SweetAlert
    const petForEdit: PetFormData = {
      id: pet.id,
      name: pet.name,
      type: pet.type,
      breed: pet.breed || "",
      photoUrl: pet.photoUrl || "",
      notes: pet.notes || "",
      birthDate: pet.birthDate instanceof Date ? pet.birthDate.toISOString().split("T")[0] : pet.birthDate || "",
      heightCm: pet.heightCm || undefined,
      weightKg: pet.weightKg || undefined,
    };

    try {
      const updatedPetData = await showEditPetAlert(petForEdit);
      
      if (updatedPetData) {
        startTransition(async () => {
          try {
            await savePet(updatedPetData);
            await showSuccessAlert(`Питомец "${updatedPetData.name}" успешно обновлен!`);
            router.refresh();
          } catch (error) {
            logger.error("Ошибка при обновлении питомца:", error as Error, { operation: 'error' });
            await showErrorAlert("Произошла ошибка при обновлении питомца");
          }
        });
      }
    } catch (error) {
      logger.error("Ошибка при открытии формы редактирования:", error as Error, { operation: 'error' });
    }
  };

  const PetCard = ({ pet }: { pet: PetFromPublicProfile }) => (
    <li className={styles.dog_item} key={pet.id}>
      {isOwner ? (
        <div className={styles.avatar_container}>
          <EditablePetAvatar avatarUrl={pet.photoUrl} petId={pet.id} />
        </div>
      ) : (
        <div className={styles.avatar_container}>
          <Avatar
            alt={`${pet.name} фото питомца`}
            src={pet.photoUrl || "/pet-avatar.jpg"}
          />
        </div>
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
          
          // Показываем только месяцы и годы
          if (age.years === 0) {
            // Только месяцы
            return (
              <p>
                Возраст: {age.months} {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
              </p>
            );
          } else {
            // Годы и месяцы
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
          }
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
            <EditRoundedIcon />
          </IconButton>
          <IconButton
            onClick={() => handleDelete(pet.id, pet.name, router, startTransition, isPending)}
            size="small"
            aria-label="Удалить питомца"
            disabled={isPending}
          >
            <DeleteRoundedIcon />
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

    </div>
  );
}
