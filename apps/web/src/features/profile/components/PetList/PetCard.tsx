"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { trackEvent } from "@gafus/analytics";
import { useCSRFStore } from "@gafus/csrf";

import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { getAgeWithMonths, declOfNum, getPetTypeLabel } from "@gafus/core/utils";
import { Avatar, IconButton } from "@shared/utils/muiImports";
import { Alert } from "@mui/material";
import { PreventionEntryList } from "@features/pet-prevention/components";

import EditablePetAvatar from "../EditablePetAvatar";
import styles from "./PetList.module.css";
import {
  deletePetDocumentById,
  renamePetDocumentById,
  uploadPetDocument,
} from "@shared/lib/pets/pet-documents";
import { getPetPreventionEntries } from "@shared/lib/pet-prevention/pet-prevention-client";

import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  type PetDocumentDto,
  type PublicProfile,
} from "@gafus/types";
import type { ChangeEvent } from "react";
import type { PreventionEntryDisplay } from "@features/pet-prevention/types";

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
  initialPreventionEntries: PreventionEntryDisplay[];
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
  initialPreventionEntries,
}: PetCardProps) {
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [documents, setDocuments] = useState<PetDocumentDto[]>(initialDocuments);
  const [localDocumentsError, setLocalDocumentsError] = useState<string | null>(null);
  const [documentsBusy, setDocumentsBusy] = useState(false);
  const [pendingDocumentFile, setPendingDocumentFile] = useState<File | null>(null);
  const [pendingDocumentName, setPendingDocumentName] = useState("");
  const [pendingDocumentPreviewUrl, setPendingDocumentPreviewUrl] = useState<string | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editingDocumentName, setEditingDocumentName] = useState("");
  const [preventionEntries, setPreventionEntries] = useState<PreventionEntryDisplay[]>([]);
  const [preventionLoading, setPreventionLoading] = useState(false);
  const [preventionError, setPreventionError] = useState<string | null>(null);

  useEffect(() => {
    if (!csrfToken) {
      void fetchToken();
    }
  }, [csrfToken, fetchToken]);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setPreventionEntries(initialPreventionEntries);
  }, [initialPreventionEntries]);

  useEffect(() => {
    return () => {
      if (pendingDocumentPreviewUrl) {
        URL.revokeObjectURL(pendingDocumentPreviewUrl);
      }
    };
  }, [pendingDocumentPreviewUrl]);

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

  const handleEditIconClick = useCallback(() => {
    trackProfilePetClick("profile-pet-edit-click");
    onEdit(pet);
  }, [onEdit, pet, trackProfilePetClick]);

  const handleDeleteIconClick = useCallback(() => {
    trackProfilePetClick("profile-pet-delete-click");
    onDelete(pet.id, pet.name);
  }, [onDelete, pet.id, pet.name, trackProfilePetClick]);

  const isImageDocument = useCallback((mimeType: string) => mimeType.startsWith("image/"), []);

  const clearPendingDocument = useCallback(() => {
    if (pendingDocumentPreviewUrl) {
      URL.revokeObjectURL(pendingDocumentPreviewUrl);
    }
    setPendingDocumentFile(null);
    setPendingDocumentName("");
    setPendingDocumentPreviewUrl(null);
  }, [pendingDocumentPreviewUrl]);

  const buildUploadFileName = useCallback((name: string, originalName: string) => {
    const safeName = name.trim();
    if (!safeName) {
      return originalName;
    }
    const extension = originalName.includes(".") ? originalName.split(".").pop() : "";
    if (!extension) {
      return safeName;
    }
    return safeName.endsWith(`.${extension}`) ? safeName : `${safeName}.${extension}`;
  }, []);

  const handleDocumentPick = useCallback(
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
      setLocalDocumentsError(null);
      clearPendingDocument();
      setPendingDocumentFile(file);
      setPendingDocumentName(file.name.replace(/\.[^/.]+$/, ""));
      if (isImageDocument(file.type)) {
        setPendingDocumentPreviewUrl(URL.createObjectURL(file));
      }
    },
    [clearPendingDocument, csrfToken, isImageDocument, pathOrScreen],
  );

  const handleDocumentUpload = useCallback(async () => {
    if (!pendingDocumentFile) {
      return;
    }
    if (!csrfToken) {
      setLocalDocumentsError("Не удалось получить CSRF-токен");
      return;
    }
    const uploadFileName = buildUploadFileName(pendingDocumentName, pendingDocumentFile.name);
    const shouldRenameAfterUpload = uploadFileName !== pendingDocumentFile.name;
    setDocumentsBusy(true);
    setLocalDocumentsError(null);
    const response = await uploadPetDocument(pet.id, pendingDocumentFile, csrfToken);
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

    let documentForList = response.data as PetDocumentDto;
    if (shouldRenameAfterUpload && response.data?.id) {
      const renameResponse = await renamePetDocumentById(
        pet.id,
        response.data.id,
        uploadFileName,
        csrfToken,
      );
      if (renameResponse.success && renameResponse.data) {
        documentForList = renameResponse.data;
      }
    }

    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen,
      elementId: "pet-document-upload",
    });
    setDocuments((prev) => {
      const next = [documentForList, ...prev];
      return next.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    });
    setDocumentsBusy(false);
    clearPendingDocument();
  }, [
    buildUploadFileName,
    clearPendingDocument,
    csrfToken,
    pathOrScreen,
    pendingDocumentFile,
    pendingDocumentName,
    pet.id,
  ]);

  const handlePendingDocumentNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPendingDocumentName(event.target.value);
  }, []);

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

  const handleDocumentRenameStart = useCallback((document: PetDocumentDto) => {
    setEditingDocumentId(document.id);
    setEditingDocumentName(document.name);
  }, []);

  const handleDocumentRenameCancel = useCallback(() => {
    setEditingDocumentId(null);
    setEditingDocumentName("");
  }, []);

  const handleDocumentRenameSave = useCallback(
    async (documentId: string) => {
      if (!csrfToken) {
        setLocalDocumentsError("Не удалось получить CSRF-токен");
        return;
      }
      const nextName = editingDocumentName.trim();
      if (!nextName) {
        setLocalDocumentsError("Название документа не может быть пустым");
        return;
      }

      setDocumentsBusy(true);
      setLocalDocumentsError(null);
      const response = await renamePetDocumentById(pet.id, documentId, nextName, csrfToken);
      if (!response.success || !response.data) {
        setLocalDocumentsError(response.error ?? "Не удалось обновить название документа");
        setDocumentsBusy(false);
        return;
      }

      setDocuments((prev) =>
        prev.map((item) =>
          item.id === documentId ? { ...item, name: response.data?.name ?? nextName } : item,
        ),
      );
      setEditingDocumentId(null);
      setEditingDocumentName("");
      setDocumentsBusy(false);
    },
    [csrfToken, editingDocumentName, pet.id],
  );

  const handleDocumentOpen = useCallback(() => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen,
      elementId: "pet-document-open-click",
    });
  }, [pathOrScreen]);

  const reloadPreventionEntries = useCallback(async () => {
    if (!isOwner) {
      return;
    }
    setPreventionLoading(true);
    setPreventionError(null);
    const response = await getPetPreventionEntries(pet.id);
    if (!response.success) {
      setPreventionError(response.error ?? "Не удалось загрузить записи о процедурах");
      setPreventionEntries([]);
      setPreventionLoading(false);
      return;
    }
    setPreventionEntries(response.data ?? []);
    setPreventionLoading(false);
  }, [isOwner, pet.id]);

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
        <div className={styles.preventionSection}>
          <div className={styles.documentsHeader}>
            <span className={styles.documentsTitle}>Записи о процедурах</span>
          </div>
          <Alert severity="info" className={styles.preventionAlert}>
            Данные носят справочный характер и не заменяют консультацию ветеринара.
          </Alert>
          {preventionLoading ? (
            <p className={styles.documentsHint}>Загрузка записей...</p>
          ) : preventionError ? (
            <p className={styles.documentsError}>{preventionError}</p>
          ) : (
            <PreventionEntryList
              entries={preventionEntries}
              petId={pet.id}
              onEntriesChanged={reloadPreventionEntries}
            />
          )}
        </div>
      ) : null}
      {isOwner ? (
        <div className={styles.documentsSection}>
          <div className={styles.documentsHeader}>
            <span className={styles.documentsTitle}>Документы</span>
          </div>
          <Alert severity="info" className={styles.preventionAlert}>
            Здесь вы можете добавить любые документы о вашем питомце, такие как фото ветпаспорта или
            справки от врача.
          </Alert>
          <div className={styles.documentsAddWrap}>
            <label className={styles.documentUploadLabel} aria-disabled={documentsBusy}>
              + Добавить документ
              <input
                type="file"
                accept={PET_DOCUMENT_ALLOWED_MIME_TYPES.join(",")}
                className={styles.documentUploadInput}
                onChange={handleDocumentPick}
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
            <p className={styles.documentsEmptyState}>Документов пока нет</p>
          ) : null}
          {pendingDocumentFile ? (
            <div className={styles.pendingDocumentCard}>
              {pendingDocumentPreviewUrl ? (
                <img
                  src={pendingDocumentPreviewUrl}
                  alt="Превью выбранного документа"
                  className={styles.pendingDocumentPreview}
                />
              ) : (
                <div className={styles.pendingDocumentFilePreview}>PDF</div>
              )}
              <input
                type="text"
                className={styles.pendingDocumentNameInput}
                value={pendingDocumentName}
                onChange={handlePendingDocumentNameChange}
                placeholder="Введите название документа"
                disabled={documentsBusy}
              />
              <div className={styles.pendingDocumentActions}>
                <button
                  type="button"
                  className={styles.documentCancel}
                  onClick={clearPendingDocument}
                  disabled={documentsBusy}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className={styles.documentSave}
                  onClick={handleDocumentUpload}
                  disabled={documentsBusy}
                >
                  {documentsBusy ? "Загрузка..." : "Сохранить"}
                </button>
              </div>
            </div>
          ) : null}
          {documents.map((document) => (
            <div key={document.id} className={styles.documentItem}>
              {isImageDocument(document.mimeType) ? (
                <img src={document.url} alt={document.name} className={styles.documentImagePreview} />
              ) : (
                <div className={styles.documentFilePreview}>PDF</div>
              )}
              <div className={styles.documentContent}>
                {editingDocumentId === document.id ? (
                  <input
                    type="text"
                    className={styles.documentNameInput}
                    value={editingDocumentName}
                    onChange={(event) => setEditingDocumentName(event.target.value)}
                    disabled={documentsBusy}
                  />
                ) : (
                  <span className={styles.documentName} title={document.name}>
                    {document.name}
                  </span>
                )}
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
                  {editingDocumentId === document.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.documentSaveInline}
                        onClick={() => handleDocumentRenameSave(document.id)}
                        disabled={documentsBusy}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className={styles.documentCancelInline}
                        onClick={handleDocumentRenameCancel}
                        disabled={documentsBusy}
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.documentRename}
                      onClick={() => handleDocumentRenameStart(document)}
                      disabled={documentsBusy}
                    >
                      Изменить
                    </button>
                  )}
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
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
});

export default PetCard;
