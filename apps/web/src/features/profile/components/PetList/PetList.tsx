"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useSession } from "next-auth/react";

import { createWebLogger } from "@gafus/logger";
import { deletePet } from "@shared/lib/pets/deletePet";
import { savePet } from "@shared/lib/pets/savePet";
import { clearProfilePageCache } from "@shared/utils/clearProfileCache";
import { showEditPetAlert, showSuccessAlert, showErrorAlert } from "@shared/utils/sweetAlert";
import Swal from "sweetalert2";

import PetCard from "./PetCard";
import styles from "./PetList.module.css";

import type { PublicProfile, PetFormData } from "@gafus/types";

type PetFromPublicProfile = PublicProfile["pets"][0];

// Создаем логгер для pet-list
const logger = createWebLogger("web-pet-list");

const handleDelete = async (
  petId: string,
  petName: string,
  router: ReturnType<typeof useRouter>,
  startTransition: (callback: () => void) => void,
  isPending: boolean,
  invalidateProfileCache: () => Promise<void>,
) => {
  if (isPending) return;

  try {
    const result = await Swal.fire({
      title: "Удалить питомца?",
      text: `Вы уверены, что хотите удалить питомца "${petName}"? Это действие нельзя отменить.`,
      imageUrl: "/uploads/logo.png",
      imageWidth: 80,
      imageHeight: 80,
      imageAlt: "Гафус",
      showCancelButton: true,
      confirmButtonText: "Да, удалить",
      cancelButtonText: "Отмена",
      confirmButtonColor: "#d32f2f",
      cancelButtonColor: "#F5F0E8",
      customClass: {
        popup: "swal2-popup-custom",
        title: "swal2-title-custom",
        htmlContainer: "swal2-content-custom",
        confirmButton: "swal2-confirm-custom",
        cancelButton: "swal2-cancel-custom",
      },
    });

    if (result.isConfirmed) {
      startTransition(async () => {
        try {
          await deletePet(petId, "/profile");
          await invalidateProfileCache();
          await showSuccessAlert(`Питомец "${petName}" успешно удален!`);
          router.refresh();
        } catch (error) {
          logger.error("Ошибка при удалении питомца", error as Error, {
            operation: "delete_pet_error",
          });
          await showErrorAlert("Произошла ошибка при удалении питомца");
        }
      });
    }
  } catch (error) {
    logger.error("Ошибка при показе диалога удаления", error as Error, {
      operation: "show_delete_dialog_error",
    });
  }
};

export default function PetList({
  pets,
  isOwner,
}: {
  pets: PetFromPublicProfile[];
  isOwner: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { data: session } = useSession();
  const username = session?.user?.username ?? null;

  const invalidateProfileCache = async () => {
    try {
      await clearProfilePageCache(username);
    } catch (error) {
      logger.warn("Не удалось очистить кэш профиля после операции с питомцем", {
        error: error instanceof Error ? error.message : String(error),
        operation: "warn",
      });
    }
  };

  const handleEditClick = async (pet: PetFromPublicProfile) => {
    // Преобразуем PetFromPublicProfile в PetFormData для SweetAlert
    const petForEdit: PetFormData = {
      id: pet.id,
      name: pet.name,
      type: pet.type,
      breed: pet.breed || "",
      photoUrl: pet.photoUrl || "",
      notes: pet.notes || "",
      birthDate:
        pet.birthDate instanceof Date
          ? pet.birthDate.toISOString().split("T")[0]
          : pet.birthDate || "",
      heightCm: pet.heightCm || undefined,
      weightKg: pet.weightKg || undefined,
    };

    try {
      const updatedPetData = await showEditPetAlert(petForEdit);

      if (updatedPetData) {
        startTransition(async () => {
          try {
            await savePet(updatedPetData);
            await invalidateProfileCache();
            await showSuccessAlert(`Питомец "${updatedPetData.name}" успешно обновлен!`);
            router.refresh();
          } catch (error) {
            logger.error("Ошибка при обновлении питомца:", error as Error, {
              operation: "update_pet_error",
            });
            await showErrorAlert("Произошла ошибка при обновлении питомца");
          }
        });
      }
    } catch (error) {
      logger.error("Ошибка при открытии формы редактирования:", error as Error, {
        operation: "error",
      });
    }
  };

  return (
    <div className={styles.container}>
      <h2>Питомцы</h2>
      {pets.length === 0 ? (
        <p className={styles.no_pets}>Питомцы не добавлены</p>
      ) : (
        <ul className={styles.dog_list}>
          {pets.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              isOwner={isOwner}
              onEdit={handleEditClick}
              onDelete={(id, name) =>
                handleDelete(id, name, router, startTransition, isPending, invalidateProfileCache)
              }
              isPending={isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
