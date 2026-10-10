"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { trackEvent } from "@gafus/analytics";

import { createWebLogger } from "@gafus/logger";
import { reportClientError } from "@gafus/error-handling";
import { deletePet } from "@shared/lib/pets/deletePet";
import { profilePagePath } from "@shared/lib/profile/profilePagePath";
import { savePet } from "@shared/lib/pets/savePet";
import { formatIsoBirthDateToDdMmYyyy } from "@shared/lib/validation/petSchemas";
import { clearProfilePageCache } from "@shared/utils/clearProfileCache";
import { showEditPetAlert, showSuccessAlert, showErrorAlert } from "@shared/utils/sweetAlert";
import Swal from "sweetalert2";
import { getAllPetDocuments } from "@shared/lib/pets/pet-documents";
import { getPetsPreventionEntries } from "@shared/lib/pet-prevention/pet-prevention-client";

import PetCard from "./PetCard";
import styles from "./PetList.module.css";

import type { PetDocumentDto, Pet, PetFormData } from "@gafus/types";
import type { PreventionEntryDisplay } from "@/features/pet-prevention";

type OwnerPet = Pet;

// Создаем логгер для pet-list
const logger = createWebLogger("web-pet-list");

const handleDelete = async (
  petId: string,
  petName: string,
  pathOrScreen: string,
  router: ReturnType<typeof useRouter>,
  startTransition: (callback: () => void) => void,
  isPending: boolean,
  invalidateProfileCache: () => Promise<void>,
  profileRevalidatePath: string,
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
          await deletePet(petId, profileRevalidatePath);
          await invalidateProfileCache();
          trackEvent({
            eventName: "button_click",
            platform: "web",
            pathOrScreen,
            elementId: "profile-pet-delete-success",
          });
          await showSuccessAlert(`Питомец "${petName}" успешно удален!`);
          router.refresh();
        } catch (error) {
          reportClientError(error, {
            issueKey: "PetList",
            keys: { operation: "delete_pet" },
          });
          await showErrorAlert("Произошла ошибка при удалении питомца");
        }
      });
    }
  } catch (error) {
    reportClientError(error, {
      issueKey: "PetList",
      keys: { operation: "show_delete_dialog" },
    });
  }
};

