"use client";

import { memo, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@gafus/analytics";
import { useCSRFStore } from "@gafus/csrf";

import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import { getAgeWithMonths, declOfNum, getPetTypeLabel } from "@gafus/core/utils";
import { Avatar, IconButton } from "@shared/utils/muiImports";

import EditablePetAvatar from "../EditablePetAvatar";
import styles from "./PetList.module.css";
import {
  deletePetDocumentById,
  uploadPetDocument,
} from "@shared/lib/pets/pet-documents";

import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  type PetDocumentDto,
  type PublicProfile,
} from "@gafus/types";
import type { ChangeEvent } from "react";

type PetFromPublicProfile = PublicProfile["pets"][0];

interface PetCardProps {
  pet: PetFromPublicProfile;
  isOwner: boolean;
  onEdit: (pet: PetFromPublicProfile) => void;
  onDelete: (petId: string, petName: string) => void;
  isPending: boolean;
  pathOrScreen: string;
  initialDocuments: PetDocumentDto[];
  documentsLoading: boolean;
  documentsError: string | null;
}

const PetCard = memo(function PetCard({
  pet,
  isOwner,
  onEdit,
  onDelete,
  isPending,
  pathOrScreen,
  initialDocuments,
  documentsLoading,
  documentsError,
}: PetCardProps) {
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [documents, setDocuments] = useState<PetDocumentDto[]>(initialDocuments);
  const [localDocumentsError, setLocalDocumentsError] = useState<string | null>(null);
  const [documentsBusy, setDocumentsBusy] = useState(false);

  useEffect(() => {
    if (!csrfToken) {
      void fetchToken();
    }
  }, [csrfToken, fetchToken]);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const trackProfilePetClick = useCallback(
    (elementId: string) => {
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen,
        elementId,
      });
    },
    [pathOrScreen],
  );

  const handlePreventionLinkClick = useCallback(() => {
    trackProfilePetClick("profile-pet-prevention-open");
  }, [trackProfilePetClick]);

  const handleEditIconClick = useCallback(() => {
    trackProfilePetClick("profile-pet-edit-click");
    onEdit(pet);
  }, [onEdit, pet, trackProfilePetClick]);

  const handleDeleteIconClick = useCallback(() => {
    trackProfilePetClick("profile-pet-delete-click");
    onDelete(pet.id, pet.name);
  }, [onDelete, pet.id, pet.name, trackProfilePetClick]);

  const handleDocumentUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen,
        elementId: "pet-document-upload",
      });
      if (!file) {
        return;
      }
      if (!PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number])) {
        setLocalDocumentsError("Недопустимый тип документа. Разрешены PDF, JPEG и PNG");
        return;
      }
      if (file.size > PET_DOCUMENT_MAX_SIZE_BYTES) {
        setLocalDocumentsError("Размер документа превышает 10 МБ");
        return;
      }
      if (!csrfToken) {
        setLocalDocumentsError("Не удалось получить CSRF-токен");
        return;
      }

      setDocumentsBusy(true);
      setLocalDocumentsError(null);
      const response = await uploadPetDocument(pet.id, file, csrfToken);
      if (!response.success) {
        trackEvent({
          eventName: "button_click",
          platform: "web",
          pathOrScreen,
          elementId: "pet-document-upload",
        });
        setLocalDocumentsError(response.error ?? "Не удалось загрузить документ");
        setDocumentsBusy(false);
        return;
      }
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen,
        elementId: "pet-document-upload",
      });

      setDocuments((prev) => {
        const next = [response.data as PetDocumentDto, ...prev];
        return next.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      });
      setDocumentsBusy(false);
    },
    [csrfToken, pathOrScreen, pet.id],
  );

  const handleDocumentDelete = useCallback(
    async (documentId: string, name: string) => {
      const confirmed = window.confirm(`Удалить документ "${name}"?`);
      if (!confirmed) {
        return;
      }
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen,
        elementId: "pet-document-delete",
      });
      if (!csrfToken) {
        setLocalDocumentsError("Не удалось получить CSRF-токен");
        return;
      }
      setDocumentsBusy(true);
      setLocalDocumentsError(null);
      const response = await deletePetDocumentById(pet.id, documentId, csrfToken);
      if (!response.success) {
        trackEvent({
          eventName: "button_click",
          platform: "web",
          pathOrScreen,
          elementId: "pet-document-delete",
        });
        setLocalDocumentsError(response.error ?? "Не удалось удалить документ");
        setDocumentsBusy(false);
        return;
      }
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen,
        elementId: "pet-document-delete",
      });
      setDocuments((prev) => prev.filter((document) => document.id !== documentId));
      setDocumentsBusy(false);
    },
    [csrfToken, pathOrScreen, pet.id],
  );

  const handleDocumentOpen = useCallback(() => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen,
      elementId: "pet-document-open-click",
    });
  }, [pathOrScreen]);

  return (
    <li className={styles.dog_item}>
      {isOwner ? (
        <div className={styles.avatar_container}>
          <EditablePetAvatar avatarUrl={pet.photoUrl} petId={pet.id} />
        </div>
      ) : (
        <div className={styles.avatar_container}>
          <Avatar
            alt={`${pet.name} фото питомца`}
            src={pet.photoUrl || "/uploads/pet-avatar.jpg"}
          />
        </div>
      )}

      <div className={styles.dog_info}>
        <h3>
          {pet.name} ({getPetTypeLabel(pet.type)})
        </h3>
        <p>Порода: {pet.breed}</p>

        {pet.birthDate &&
          (() => {
            const age = getAgeWithMonths(
              pet.birthDate instanceof Date ? pet.birthDate.toISOString() : pet.birthDate,
            );

            if (age.years === 0) {
              return (
                <p>
                  Возраст: {age.months} {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                </p>
              );
            }
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
        {isOwner && (
          <Link
            href={`/profile/pets/${pet.id}/prevention`}
            className={styles.preventionLink}
            onClick={handlePreventionLinkClick}
          >
            <ListAltOutlinedIcon className={styles.preventionLinkIcon} fontSize="small" />
            Записи о процедурах
          </Link>
        )}
      </div>
      {isOwner ? (
        <div className={styles.dog_actions}>
          <IconButton
            onClick={handleEditIconClick}
            size="small"
            aria-label="Редактировать питомца"
          >
            <EditRoundedIcon />
          </IconButton>
          <IconButton
            onClick={handleDeleteIconClick}
            size="small"
            aria-label="Удалить питомца"
            disabled={isPending}
          >
            <DeleteRoundedIcon />
          </IconButton>
        </div>
      ) : null}
      {isOwner ? (
        <div className={styles.documentsSection}>
          <div className={styles.documentsHeader}>
            <span className={styles.documentsTitle}>Документы</span>
            <label className={styles.documentUploadLabel} aria-disabled={documentsBusy}>
              Добавить
              <input
                type="file"
                accept={PET_DOCUMENT_ALLOWED_MIME_TYPES.join(",")}
                className={styles.documentUploadInput}
                onChange={handleDocumentUpload}
                disabled={documentsBusy}
              />
            </label>
          </div>
          {documentsLoading ? <p className={styles.documentsHint}>Загрузка документов...</p> : null}
          {documentsError ? <p className={styles.documentsError}>{documentsError}</p> : null}
          {localDocumentsError ? (
            <p className={styles.documentsError}>{localDocumentsError}</p>
          ) : null}
          {!documentsLoading && !documentsError && !localDocumentsError && documents.length === 0 ? (
            <p className={styles.documentsHint}>Документы пока не добавлены</p>
          ) : null}
          {documents.map((document) => (
            <div key={document.id} className={styles.documentItem}>
              <span className={styles.documentName} title={document.name}>
                {document.name}
              </span>
              <div className={styles.documentActions}>
                <a
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.documentOpen}
                  onClick={handleDocumentOpen}
                >
                  Открыть
                </a>
                <button
                  type="button"
                  className={styles.documentDelete}
                  onClick={() => handleDocumentDelete(document.id, document.name)}
                  disabled={documentsBusy}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
});

export default PetCard;
