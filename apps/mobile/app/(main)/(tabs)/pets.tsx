import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getPetDocumentDisplayName,
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  type PetDocumentDto,
} from "@gafus/types";

import { COLORS, FONTS, SPACING } from "@/constants";
import { Input } from "@/shared/components/ui";
import { trackEvent } from "@/shared/lib/analytics";
import { petsQueryOptions } from "@/shared/lib/api/profileTabQueries";
import { petsApi, type Pet, type PetDocument } from "@/shared/lib/api/pets";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { usePreventionSyncStore } from "@/shared/stores/preventionSyncStore";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import type {
  CreatePreventionEntryData,
  PetPreventionEntry,
  PetPreventionReminderKind,
  PetPreventionType,
} from "@/shared/lib/api/pets";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PET_PHOTO_MAX_SIZE_MB = 2;
const DEFAULT_REMINDER_DAYS: Record<PetPreventionType, number> = {
  VACCINATION: 365,
  DEWORMING: 90,
  TICKS_FLEAS: 30,
};
const PREVENTION_TYPES: { value: PetPreventionType; label: string }[] = [
  { value: "VACCINATION", label: "Прививка" },
  { value: "DEWORMING", label: "Глистогонка" },
  { value: "TICKS_FLEAS", label: "Клещи и блохи" },
];

const declOfNum = (n: number, forms: [string, string, string]) => {
  const cases = [2, 0, 1, 1, 1, 2];
  return forms[n % 100 > 4 && n % 100 < 20 ? 2 : cases[Math.min(n % 10, 5)]];
};

const getPetTypeLabel = (type: string) => {
  switch (type) {
    case "DOG":
      return "Собака";
    case "CAT":
      return "Кошка";
    default:
      return type;
  }
};

const getAgeWithMonths = (
  birthDateString: string | null,
): { years: number; months: number } | null => {
  if (!birthDateString) return null;
  try {
    const birthDate = new Date(birthDateString);
    const now = new Date();
    const birthUTC = new Date(
      Date.UTC(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate()),
    );
    const nowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let years = nowUTC.getUTCFullYear() - birthUTC.getUTCFullYear();
    let months = nowUTC.getUTCMonth() - birthUTC.getUTCMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    return { years, months };
  } catch {
    reportClientError(new Error("parse_pet_birth_date"), {
      severity: "warning",
      issueKey: "PetsScreen",
      keys: { operation: "parse_pet_birth_date" },
    });
    return null;
  }
};

interface PetDocumentsSectionProps {
  pet: Pet;
}

interface PendingDocumentUpload {
  uri: string;
  mimeType: string;
  size: number;
  originalName: string;
}