export default function PetList({
  pets,
  isOwner,
  pathOrScreen: pathOrScreenProp,
  revalidatePath: revalidatePathProp,
}: {
  pets: OwnerPet[];
  isOwner: boolean;
  pathOrScreen?: string;
  revalidatePath?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { data: session } = useSession();
  const username = session?.user?.username ?? null;
  const profileRevalidatePath =
    revalidatePathProp ?? profilePagePath(username ?? undefined, "revalidate");
  const pathOrScreen =
    pathOrScreenProp ?? (username ? `/profile?username=${username}` : "/profile");
  const [documentsByPetId, setDocumentsByPetId] = useState<Record<string, PetDocumentDto[]>>({});
  const [preventionEntriesByPetId, setPreventionEntriesByPetId] = useState<
    Record<string, PreventionEntryDisplay[]>
  >({});
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const petIdsKey = useMemo(() => pets.map((pet) => pet.id).join(","), [pets]);

  useEffect(() => {
    if (!isOwner || pets.length === 0) {
      setDocumentsByPetId({});
      setPreventionEntriesByPetId({});
      setDocumentsError(null);
      setDocumentsLoading(false);
      return;
    }

    let cancelled = false;
    const loadDocuments = async () => {
      setDocumentsLoading(true);
      setDocumentsError(null);
      const response = await getAllPetDocuments();
      const preventionResponse = await getPetsPreventionEntries(pets.map((pet) => pet.id));
      if (cancelled) {
        return;
      }
      if (!response.success) {
        setDocumentsError(response.error ?? "Не удалось загрузить документы");
        setDocumentsLoading(false);
        return;
      }

      const grouped: Record<string, PetDocumentDto[]> = {};
      for (const document of response.data ?? []) {
        if (!grouped[document.petId]) {
          grouped[document.petId] = [];
        }
        grouped[document.petId].push(document);
      }
      setDocumentsByPetId(grouped);
      if (!preventionResponse.success) {
        logger.warn("Не удалось загрузить записи о процедурах пачкой", {
          error: preventionResponse.error ?? "unknown",
        });
        setPreventionEntriesByPetId({});
      } else {
        setPreventionEntriesByPetId(preventionResponse.data ?? {});
      }
      setDocumentsLoading(false);
    };

    loadDocuments().catch(() => {
      if (cancelled) {
        return;
      }
      setDocumentsError("Не удалось загрузить документы");
      setDocumentsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOwner, petIdsKey, pets.length]);

  const invalidateProfileCache = useCallback(async () => {
    try {
      await clearProfilePageCache(username);
    } catch (error) {
      reportClientError(error, {
        issueKey: "PetList",
        severity: "warning",
        keys: { operation: "clear_profile_cache" },
      });
      logger.warn("Не удалось очистить кэш профиля после операции с питомцем", {
        error: error instanceof Error ? error.message : String(error),
        operation: "warn",
      });
    }
  }, [username]);

  const handleEditClick = useCallback(
    async (pet: OwnerPet) => {
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen,
        elementId: "profile-pet-edit-open",
      });
      // Преобразуем OwnerPet в PetFormData для SweetAlert
      const petForEdit: PetFormData = {
        id: pet.id,
        name: pet.name,
        type: pet.type,
        breed: pet.breed || "",
        photoUrl: pet.photoUrl || "",
        notes: pet.notes || "",
        birthDate: formatIsoBirthDateToDdMmYyyy(
          pet.birthDate instanceof Date
            ? pet.birthDate.toISOString().split("T")[0]
            : pet.birthDate || "",
        ),
        heightCm: pet.heightCm || undefined,
        weightKg: pet.weightKg || undefined,
        neckGirthCm: pet.neckGirthCm || undefined,
        muzzleGirthCm: pet.muzzleGirthCm || undefined,
        bellyGirthCm: pet.bellyGirthCm || undefined,
      };

      try {
        const updatedPetData = await showEditPetAlert(petForEdit);

        if (updatedPetData) {
          startTransition(async () => {
            try {
              await savePet(updatedPetData);
              await invalidateProfileCache();
              trackEvent({
                eventName: "button_click",
                platform: "web",
                pathOrScreen,
                elementId: "profile-pet-edit-success",
              });
              await showSuccessAlert(`Питомец "${updatedPetData.name}" успешно обновлен!`);
              router.refresh();
            } catch (error) {
              reportClientError(error, {
                issueKey: "PetList",
                keys: { operation: "update_pet" },
              });
              await showErrorAlert("Произошла ошибка при обновлении питомца");
            }
          });
        }
      } catch (error) {
        reportClientError(error, {
          issueKey: "PetList",
          keys: { operation: "show_edit_form" },
        });
      }
    },
    [invalidateProfileCache, pathOrScreen, router, startTransition],
  );

  const handlePetDelete = useCallback(
    (petId: string, petName: string) => {
      void handleDelete(
        petId,
        petName,
        pathOrScreen,
        router,
        startTransition,
        isPending,
        invalidateProfileCache,
        profileRevalidatePath,
      );
    },
    [
      invalidateProfileCache,
      isPending,
      pathOrScreen,
      profileRevalidatePath,
      router,
      startTransition,
    ],
  );

  return (
    <div className={styles.container}>
      <h2>Питомцы</h2>
      {pets.length === 0 ? (
        <div className={styles.no_pets}>
          <Image
            src="/images/pets-empty.webp"
            alt=""
            width={220}
            height={180}
            style={{ maxWidth: "100%", objectFit: "contain" }}
          />
          <p>Питомцы не добавлены</p>
        </div>
      ) : (
        <ul className={styles.dog_list}>
          {pets.map((pet, index) => (
            <PetCard
              key={pet.id}
              pet={pet}
              index={index}
              isOwner={isOwner}
              onEdit={handleEditClick}
              onDelete={handlePetDelete}
              isPending={isPending}
              pathOrScreen={pathOrScreen}
              initialDocuments={documentsByPetId[pet.id] ?? []}
              documentsLoading={documentsLoading}
              documentsError={documentsError}
              initialPreventionEntries={preventionEntriesByPetId[pet.id] ?? []}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
