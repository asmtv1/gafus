"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";

import { memo, useCallback, useEffect, useState } from "react";
import { trackEvent } from "@gafus/analytics";
import { useCSRFStore } from "@gafus/csrf";

import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { getAgeWithMonths, declOfNum, getPetTypeLabel } from "@gafus/core/utils";
import { Avatar, IconButton } from "@shared/utils/muiImports";
import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, Typography } from "@mui/material";
import { PreventionEntryList } from "@/features/pet-prevention";
import { VetVisitShortcut } from "@/features/pet-vet-visits/VetVisits";
import { PetWeight } from "./PetWeight";
import PetProfileVisibility from "./PetProfileVisibility";
import { useWebOnboardingTourStore } from "@/features/onboarding-tour";
import { PrimaryButton, primaryButtonClassName } from "@/shared/components/ui";

import EditablePetAvatar from "../EditablePetAvatar";
import styles from "./PetList.module.css";
import {
  deletePetDocumentById,
  renamePetDocumentById,
  uploadPetDocument,
} from "@shared/lib/pets/pet-documents";
import { getPetPreventionEntries } from "@shared/lib/pet-prevention/pet-prevention-client";

import {
  getPetDocumentDisplayName,
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  type PetDocumentDto,
  type Pet,
} from "@gafus/types";
import type { ChangeEvent, FocusEvent } from "react";
import type { PreventionEntryDisplay } from "@/features/pet-prevention";

type OwnerPet = Pet;