function PetDocumentsSection({ pet }: PetDocumentsSectionProps) {
  const queryClient = useQueryClient();
  const [pendingDocument, setPendingDocument] = useState<PendingDocumentUpload | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editingDocumentName, setEditingDocumentName] = useState("");
  const [openedDocumentIndex, setOpenedDocumentIndex] = useState<number | null>(null);
  const {
    data: documentsResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["pets", "documents", pet.id],
    queryFn: () => petsApi.getDocuments(pet.id),
  });

  const documents = [...(documentsResponse?.data ?? [])].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );

  const isImageDocument = (mimeType: string) => mimeType.startsWith("image/");

  const buildUploadFileName = (title: string, originalName: string) => {
    const safeTitle = title.trim();
    if (!safeTitle) {
      return originalName;
    }
    const extension = originalName.includes(".") ? originalName.split(".").pop() : "";
    if (!extension) {
      return safeTitle;
    }
    const normalizedTitle = safeTitle.endsWith(`.${extension}`)
      ? safeTitle
      : `${safeTitle}.${extension}`;
    return normalizedTitle;
  };

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({
      uri,
      mimeType,
      fileName,
    }: {
      uri: string;
      mimeType: string;
      fileName: string;
    }) => {
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets-tab",
        elementId: "pet-document-upload",
      });
      const response = await petsApi.uploadDocument(pet.id, uri, mimeType, fileName);
      return { cancelled: false, response } as const;
    },
    onSuccess: (result) => {
      if (!result || result.cancelled) {
        return;
      }
      if (!result.response.success) {
        trackEvent({
          eventName: "button_click",
          platform: "mobile",
          pathOrScreen: "/pets-tab",
          elementId: "pet-document-upload",
        });
        Alert.alert("Ошибка", result.response.error ?? "Не удалось загрузить документ");
        return;
      }
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets-tab",
        elementId: "pet-document-upload",
      });
      queryClient.invalidateQueries({ queryKey: ["pets", "documents", pet.id] });
      setPendingDocument(null);
      setDocumentTitle("");
    },
    onError: (error) => {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "upload_pet_document", petId: pet.id },
      });
      Alert.alert("Ошибка", "Не удалось загрузить документ");
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets-tab",
        elementId: "pet-document-upload",
      });
    },
  });

  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: [...PET_DOCUMENT_ALLOWED_MIME_TYPES],
    });
    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const file = result.assets[0];
    const mimeType = file.mimeType ?? "";
    const size = file.size ?? 0;

    if (
      !PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(
        mimeType as (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      Alert.alert("Ошибка", "Недопустимый тип документа. Разрешены PDF, JPEG и PNG");
      return;
    }
    if (size > PET_DOCUMENT_MAX_SIZE_BYTES) {
      Alert.alert("Ошибка", "Размер документа превышает 10 МБ");
      return;
    }

    const originalName = file.name || `document_${Date.now()}`;
    setPendingDocument({
      uri: file.uri,
      mimeType,
      size,
      originalName,
    });
    setDocumentTitle(originalName.replace(/\.[^/.]+$/, ""));
  };

  const handleUploadDocument = () => {
    if (!pendingDocument) {
      return;
    }
    const fileName = buildUploadFileName(documentTitle, pendingDocument.originalName);
    uploadDocumentMutation.mutate({
      uri: pendingDocument.uri,
      mimeType: pendingDocument.mimeType,
      fileName,
    });
  };

  const deleteDocumentMutation = useMutation({
    mutationFn: ({ documentId }: { documentId: string }) => petsApi.deleteDocument(pet.id, documentId),
    onSuccess: (response) => {
      if (!response.success) {
        trackEvent({
          eventName: "button_click",
          platform: "mobile",
          pathOrScreen: "/pets-tab",
          elementId: "pet-document-delete",
        });
        Alert.alert("Ошибка", response.error ?? "Не удалось удалить документ");
        return;
      }
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets-tab",
        elementId: "pet-document-delete",
      });
      queryClient.invalidateQueries({ queryKey: ["pets", "documents", pet.id] });
    },
    onError: (error) => {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "delete_pet_document", petId: pet.id },
      });
      Alert.alert("Ошибка", "Не удалось удалить документ");
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets-tab",
        elementId: "pet-document-delete",
      });
    },
  });

  const renameDocumentMutation = useMutation({
    mutationFn: async ({ documentId, name }: { documentId: string; name: string }) => {
      console.log("[PetDocumentsRename] request", {
        petId: pet.id,
        documentId,
        name,
      });
      const response = await petsApi.renameDocument(pet.id, documentId, name);
      console.log("[PetDocumentsRename] response", {
        petId: pet.id,
        documentId,
        success: response.success,
        code: response.code,
        error: response.error,
      });
      return response;
    },
    onSuccess: (response) => {
      if (!response.success) {
        console.log("[PetDocumentsRename] unsuccessful", {
          petId: pet.id,
          code: response.code,
          error: response.error,
        });
        Alert.alert("Ошибка", response.error ?? "Не удалось обновить название документа");
        return;
      }
      console.log("[PetDocumentsRename] success", { petId: pet.id });
      queryClient.invalidateQueries({ queryKey: ["pets", "documents", pet.id] });
      setEditingDocumentId(null);
      setEditingDocumentName("");
    },
    onError: (error) => {
      console.error("[PetDocumentsRename] onError", {
        petId: pet.id,
        error: error instanceof Error ? error.message : String(error),
      });
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "rename_pet_document", petId: pet.id },
      });
      Alert.alert("Ошибка", "Не удалось обновить название документа");
    },
  });

  const handleOpenDocument = async (document: PetDocumentDto) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets-tab",
      elementId: "pet-document-open-click",
    });
    try {
      const documentIndex = documents.findIndex((item) => item.id === document.id);
      if (documentIndex === -1) {
        return;
      }
      setOpenedDocumentIndex(documentIndex);
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets-tab",
        elementId: "pet-document-open-success",
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "open_pet_document", petId: pet.id, documentId: document.id },
      });
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets-tab",
        elementId: "pet-document-open-fail",
      });
      Alert.alert("Ошибка", "Не удалось открыть документ");
    }
  };

  const handleDeleteDocument = (document: PetDocument) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets-tab",
      elementId: "pet-document-delete",
    });
    Alert.alert(
      "Удаление документа",
      `Удалить документ "${getPetDocumentDisplayName(document.name)}"?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => deleteDocumentMutation.mutate({ documentId: document.id }),
        },
      ],
    );
  };

  const handleStartRenameDocument = (document: PetDocument) => {
    setEditingDocumentId(document.id);
    setEditingDocumentName(getPetDocumentDisplayName(document.name));
  };

  const handleCancelRenameDocument = () => {
    setEditingDocumentId(null);
    setEditingDocumentName("");
  };

  const handleSaveRenameDocument = () => {
    if (!editingDocumentId) {
      return;
    }
    const nextName = editingDocumentName.trim();
    if (!nextName) {
      Alert.alert("Ошибка", "Название документа не может быть пустым");
      return;
    }
    console.log("[PetDocumentsRename] save_click", {
      petId: pet.id,
      documentId: editingDocumentId,
      name: nextName,
    });
    renameDocumentMutation.mutate({ documentId: editingDocumentId, name: nextName });
  };

  const handleShareDocument = async (document: PetDocument) => {
    try {
      await Share.share({
        message: document.url,
        url: document.url,
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "share_pet_document", petId: pet.id, documentId: document.id },
      });
      Alert.alert("Ошибка", "Не удалось поделиться документом");
    }
  };

  const handleDownloadDocument = async (document: PetDocument) => {
    try {
      const extensionByMimeType: Record<string, string> = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
      };
      const ext = extensionByMimeType[document.mimeType] ?? "bin";
      const safeName = getPetDocumentDisplayName(document.name).replace(/[^\w.-]/g, "_");
      const fileName = safeName.includes(".") ? safeName : `${safeName}.${ext}`;
      const destinationUri = `${FileSystem.cacheDirectory}${Date.now()}_${fileName}`;
      await FileSystem.downloadAsync(document.url, destinationUri);

      await Share.share({
        message: "Документ скачан. Выберите приложение для сохранения или отправки.",
        url: destinationUri,
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "download_pet_document", petId: pet.id, documentId: document.id },
      });
      Alert.alert("Ошибка", "Не удалось скачать документ");
    }
  };

  const openedDocument = openedDocumentIndex !== null ? documents[openedDocumentIndex] : null;

  const handleCloseDocumentPreview = () => {
    setOpenedDocumentIndex(null);
  };

  return (
    <View style={styles.documentsSection}>
      <View style={styles.documentsHeader}>
        <View style={styles.documentsTitleWrap}>
          <Text style={styles.documentsTitle}>Документы</Text>
          <Text style={styles.documentHint}>Фото ветпаспорта, справки и другие файлы питомца</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.documentActionButton, pressed && styles.documentActionPressed]}
          onPress={handlePickDocument}
          disabled={uploadDocumentMutation.isPending}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.documentActionText}>Добавить</Text>
        </Pressable>
      </View>

      {isLoading ? <Text style={styles.documentHint}>Загрузка документов...</Text> : null}
      {isError ? <Text style={styles.documentError}>Не удалось загрузить документы</Text> : null}
      {!isLoading && !isError && documents.length === 0 ? (
        <Text style={styles.documentHint}>Документов пока нет</Text>
      ) : null}

      {documents.map((document) => (
        <View key={document.id} style={styles.documentItem}>
          <Pressable onPress={() => void handleOpenDocument(document)}>
            {isImageDocument(document.mimeType) ? (
              <Image
                source={{ uri: document.url }}
                style={styles.documentPreviewImage}
                contentFit="contain"
              />
            ) : (
              <View style={styles.documentPreviewFile}>
                <Text style={styles.documentPreviewFileText}>PDF</Text>
              </View>
            )}
          </Pressable>
          {editingDocumentId === document.id ? (
            <TextInput
              value={editingDocumentName}
              onChangeText={setEditingDocumentName}
              style={styles.documentNameInput}
              editable={!renameDocumentMutation.isPending}
              placeholder="Название документа"
              placeholderTextColor={COLORS.textSecondary}
            />
          ) : (
            <Text style={styles.documentName} numberOfLines={1}>
              {getPetDocumentDisplayName(document.name)}
            </Text>
          )}
          <View style={styles.documentActions}>
            {editingDocumentId === document.id ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.documentSecondaryButton,
                    pressed && styles.documentActionPressed,
                  ]}
                  onPress={handleSaveRenameDocument}
                  disabled={renameDocumentMutation.isPending}
                >
                  <Text style={styles.documentSecondaryText}>Сохранить</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.documentSecondaryButton,
                    pressed && styles.documentActionPressed,
                  ]}
                  onPress={handleCancelRenameDocument}
                  disabled={renameDocumentMutation.isPending}
                >
                  <Text style={styles.documentSecondaryText}>Отмена</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.documentManageButton,
                  pressed && styles.petActionButtonPressed,
                ]}
                onPress={() => handleStartRenameDocument(document)}
              >
                <Text style={styles.documentManageIcon}>✏️</Text>
                <Text style={styles.documentManageText}>Изменить</Text>
              </Pressable>
            )}
            {editingDocumentId !== document.id ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.documentManageButton,
                    pressed && styles.petActionButtonPressed,
                  ]}
                  onPress={() => void handleShareDocument(document)}
                >
                  <Text style={styles.documentManageIcon}>🔗</Text>
                  <Text style={styles.documentManageText}>Поделиться</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.documentManageButton,
                    styles.documentManageButtonDelete,
                    pressed && styles.petActionButtonPressed,
                  ]}
                  onPress={() => handleDeleteDocument(document)}
                  disabled={deleteDocumentMutation.isPending || renameDocumentMutation.isPending}
                >
                  <Text style={styles.documentManageIcon}>🗑️</Text>
                  <Text style={[styles.documentManageText, styles.documentManageTextDelete]}>Удалить</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      ))}

      <Modal
        visible={pendingDocument !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!uploadDocumentMutation.isPending) {
            setPendingDocument(null);
          }
        }}
      >
        <View style={styles.documentModalOverlay}>
          <View style={styles.documentModalCard}>
            <Text style={styles.documentsTitle}>Новый документ</Text>
            {pendingDocument?.mimeType && isImageDocument(pendingDocument.mimeType) ? (
              <Image
                source={{ uri: pendingDocument.uri }}
                style={styles.documentModalPreview}
                contentFit="cover"
              />
            ) : (
              <View style={styles.documentModalFilePreview}>
                <Text style={styles.documentPreviewFileText}>PDF</Text>
              </View>
            )}
            <Input
              label="Название документа"
              value={documentTitle}
              onChangeText={setDocumentTitle}
              placeholder="Введите название"
            />
            <View style={styles.documentActions}>
              <Pressable
                style={({ pressed }) => [styles.documentSecondaryButton, pressed && styles.documentActionPressed]}
                onPress={() => setPendingDocument(null)}
                disabled={uploadDocumentMutation.isPending}
              >
                <Text style={styles.documentSecondaryText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.documentActionButton, pressed && styles.documentActionPressed]}
                onPress={handleUploadDocument}
                disabled={uploadDocumentMutation.isPending}
              >
                <Text style={styles.documentActionText}>
                  {uploadDocumentMutation.isPending ? "Загрузка..." : "Сохранить"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={openedDocument !== null}
        animationType="fade"
        onRequestClose={handleCloseDocumentPreview}
      >
        <View style={styles.documentViewerContainer}>
          {openedDocument ? (
            <>
              <View style={styles.documentViewerHeader}>
                <Text style={styles.documentViewerTitle} numberOfLines={1}>
                  {getPetDocumentDisplayName(openedDocument.name)}
                </Text>
                <View style={styles.documentViewerActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.documentViewerButton,
                      pressed && styles.documentActionPressed,
                    ]}
                    onPress={() => void handleShareDocument(openedDocument)}
                  >
                    <Text style={styles.documentViewerButtonText}>Поделиться ссылкой</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.documentViewerButton,
                      pressed && styles.documentActionPressed,
                    ]}
                    onPress={() => void handleDownloadDocument(openedDocument)}
                  >
                    <Text style={styles.documentViewerButtonText}>Скачать</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.documentViewerCloseButton,
                      pressed && styles.documentActionPressed,
                    ]}
                    onPress={handleCloseDocumentPreview}
                  >
                    <Text style={styles.documentViewerCloseText}>Закрыть</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.documentViewerBody}>
                {openedDocument.mimeType === "application/pdf" ? (
                  <WebView source={{ uri: openedDocument.url }} style={styles.documentViewerContent} />
                ) : (
                  <Image
                    source={{ uri: openedDocument.url }}
                    style={styles.documentViewerContent}
                    contentFit="contain"
                  />
                )}
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const buildPreventionPayload = (
  type: PetPreventionType,
  performedAt: string,
  productName: string,
  notes: string,
  reminderEnabled: boolean,
  reminderKind: PetPreventionReminderKind,
  reminderDaysAfter: number,
  reminderOnDate: string,
): CreatePreventionEntryData => {
  const base: CreatePreventionEntryData = {
    type,
    performedAt,
    productName: productName.trim() || undefined,
    notes: notes.trim() || undefined,
    reminderEnabled,
    reminderKind,
    reminderTimes: ["09:00"],
  };
  if (!reminderEnabled) {
    return base;
  }
  if (reminderKind === "AFTER_DAYS") {
    return { ...base, reminderDaysAfter };
  }
  return { ...base, reminderOnDate };
};

interface PetPreventionSectionProps {
  pet: Pet;
}

function PetPreventionSection({ pet }: PetPreventionSectionProps) {
  const queryClient = useQueryClient();
  const { isOffline } = useNetworkStatus();
  const addToQueue = usePreventionSyncStore((state) => state.addToQueue);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PetPreventionEntry | null>(null);
  const [type, setType] = useState<PetPreventionType>("VACCINATION");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [productName, setProductName] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderKind, setReminderKind] = useState<PetPreventionReminderKind>("AFTER_DAYS");
  const [reminderDaysAfter, setReminderDaysAfter] = useState(DEFAULT_REMINDER_DAYS.VACCINATION);
  const [reminderOnDate, setReminderOnDate] = useState(new Date().toISOString().split("T")[0]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["petPrevention", pet.id],
    queryFn: () => petsApi.getPreventionEntries(pet.id),
  });

  const resetForm = () => {
    setType("VACCINATION");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setProductName("");
    setNotes("");
    setReminderEnabled(true);
    setReminderKind("AFTER_DAYS");
    setReminderDaysAfter(DEFAULT_REMINDER_DAYS.VACCINATION);
    setReminderOnDate(new Date().toISOString().split("T")[0]);
    setEditingEntry(null);
  };

  const addMutation = useMutation({
    mutationFn: (payload: CreatePreventionEntryData) => petsApi.addPreventionEntry(pet.id, payload),
    onSuccess: (response) => {
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось добавить запись");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["petPrevention", pet.id] });
      hapticFeedback.success();
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось добавить запись");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ entryId, payload }: { entryId: string; payload: CreatePreventionEntryData }) =>
      petsApi.updatePreventionEntry(pet.id, entryId, payload),
    onSuccess: (response) => {
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось обновить запись");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["petPrevention", pet.id] });
      hapticFeedback.success();
      setShowModal(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => petsApi.deletePreventionEntry(pet.id, entryId),
    onSuccess: (response) => {
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось удалить запись");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["petPrevention", pet.id] });
      hapticFeedback.success();
    },
  });

  const handleOpenAdd = () => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets-tab",
      elementId: "pet-prevention-add-open",
    });
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (entry: PetPreventionEntry) => {
    setEditingEntry(entry);
    setType(entry.type);
    setPerformedAt(entry.performedAt.split("T")[0]);
    setProductName(entry.productName ?? "");
    setNotes(entry.notes ?? "");
    setReminderEnabled(entry.reminderEnabled ?? true);
    setReminderKind(entry.reminderKind ?? "AFTER_DAYS");
    setReminderDaysAfter(entry.reminderDaysAfter ?? DEFAULT_REMINDER_DAYS[entry.type]);
    setReminderOnDate(
      entry.reminderOnDate ? entry.reminderOnDate.split("T")[0] : new Date().toISOString().split("T")[0],
    );
    setShowModal(true);
  };

  const handleDelete = (entry: PetPreventionEntry) => {
    Alert.alert("Удалить запись?", "Запись будет удалена без возможности восстановления.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => deleteMutation.mutate(entry.id) },
    ]);
  };

  const handleSave = () => {
    if (!performedAt.trim()) {
      Alert.alert("Ошибка", "Дата процедуры обязательна");
      return;
    }
    if (reminderEnabled && reminderKind === "ON_DATE" && !reminderOnDate.trim()) {
      Alert.alert("Ошибка", "Укажите дату напоминания");
      return;
    }
    const payload = buildPreventionPayload(
      type,
      performedAt,
      productName,
      notes,
      reminderEnabled,
      reminderKind,
      reminderDaysAfter,
      reminderOnDate,
    );
    if (editingEntry) {
      updateMutation.mutate({ entryId: editingEntry.id, payload });
      return;
    }
    if (isOffline) {
      addToQueue(pet.id, payload);
      queryClient.invalidateQueries({ queryKey: ["petPrevention", pet.id] });
      hapticFeedback.success();
      setShowModal(false);
      resetForm();
      return;
    }
    addMutation.mutate(payload);
  };

  const entries = data?.data ?? [];
  const saving = addMutation.isPending || updateMutation.isPending;

  return (
    <View style={styles.preventionSection}>
      <View style={styles.preventionHeader}>
        <View style={styles.preventionTitleWrap}>
          <Text style={styles.preventionTitle}>Записи о процедурах</Text>
          <Text style={styles.preventionHint}>Справочно: не заменяет консультацию ветеринара.</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.documentActionButton, pressed && styles.documentActionPressed]}
          onPress={handleOpenAdd}
        >
          <Text style={styles.documentActionText}>Добавить</Text>
        </Pressable>
      </View>

      {isLoading ? <Text style={styles.documentHint}>Загрузка записей...</Text> : null}
      {isError ? <Text style={styles.documentError}>Не удалось загрузить записи о процедурах</Text> : null}
      {!isLoading && !isError && entries.length === 0 ? (
        <Text style={styles.documentHint}>Записей пока нет</Text>
      ) : null}

      {entries.map((entry) => (
        <View key={entry.id} style={styles.preventionItem}>
          <Text style={styles.preventionItemTitle}>
            {PREVENTION_TYPES.find((item) => item.value === entry.type)?.label ?? entry.type}
          </Text>
          <Text style={styles.documentHint}>
            Дата: {new Date(entry.performedAt).toLocaleDateString("ru-RU")}
          </Text>
          {entry.productName ? <Text style={styles.documentHint}>Препарат: {entry.productName}</Text> : null}
          {entry.notes ? (
            <Text style={styles.documentHint} numberOfLines={2}>
              {entry.notes}
            </Text>
          ) : null}
          <View style={styles.documentActions}>
            <Pressable
              style={({ pressed }) => [styles.documentSecondaryButton, pressed && styles.documentActionPressed]}
              onPress={() => handleOpenEdit(entry)}
            >
              <Text style={styles.documentSecondaryText}>Изменить</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.documentSecondaryButton,
                styles.documentDeleteButton,
                pressed && styles.documentActionPressed,
              ]}
              onPress={() => handleDelete(entry)}
            >
              <Text style={styles.documentDeleteText}>Удалить</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowModal(false);
          resetForm();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.preventionModalOverlay}
        >
          <Pressable
            style={styles.preventionModalDismiss}
            onPress={() => {
              setShowModal(false);
              resetForm();
            }}
          />
          <View style={styles.preventionModalSheet}>
            <ScrollView contentContainerStyle={styles.preventionModalScroll}>
              <Text style={styles.preventionModalTitle}>
                {editingEntry ? "Изменить запись" : "Добавить запись"}
              </Text>

              <Text style={styles.preventionFieldLabel}>Тип процедуры</Text>
              <View style={styles.preventionTypeRow}>
                {PREVENTION_TYPES.map((item) => (
                  <Pressable
                    key={item.value}
                    style={[
                      styles.preventionTypeChip,
                      type === item.value && styles.preventionTypeChipActive,
                    ]}
                    onPress={() => setType(item.value)}
                  >
                    <Text
                      style={[
                        styles.preventionTypeChipText,
                        type === item.value && styles.preventionTypeChipTextActive,
                      ]}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Input
                label="Дата процедуры *"
                value={performedAt}
                onChangeText={setPerformedAt}
                placeholder="YYYY-MM-DD"
              />
              <Input
                label="Препарат"
                value={productName}
                onChangeText={setProductName}
                placeholder="Название (необязательно)"
              />
              <Input
                label="Заметки"
                value={notes}
                onChangeText={setNotes}
                placeholder="Дополнительно"
                multiline
                numberOfLines={2}
                keyboardDoneAccessory
              />

              <View style={styles.preventionToggleRow}>
                <Text style={styles.preventionFieldLabelNoMargin}>Включить напоминание</Text>
                <Pressable
                  style={[
                    styles.preventionToggle,
                    reminderEnabled && styles.preventionToggleActive,
                  ]}
                  onPress={() => setReminderEnabled((value) => !value)}
                >
                  <View
                    style={[
                      styles.preventionToggleThumb,
                      reminderEnabled && styles.preventionToggleThumbActive,
                    ]}
                  />
                </Pressable>
              </View>

              {reminderEnabled ? (
                <>
                  <View style={styles.preventionTypeRow}>
                    <Pressable
                      style={[
                        styles.preventionTypeChip,
                        reminderKind === "AFTER_DAYS" && styles.preventionTypeChipActive,
                      ]}
                      onPress={() => setReminderKind("AFTER_DAYS")}
                    >
                      <Text
                        style={[
                          styles.preventionTypeChipText,
                          reminderKind === "AFTER_DAYS" && styles.preventionTypeChipTextActive,
                        ]}
                      >
                        Через N дней
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.preventionTypeChip,
                        reminderKind === "ON_DATE" && styles.preventionTypeChipActive,
                      ]}
                      onPress={() => setReminderKind("ON_DATE")}
                    >
                      <Text
                        style={[
                          styles.preventionTypeChipText,
                          reminderKind === "ON_DATE" && styles.preventionTypeChipTextActive,
                        ]}
                      >
                        По дате
                      </Text>
                    </Pressable>
                  </View>
                  {reminderKind === "AFTER_DAYS" ? (
                    <Input
                      label="Через сколько дней"
                      value={String(reminderDaysAfter)}
                      onChangeText={(value) => setReminderDaysAfter(parseInt(value, 10) || 1)}
                      keyboardType="number-pad"
                    />
                  ) : (
                    <Input
                      label="Дата напоминания *"
                      value={reminderOnDate}
                      onChangeText={setReminderOnDate}
                      placeholder="YYYY-MM-DD"
                    />
                  )}
                </>
              ) : null}

              <View style={styles.preventionModalActions}>
                <Pressable
                  style={styles.preventionCancelButton}
                  onPress={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  <Text style={styles.preventionCancelText}>Отмена</Text>
                </Pressable>
                <Pressable
                  style={[styles.preventionSaveButton, saving && styles.preventionSaveButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.preventionSaveText}>
                    {saving ? "Сохранение..." : "Сохранить"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default function PetsTabScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: petsData } = useQuery(petsQueryOptions);
  const pets = petsData?.data || [];

  const trackPetsClick = useCallback((elementId: string) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets-tab",
      elementId,
    });
  }, []);

  const deleteMutation = useMutation({
    mutationFn: petsApi.delete,
    onSuccess: () => {
      trackPetsClick("pet-delete-success");
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      hapticFeedback.success();
    },
    onError: (error) => {
      trackPetsClick("pet-delete-fail");
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось удалить питомца");
    },
  });

  const petPhotoUploadMutation = useMutation({
    mutationFn: async ({
      petId,
      uri,
      mimeType,
      fileName,
    }: {
      petId: string;
      uri: string;
      mimeType: string;
      fileName: string;
    }) => petsApi.uploadPhoto(petId, uri, mimeType, fileName),
    onSuccess: (result) => {
      if (result.success) {
        trackPetsClick("pet-photo-upload-success");
        queryClient.invalidateQueries({ queryKey: ["pets"] });
        hapticFeedback.success();
      } else {
        trackPetsClick("pet-photo-upload-fail");
        Alert.alert("Ошибка", result.error ?? "Не удалось загрузить фото");
      }
    },
    onError: (error) => {
      trackPetsClick("pet-photo-upload-fail");
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось загрузить фото");
    },
  });

  const handleEditPet = (pet: Pet) => {
    router.push({
      pathname: "/pets/edit/[id]",
      params: { id: pet.id },
    });
  };

  const handleDeletePet = (pet: Pet) => {
    trackPetsClick("pet-delete-click");
    Alert.alert("Удалить питомца", `Вы уверены, что хотите удалить ${pet.name}?`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => deleteMutation.mutate(pet.id),
      },
    ]);
  };

  const pickImageAndUploadPetPhoto = async (petId: string) => {
    trackPetsClick("pet-photo-upload-click");
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Доступ", "Нужен доступ к фото для загрузки");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileSize = asset.fileSize ?? 0;
      const mimeType = asset.mimeType ?? "";
      if (fileSize > PET_PHOTO_MAX_SIZE_MB * 1024 * 1024) {
        Alert.alert("Ошибка", `Размер файла не должен превышать ${PET_PHOTO_MAX_SIZE_MB}MB`);
        return;
      }
      if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        Alert.alert("Ошибка", "Поддерживаются только JPG, PNG, WEBP или GIF");
        return;
      }
      const ext = mimeType.split("/")[1] || "jpg";
      const fileName = `pet_${Date.now()}.${ext}`;
      petPhotoUploadMutation.mutate({ petId, uri: asset.uri, mimeType, fileName });
    } catch (err) {
      reportClientError(err, {
        issueKey: "PetsScreen",
        keys: { operation: "pick_pet_photo" },
      });
      Alert.alert("Ошибка", "Не удалось выбрать фото");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Питомцы</Text>
        {pets.length === 0 ? (
          <View style={styles.emptyStateWrap}>
            <View style={styles.emptyCard}>
              <Text style={styles.noPets}>Питомцы не добавлены</Text>
              <Text style={styles.emptyStateHint}>
                Добавьте питомца, чтобы записывать прививки, ставить напоминания и хранить
                документы по вашему питомцу.
              </Text>
            </View>
            <Pressable
              style={styles.addPetButton}
              onPress={() => {
                trackPetsClick("pet-add-open");
                router.push({ pathname: "/pets/add" });
              }}
            >
              <Text style={styles.addPetButtonText}>Добавить питомца</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.petsList}>
            {pets.map((pet) => (
              <View key={pet.id} style={styles.petItem}>
                <View style={styles.petMainInfo}>
                  <Pressable
                    onPress={() => pickImageAndUploadPetPhoto(pet.id)}
                    disabled={petPhotoUploadMutation.isPending}
                    style={styles.petAvatarPressable}
                  >
                    {pet.photoUrl ? (
                      <Image source={{ uri: pet.photoUrl }} style={styles.petAvatar} contentFit="cover" />
                    ) : (
                      <Image
                        source={require("../../../assets/images/pet-avatar.png")}
                        style={styles.petAvatar}
                        contentFit="cover"
                      />
                    )}
                    <View style={styles.petAvatarEditBadge}>
                      <Text style={styles.petAvatarEditText}>✏️</Text>
                    </View>
                  </Pressable>
                  <View style={styles.petInfo}>
                    <Text style={styles.petName}>
                      {pet.name} ({getPetTypeLabel(pet.type)})
                    </Text>
                    {pet.breed ? <Text style={styles.petDetail}>Порода: {pet.breed}</Text> : null}
                    {pet.birthDate
                      ? (() => {
                          const age = getAgeWithMonths(pet.birthDate);
                          if (!age) return null;
                          if (age.years === 0) {
                            return (
                              <Text style={styles.petDetail}>
                                Возраст: {age.months}{" "}
                                {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                              </Text>
                            );
                          }
                          return (
                            <Text style={styles.petDetail}>
                              Возраст: {age.years} {declOfNum(age.years, ["год", "года", "лет"])}
                              {age.months > 0
                                ? ` ${age.months} ${declOfNum(age.months, ["месяц", "месяца", "месяцев"])}`
                                : ""}
                            </Text>
                          );
                        })()
                      : null}
                    {pet.heightCm ? <Text style={styles.petDetail}>Рост: {pet.heightCm} см</Text> : null}
                    {pet.weightKg ? <Text style={styles.petDetail}>Вес: {pet.weightKg} кг</Text> : null}
                    {pet.notes ? (
                      <Text style={styles.petNotes} numberOfLines={2}>
                        Заметки: {pet.notes}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.petCardActions}>
                  <View style={styles.petManageActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.petManageButton,
                        pressed && styles.petActionButtonPressed,
                      ]}
                      onPress={() => {
                        trackPetsClick("pet-edit-open");
                        handleEditPet(pet);
                      }}
                    >
                      <Text style={styles.petActionIcon}>✏️</Text>
                      <Text style={styles.petActionText} numberOfLines={2}>
                        Изменить
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.petManageButton,
                        styles.petActionButtonDelete,
                        pressed && styles.petActionButtonPressed,
                      ]}
                      onPress={() => handleDeletePet(pet)}
                    >
                      <Text style={styles.petActionIcon}>🗑️</Text>
                      <Text style={[styles.petActionText, styles.petActionTextDelete]} numberOfLines={2}>
                        Удалить
                      </Text>
                    </Pressable>
                  </View>
                  <PetPreventionSection pet={pet} />
                  <PetDocumentsSection pet={pet} />
                </View>
              </View>
            ))}
          </View>
        )}
        {pets.length > 0 ? (
          <Pressable
            style={styles.addPetButton}
            onPress={() => {
              trackPetsClick("pet-add-open");
              router.push({ pathname: "/pets/add" });
            }}
          >
            <Text style={styles.addPetButtonText}>Добавить питомца</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  emptyCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  emptyStateWrap: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: SPACING.xl,
  },
  noPets: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontStyle: "normal",
    textAlign: "center",
    fontFamily: FONTS.montserrat,
  },
  emptyStateHint: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: FONTS.montserrat,
  },
  petsList: {
    flexDirection: "column",
    gap: SPACING.md,
  },
  petItem: {
    flexDirection: "column",
    padding: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING.xs,
  },
  petMainInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  petAvatarPressable: {
    position: "relative",
    width: 78,
    height: 78,
  },
  petAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
  },
  petAvatarEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 11,
    width: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  petAvatarEditText: {
    fontSize: 10,
  },
  petInfo: {
    flex: 1,
    paddingTop: 2,
    gap: 2,
  },
  petName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
    fontFamily: FONTS.montserrat,
  },
  petDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginBottom: 0,
    fontFamily: FONTS.montserrat,
  },
  petNotes: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: FONTS.montserrat,
  },
  petCardActions: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  documentsSection: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
    gap: SPACING.xs,
  },
  documentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  documentsTitleWrap: {
    flex: 1,
    gap: 2,
  },
  documentsTitle: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
  },
  documentHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
    fontFamily: FONTS.montserrat,
  },
  documentError: {
    fontSize: 12,
    color: "#8B4513",
    fontFamily: FONTS.montserrat,
  },
  documentItem: {
    gap: SPACING.xs,
    paddingVertical: 2,
  },
  documentPreviewImage: {
    width: "100%",
    height: 140,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: "#F3EFE6",
  },
  documentPreviewFile: {
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  documentPreviewFileText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
  },
  documentName: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  documentNameInput: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    backgroundColor: COLORS.cardBackground,
  },
  documentActions: {
    flexDirection: "row",
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  documentActionButton: {
    minHeight: 44,
    minWidth: 108,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  documentActionText: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.onPrimary,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    textAlign: "center",
  },
  documentSecondaryButton: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBackground,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 108,
    flexGrow: 1,
    flexShrink: 0,
  },
  documentSecondaryText: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    textAlign: "center",
  },
  documentDeleteButton: {
    borderColor: "#8B4513",
  },
  documentDeleteText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#8B4513",
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    textAlign: "center",
  },
  documentActionPressed: {
    opacity: 0.85,
  },
  documentManageButton: {
    flex: 1,
    minWidth: 108,
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  documentManageButtonDelete: {
    borderColor: "#8B4513",
  },
  documentManageIcon: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
  },
  documentManageText: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    textAlign: "center",
  },
  documentManageTextDelete: {
    color: "#8B4513",
  },
  documentModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.md,
  },
  documentModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  documentModalPreview: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBackground,
  },
  documentModalFilePreview: {
    width: "100%",
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  documentViewerContainer: {
    flex: 1,
    backgroundColor: "#101010",
  },
  documentViewerHeader: {
    paddingTop: 54,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.14)",
    gap: SPACING.sm,
    alignItems: "center",
  },
  documentViewerTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  documentViewerActions: {
    flexDirection: "row",
    gap: SPACING.xs,
    flexWrap: "wrap",
    justifyContent: "center",
    width: "100%",
  },
  documentViewerButton: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  documentViewerButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
  },
  documentViewerCloseButton: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#8B4513",
    backgroundColor: "rgba(139,69,19,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  documentViewerCloseText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
  },
  documentViewerBody: {
    flex: 1,
    padding: SPACING.sm,
  },
  documentViewerContent: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
  },
  preventionSection: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
    gap: SPACING.xs,
  },
  preventionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  preventionTitleWrap: {
    flex: 1,
    gap: 2,
  },
  preventionTitle: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
  },
  preventionHint: {
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  preventionItem: {
    gap: 2,
    paddingVertical: 4,
  },
  preventionItemTitle: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
  },
  preventionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  preventionModalDismiss: {
    flex: 1,
  },
  preventionModalSheet: {
    backgroundColor: "#F5F0E8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  preventionModalScroll: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  preventionModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  preventionFieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontFamily: FONTS.montserrat,
  },
  preventionFieldLabelNoMargin: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontFamily: FONTS.montserrat,
  },
  preventionTypeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: SPACING.md,
  },
  preventionTypeChip: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    backgroundColor: COLORS.background,
  },
  preventionTypeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  preventionTypeChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.textSecondary,
    textAlign: "center",
    width: "100%",
    fontFamily: FONTS.montserrat,
  },
  preventionTypeChipTextActive: {
    color: COLORS.onPrimary,
    fontWeight: "600",
  },
  preventionToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  preventionToggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.borderLight,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  preventionToggleActive: {
    backgroundColor: COLORS.primary,
  },
  preventionToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  preventionToggleThumbActive: {
    alignSelf: "flex-end",
  },
  preventionModalActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  preventionCancelButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  preventionCancelText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  preventionSaveButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  preventionSaveButtonDisabled: {
    opacity: 0.5,
  },
  preventionSaveText: {
    color: COLORS.onPrimary,
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  petManageActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212, 196, 168, 0.4)",
  },
  petManageButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 56,
  },
  petActionButtonPressed: {
    backgroundColor: COLORS.cardBackground,
    borderColor: COLORS.primary,
    transform: [{ scale: 0.98 }],
  },
  petActionButtonDelete: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.borderLight,
  },
  petActionIcon: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
  },
  petActionText: {
    fontSize: 11,
    lineHeight: 14,
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    letterSpacing: 0.1,
    textAlign: "center",
    width: "100%",
  },
  petActionTextDelete: {
    color: "#8B4513",
  },
  addPetButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  addPetButtonText: {
    color: COLORS.onPrimary,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
});