interface PetCardProps {
  pet: OwnerPet;
  index: number;
  isOwner: boolean;
  onEdit: (pet: OwnerPet) => void;
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
  index,
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
  const [openedDocumentIndex, setOpenedDocumentIndex] = useState<number | null>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [preventionEntries, setPreventionEntries] = useState<PreventionEntryDisplay[]>([]);
  const [preventionLoading, setPreventionLoading] = useState(false);
  const [preventionError, setPreventionError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const tourIsActive = useWebOnboardingTourStore((state) => state.isActive);
  const tourStepId = useWebOnboardingTourStore((state) => state.currentStepId);

  useEffect(() => {
    if (index === 0 && tourIsActive && (tourStepId === "prevention" || tourStepId === "documents")) {
      setIsExpanded(true);
    }
  }, [index, tourIsActive, tourStepId]);

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
    async (documentId: string, displayName: string) => {
      const confirmed = window.confirm(`Удалить документ "${displayName}"?`);
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
    setEditingDocumentName(getPetDocumentDisplayName(document.name));
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

  const handleDocumentOpen = useCallback((document: PetDocumentDto) => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen,
      elementId: "pet-document-open-click",
    });
    const documentIndex = documents.findIndex((item) => item.id === document.id);
    if (documentIndex === -1) {
      return;
    }
    setOpenedDocumentIndex(documentIndex);
  }, [documents, pathOrScreen]);

  const handleDocumentDownload = useCallback(() => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen,
      elementId: "pet-document-download-click",
    });
  }, [pathOrScreen]);

  const handleCloseDocumentPreview = useCallback(() => {
    setOpenedDocumentIndex(null);
    setIsPreviewFullscreen(false);
    setIsSharePanelOpen(false);
    setIsLinkCopied(false);
  }, []);

  const handleTogglePreviewFullscreen = useCallback(() => {
    setIsPreviewFullscreen((prev) => !prev);
  }, []);

  const handleToggleSharePanel = useCallback(() => {
    setIsSharePanelOpen((prev) => !prev);
    setIsLinkCopied(false);
  }, []);

  const handleCopyDocumentLink = useCallback(async () => {
    const documentUrl =
      openedDocumentIndex !== null ? documents[openedDocumentIndex]?.url ?? null : null;
    if (!documentUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(documentUrl);
      setIsLinkCopied(true);
    } catch (_error) {
      setLocalDocumentsError("Не удалось скопировать ссылку");
    }
  }, [documents, openedDocumentIndex]);

  const handlePreviewPrev = useCallback(() => {
    setOpenedDocumentIndex((prev) => {
      if (prev === null || prev <= 0) {
        return prev;
      }
      return prev - 1;
    });
    setIsSharePanelOpen(false);
    setIsLinkCopied(false);
  }, []);

  const handlePreviewNext = useCallback(() => {
    setOpenedDocumentIndex((prev) => {
      if (prev === null || prev >= documents.length - 1) {
        return prev;
      }
      return prev + 1;
    });
    setIsSharePanelOpen(false);
    setIsLinkCopied(false);
  }, [documents.length]);

  useEffect(() => {
    if (openedDocumentIndex === null) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePreviewPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handlePreviewNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePreviewNext, handlePreviewPrev, openedDocumentIndex]);

  const openedDocument = openedDocumentIndex !== null ? documents[openedDocumentIndex] : null;
  const openedDocumentDisplayName = openedDocument
    ? getPetDocumentDisplayName(openedDocument.name)
    : "";
  const hasPrevDocument = openedDocumentIndex !== null && openedDocumentIndex > 0;
  const hasNextDocument =
    openedDocumentIndex !== null && openedDocumentIndex < documents.length - 1;

  const previewActionButtonSx = {
    borderColor: "#636128",
    color: "#4a4a1a",
    backgroundColor: "#f7f1e3",
    textTransform: "none",
    fontWeight: 700,
    "&:hover": {
      borderColor: "#4a4a1a",
      backgroundColor: "#efe4cc",
    },
  } as const;

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

  const age = pet.birthDate
    ? getAgeWithMonths(pet.birthDate instanceof Date ? pet.birthDate.toISOString() : pet.birthDate)
    : null;
  const ageLabel = age
    ? `${age.years ? `${age.years} ${declOfNum(age.years, ["год", "года", "лет"])} ` : ""}${age.months ? `${age.months} ${declOfNum(age.months, ["месяц", "месяца", "месяцев"])}` : ""}`.trim()
    : null;

  return (
    <li
      className={`${styles.dog_item} ${pet.type === "CAT" ? styles.catCard : ""} ${isExpanded ? styles.petExpanded : ""}`}
    >
      <div className={styles.petHero}>
        <div className={styles.avatar_container}>
          {isOwner ? (
            <EditablePetAvatar avatarUrl={pet.photoUrl} petId={pet.id} petType={pet.type} />
          ) : (
            <Avatar
              alt={`${pet.name} фото питомца`}
              src={pet.photoUrl || (pet.type === "CAT" ? "/images/pet-avatar-cat.png" : "/images/pet-avatar-dog.png")}
            />
          )}
        </div>
        <div className={styles.dog_info}>
          <div className={styles.petHeroTop}>
            <span className={styles.petSpecies}>{getPetTypeLabel(pet.type)}</span>
            <button
              type="button"
              className={`${styles.petToggle} ${isExpanded ? styles.petToggleOpen : ""}`}
              onClick={() => setIsExpanded((value) => !value)}
              aria-label={`${isExpanded ? "Свернуть" : "Развернуть"} карточку питомца ${pet.name}`}
              aria-expanded={isExpanded}
              aria-controls={`pet-details-${pet.id}`}
            >
              <ExpandMoreRoundedIcon />
            </button>
          </div>
          <h3>{pet.name}</h3>
          <p className={styles.petBreed}>{pet.breed || "Порода не указана"}</p>
          <div className={styles.petFacts}>
            {ageLabel && <span className={styles.petFact}><CalendarMonthRoundedIcon />{ageLabel}</span>}
            {pet.weightKg != null && <span className={styles.petFact}><img src="/images/pet-weight-icon.png" alt="" />{pet.weightKg} кг</span>}
            {pet.heightCm != null && <span className={styles.petFact}><span aria-hidden="true">↗</span>{pet.heightCm} см</span>}
          </div>
        </div>
      </div>
      {isOwner ? (
        <PetProfileVisibility petId={pet.id} petName={pet.name} showInProfile={pet.showInProfile} />
      ) : null}
      {!isExpanded && isOwner && (
        <div className={styles.petCompactFoot}>
          <span>Процедуры · {preventionLoading ? "…" : preventionEntries.length}</span>
          <span>Документы · {documentsLoading ? "…" : documents.length}</span>
          <button type="button" onClick={() => setIsExpanded(true)}>Подробнее</button>
        </div>
      )}
      <div id={`pet-details-${pet.id}`} className={styles.petDetails} hidden={!isExpanded}>
      {(pet.neckGirthCm || pet.muzzleGirthCm || pet.bellyGirthCm || pet.notes) && (
        <div className={styles.petExtra}>
          {pet.neckGirthCm && <span>Обхват шеи: {pet.neckGirthCm} см</span>}
          {pet.muzzleGirthCm && <span>Обхват морды: {pet.muzzleGirthCm} см</span>}
          {pet.bellyGirthCm && <span>Обхват живота: {pet.bellyGirthCm} см</span>}
          {pet.notes && <span>Заметки: {pet.notes}</span>}
        </div>
      )}
      {isOwner ? (
        <div className={styles.dog_actions}>
          <button
            type="button"
            onClick={handleEditIconClick}
            className={`${styles.dogActionButton} ${styles.dogActionEdit} ${primaryButtonClassName}`}
            aria-label="Изменить данные питомца"
          >
            <EditRoundedIcon fontSize="small" /> Изменить данные
          </button>
          <button
            type="button"
            onClick={handleDeleteIconClick}
            className={`${styles.dogActionButton} ${styles.dogActionDelete}`}
            aria-label="Удалить питомца"
            disabled={isPending}
          >
            <DeleteRoundedIcon fontSize="small" /> Удалить питомца
          </button>
        </div>
      ) : null}
      {isOwner ? (
        <div
          className={styles.preventionSection}
          data-tour-target={index === 0 ? "pet-prevention-section" : undefined}
        >
          <div className={styles.documentsHeader}>
            <img src="/images/pet-procedures-icon.png" alt="" className={styles.sectionIcon} />
            <span className={styles.documentsTitle}>Записи о процедурах</span>
          </div>
          {preventionLoading ? (
            <LoadingState variant="inline" message="Загрузка записей…" />
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
      {isOwner ? <VetVisitShortcut petId={pet.id} /> : null}
      {isOwner ? <PetWeight petId={pet.id} petName={pet.name} /> : null}
      {isOwner ? (
        <div
          className={styles.documentsSection}
          data-tour-target={index === 0 ? "pet-documents-section" : undefined}
        >
          <div className={styles.documentsHeader}>
            <img src="/images/pet-documents-icon.png" alt="" className={styles.sectionIcon} />
            <span className={styles.documentsTitle}>Документы</span>
          </div>
          <Alert severity="info" className={styles.preventionAlert}>
            Здесь вы можете добавить любые документы о вашем питомце, такие как фото ветпаспорта или
            справки от врача.
          </Alert>
          <div className={styles.documentsAddWrap}>
            <label
              className={`${styles.documentUploadLabel} ${primaryButtonClassName}`}
              aria-disabled={documentsBusy}
            >
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
          {documentsLoading ? (
            <LoadingState variant="inline" message="Загрузка документов…" />
          ) : null}
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
                <PrimaryButton
                  type="button"
                  className={styles.documentCancel}
                  onClick={clearPendingDocument}
                  disabled={documentsBusy}
                >
                  Отмена
                </PrimaryButton>
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
          {documents.map((document) => {
            const documentDisplayName = getPetDocumentDisplayName(document.name);
            return (
              <div key={document.id} className={styles.documentItem}>
                <button
                  type="button"
                  className={styles.documentPreviewTrigger}
                  onClick={() => handleDocumentOpen(document)}
                  aria-label={`Открыть документ ${documentDisplayName}`}
                >
                  {isImageDocument(document.mimeType) ? (
                    <img
                      src={document.url}
                      alt={documentDisplayName}
                      className={styles.documentImagePreview}
                    />
                  ) : (
                    <div className={styles.documentFilePreview}>PDF</div>
                  )}
                </button>
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
                    <span className={styles.documentName} title={documentDisplayName}>
                      {documentDisplayName}
                    </span>
                  )}
                  <div className={styles.documentActions}>
                    <a
                      href={`/api/v1/pets/${pet.id}/documents/${document.id}/download`}
                      className={`${styles.documentActionIcon} ${styles.documentActionDownload}`}
                      onClick={handleDocumentDownload}
                      aria-label={`Скачать документ ${documentDisplayName}`}
                      title="Скачать"
                    >
                      <DownloadRoundedIcon fontSize="small" />
                    </a>
                    {editingDocumentId === document.id ? (
                      <>
                        <PrimaryButton
                          type="button"
                          className={styles.documentSaveInline}
                          onClick={() => handleDocumentRenameSave(document.id)}
                          disabled={documentsBusy}
                        >
                          Сохранить
                        </PrimaryButton>
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
                        className={`${styles.documentActionIcon} ${styles.documentActionEdit} ${primaryButtonClassName}`}
                        onClick={() => handleDocumentRenameStart(document)}
                        disabled={documentsBusy}
                        aria-label={`Изменить документ ${documentDisplayName}`}
                        title="Изменить"
                      >
                        <EditRoundedIcon fontSize="small" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.documentActionIcon} ${styles.documentActionDelete}`}
                      onClick={() => handleDocumentDelete(document.id, documentDisplayName)}
                      disabled={documentsBusy}
                      aria-label={`Удалить документ ${documentDisplayName}`}
                      title="Удалить"
                    >
                      <DeleteRoundedIcon fontSize="small" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      </div>
      <Dialog
        open={Boolean(openedDocument)}
        onClose={handleCloseDocumentPreview}
        fullScreen={isPreviewFullscreen}
        fullWidth
        maxWidth="lg"
        aria-labelledby="pet-document-preview-title"
      >
        {openedDocument ? (
          <>
            <DialogTitle
              id="pet-document-preview-title"
              sx={{
                pr: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 1.5,
                backgroundColor: "#d4c4a8",
              }}
            >
              <Box sx={{ minWidth: 0, fontWeight: 700 }} title={openedDocumentDisplayName}>
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: { xs: "190px", sm: "380px", md: "520px" },
                  }}
                >
                  {openedDocumentDisplayName}
                </Box>
                <Box sx={{ fontSize: "0.75rem", color: "#5a5744", mt: 0.25 }}>
                  {openedDocumentIndex !== null ? `${openedDocumentIndex + 1} / ${documents.length}` : ""}
                </Box>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleToggleSharePanel}
                  startIcon={<IosShareRoundedIcon fontSize="small" />}
                  sx={previewActionButtonSx}
                >
                  Поделиться
                </Button>
                <Button
                  component="a"
                  size="small"
                  variant="outlined"
                  href={`/api/v1/pets/${pet.id}/documents/${openedDocument.id}/download`}
                  onClick={handleDocumentDownload}
                  startIcon={<DownloadRoundedIcon fontSize="small" />}
                  sx={previewActionButtonSx}
                >
                  Скачать
                </Button>
                <IconButton
                  aria-label={
                    isPreviewFullscreen
                      ? "Выйти из полноэкранного режима"
                      : "Развернуть на весь экран"
                  }
                  onClick={handleTogglePreviewFullscreen}
                  size="small"
                  sx={previewActionButtonSx}
                >
                  {isPreviewFullscreen ? (
                    <FullscreenExitRoundedIcon fontSize="small" />
                  ) : (
                    <FullscreenRoundedIcon fontSize="small" />
                  )}
                </IconButton>
                <IconButton
                  aria-label="Закрыть просмотр документа"
                  onClick={handleCloseDocumentPreview}
                  size="small"
                  sx={previewActionButtonSx}
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </DialogTitle>
            {isSharePanelOpen ? (
              <Box
                sx={{
                  mx: 3,
                  mb: 2,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "#1f2024",
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ color: "#ffffff", fontWeight: 700, mb: 1.5 }}
                >
                  Поделиться ссылкой
                </Typography>
                <Box sx={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                  <Box
                    component="input"
                    readOnly
                    value={openedDocument.url}
                    onFocus={(event: FocusEvent<HTMLInputElement>) => event.currentTarget.select()}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      outline: "none",
                      px: 1.5,
                      fontSize: "0.92rem",
                      color: "#ffffff",
                      backgroundColor: "#2a2b31",
                      borderTopLeftRadius: 6,
                      borderBottomLeftRadius: 6,
                    }}
                  />
                  <Button
                    onClick={handleCopyDocumentLink}
                    variant="contained"
                    sx={{
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderTopRightRadius: 6,
                      borderBottomRightRadius: 6,
                      border: "1px solid #636128",
                      px: 2,
                      textTransform: "none",
                      fontWeight: 700,
                      color: "#4a4a1a",
                      backgroundColor: "#f7f1e3",
                      "&:hover": {
                        backgroundColor: "#efe4cc",
                      },
                    }}
                  >
                    {isLinkCopied ? "Скопировано" : "Скопировать"}
                  </Button>
                </Box>
              </Box>
            ) : null}
            <DialogContent
              dividers
              sx={{ p: 0, minHeight: "72vh", bgcolor: "#c4bfad", position: "relative" }}
            >
              <IconButton
                aria-label="Предыдущий документ"
                onClick={handlePreviewPrev}
                disabled={!hasPrevDocument}
                sx={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 2,
                  border: "1px solid #636128",
                  color: "#4a4a1a",
                  backgroundColor: "rgba(247, 241, 227, 0.95)",
                  "&:hover": { backgroundColor: "#efe4cc" },
                }}
              >
                <ChevronLeftRoundedIcon />
              </IconButton>
              <IconButton
                aria-label="Следующий документ"
                onClick={handlePreviewNext}
                disabled={!hasNextDocument}
                sx={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 2,
                  border: "1px solid #636128",
                  color: "#4a4a1a",
                  backgroundColor: "rgba(247, 241, 227, 0.95)",
                  "&:hover": { backgroundColor: "#efe4cc" },
                }}
              >
                <ChevronRightRoundedIcon />
              </IconButton>
              {openedDocument.mimeType === "application/pdf" ? (
                <iframe
                  src={openedDocument.url}
                  title={openedDocumentDisplayName}
                  style={{ width: "100%", height: "72vh", border: 0, background: "transparent" }}
                />
              ) : (
                <Box
                  component="img"
                  src={openedDocument.url}
                  alt={openedDocumentDisplayName}
                  sx={{
                    display: "block",
                    width: "100%",
                    height: "72vh",
                    objectFit: "contain",
                    bgcolor: "transparent",
                  }}
                />
              )}
            </DialogContent>
          </>
        ) : null}
      </Dialog>
    </li>
  );
});

export default PetCard;
