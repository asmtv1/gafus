import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import {
  getPetDocumentDisplayName,
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  type PetDocumentDto,
} from "@gafus/types";

import petAvatarImage from "../../../assets/images/pet-avatar.png";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import {
  useMobileOnboardingTourStore,
  type MobileOnboardingTourTargetId,
} from "@/features/onboarding-tour";
import { TourTarget, useTourTargets } from "@/shared/lib/tour-targets";
import { Button, Input } from "@/shared/components/ui";
import { PageHeader, TexturedSafeAreaView } from "@/shared/components";
import { trackEvent } from "@/shared/lib/analytics";
import { petsQueryOptions } from "@/shared/lib/api/profileTabQueries";
import { petsApi, type Pet, type PetDocument } from "@/shared/lib/api/pets";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
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
const TOUR_TARGET_TOP_INSET = 116;
const TOUR_TARGET_BOTTOM_RESERVED = 320;
const TOUR_TARGET_SCROLL_RETRY_MS = 120;

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

function ZoomableDocumentImage({
  uri,
  onSwipeLeft,
  onSwipeRight,
}: {
  uri: string;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, uri]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 1), 4);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd((event) => {
      if (scale.value <= 1.01) {
        const isHorizontalSwipe =
          Math.abs(event.translationX) > 70 &&
          Math.abs(event.translationX) > Math.abs(event.translationY) * 1.2;
        if (isHorizontalSwipe) {
          if (event.translationX < 0) {
            runOnJS(onSwipeLeft)();
          } else {
            runOnJS(onSwipeRight)();
          }
        }
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, panGesture)}>
      <Animated.View style={[styles.documentViewerContent, animatedStyle]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

function PetDocumentsSection({ pet }: PetDocumentsSectionProps) {
  const queryClient = useQueryClient();
  const [pendingDocument, setPendingDocument] = useState<PendingDocumentUpload | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editingDocumentName, setEditingDocumentName] = useState("");
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [openedDocumentIndex, setOpenedDocumentIndex] = useState<number | null>(null);
  const {
    data: documentsResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["pets", "documents", pet.id],
    queryFn: () => petsApi.getDocuments(pet.id),
  });

  const documents = useMemo(
    () =>
      [...(documentsResponse?.data ?? [])].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [documentsResponse?.data],
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Доступ", "Нужен доступ к галерее для выбора документа");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const file = result.assets[0];
    const mimeType = file.mimeType ?? "";
    const size = file.fileSize ?? 0;

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

    const originalName = file.fileName || `document_${Date.now()}`;
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
    mutationFn: ({ documentId }: { documentId: string }) =>
      petsApi.deleteDocument(pet.id, documentId),
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
      return petsApi.renameDocument(pet.id, documentId, name);
    },
    onSuccess: (response) => {
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось обновить название документа");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["pets", "documents", pet.id] });
      setEditingDocumentId(null);
      setEditingDocumentName("");
      setIsRenameModalVisible(false);
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
    setIsRenameModalVisible(true);
  };

  const handleCancelRenameDocument = () => {
    setEditingDocumentId(null);
    setEditingDocumentName("");
    setIsRenameModalVisible(false);
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
  const imageDocuments = documents.filter((document) => isImageDocument(document.mimeType));

  const handleShowSiblingImage = useCallback(
    (direction: 1 | -1) => {
      if (!openedDocument || !isImageDocument(openedDocument.mimeType)) {
        return;
      }
      const currentImageIndex = imageDocuments.findIndex(
        (document) => document.id === openedDocument.id,
      );
      const nextImage = imageDocuments[currentImageIndex + direction];
      if (!nextImage) {
        return;
      }
      const nextDocumentIndex = documents.findIndex((document) => document.id === nextImage.id);
      if (nextDocumentIndex === -1) {
        return;
      }
      void hapticFeedback.light();
      setOpenedDocumentIndex(nextDocumentIndex);
    },
    [documents, imageDocuments, openedDocument],
  );

  const handleCloseDocumentPreview = () => {
    setOpenedDocumentIndex(null);
  };

  return (
    <TourTarget id="pet-documents-section">
      <View style={styles.documentsSection}>
        <View style={styles.documentsHeader}>
          <View style={styles.documentsTitleWrap}>
            <Text style={styles.documentsTitle}>Документы</Text>
            <Text style={styles.documentHint}>
              Фото ветпаспорта, справки и другие файлы питомца
            </Text>
          </View>
          <Button
            label="Добавить"
            width={124}
            fullWidth={false}
            height={44}
            fontFamily={FONTS.montserrat}
            fontWeight="600"
            fontSize={13}
            lineHeight={18}
            horizontalPadding={16}
            verticalPadding={10}
            borderRadius={12}
            animatedPress
            onPress={handlePickDocument}
            disabled={uploadDocumentMutation.isPending}
          />
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
            <Text style={styles.documentName} numberOfLines={1}>
              Название файла: {getPetDocumentDisplayName(document.name)}
            </Text>
            <View style={styles.documentFileActions}>
              <View style={styles.documentFileActionsRow}>
                <Button
                  label="Изменить название"
                  variant="primary"
                  flex={1}
                  fullWidth={false}
                  height={52}
                  fontFamily={FONTS.montserrat}
                  fontWeight="600"
                  fontSize={11}
                  lineHeight={15}
                  horizontalPadding={2}
                  verticalPadding={0}
                  borderRadius={14}
                  icon="pencil-outline"
                  animatedPress
                  onPress={() => handleStartRenameDocument(document)}
                />
                <Button
                  label="Поделиться файлом"
                  variant="primary"
                  flex={1}
                  fullWidth={false}
                  height={52}
                  fontFamily={FONTS.montserrat}
                  fontWeight="600"
                  fontSize={11}
                  lineHeight={15}
                  horizontalPadding={2}
                  verticalPadding={0}
                  borderRadius={14}
                  icon="share-variant-outline"
                  animatedPress
                  onPress={() => void handleShareDocument(document)}
                />
              </View>
              <Button
                label="Удалить файл"
                variant="secondary"
                height={52}
                fontFamily={FONTS.montserrat}
                fontWeight="600"
                fontSize={12}
                lineHeight={16}
                horizontalPadding={8}
                verticalPadding={0}
                borderRadius={14}
                icon="trash-can-outline"
                animatedPress
                onPress={() => handleDeleteDocument(document)}
                disabled={deleteDocumentMutation.isPending || renameDocumentMutation.isPending}
                accessibilityHint="Открывает подтверждение удаления файла"
              />
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
                  contentFit="contain"
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
                <Button
                  label="Отмена"
                  variant="secondary"
                  flex={1}
                  fullWidth={false}
                  height={52}
                  fontFamily={FONTS.montserrat}
                  fontWeight="600"
                  fontSize={13}
                  lineHeight={18}
                  horizontalPadding={8}
                  verticalPadding={0}
                  borderRadius={14}
                  animatedPress
                  onPress={() => setPendingDocument(null)}
                  disabled={uploadDocumentMutation.isPending}
                />
                <Button
                  label={uploadDocumentMutation.isPending ? "Загрузка..." : "Сохранить"}
                  flex={1}
                  fullWidth={false}
                  height={52}
                  fontFamily={FONTS.montserrat}
                  fontWeight="600"
                  fontSize={13}
                  lineHeight={18}
                  horizontalPadding={8}
                  verticalPadding={0}
                  borderRadius={14}
                  animatedPress
                  onPress={handleUploadDocument}
                  disabled={uploadDocumentMutation.isPending}
                />
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={isRenameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCancelRenameDocument}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.documentModalOverlay}
          >
            <Pressable
              style={styles.documentRenameModalDismiss}
              onPress={handleCancelRenameDocument}
            />
            <View style={styles.documentModalCard}>
              <Text style={styles.documentsTitle}>Изменить название</Text>
              <TextInput
                value={editingDocumentName}
                onChangeText={setEditingDocumentName}
                style={styles.documentNameInput}
                editable={!renameDocumentMutation.isPending}
                placeholder="Название документа"
                placeholderTextColor={COLORS.textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveRenameDocument}
              />
              <View style={styles.documentActions}>
                <Button
                  label="Отмена"
                  variant="secondary"
                  flex={1}
                  fullWidth={false}
                  height={52}
                  fontFamily={FONTS.montserrat}
                  fontWeight="600"
                  fontSize={13}
                  lineHeight={18}
                  horizontalPadding={8}
                  verticalPadding={0}
                  borderRadius={14}
                  animatedPress
                  onPress={handleCancelRenameDocument}
                  disabled={renameDocumentMutation.isPending}
                />
                <Button
                  label={renameDocumentMutation.isPending ? "Сохранение..." : "Сохранить"}
                  flex={1}
                  fullWidth={false}
                  height={52}
                  fontFamily={FONTS.montserrat}
                  fontWeight="600"
                  fontSize={13}
                  lineHeight={18}
                  horizontalPadding={8}
                  verticalPadding={0}
                  borderRadius={14}
                  animatedPress
                  onPress={handleSaveRenameDocument}
                  disabled={renameDocumentMutation.isPending}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
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
                    <WebView
                      source={{ uri: openedDocument.url }}
                      style={styles.documentViewerContent}
                    />
                  ) : (
                    <ZoomableDocumentImage
                      uri={openedDocument.url}
                      onSwipeLeft={() => handleShowSiblingImage(1)}
                      onSwipeRight={() => handleShowSiblingImage(-1)}
                    />
                  )}
                </View>
              </>
            ) : null}
          </View>
        </Modal>
      </View>
    </TourTarget>
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
  const isOffline = useIsOffline();
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
      entry.reminderOnDate
        ? entry.reminderOnDate.split("T")[0]
        : new Date().toISOString().split("T")[0],
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
    <TourTarget id="pet-prevention-section">
      <View style={styles.preventionSection}>
        <View style={styles.preventionHeader}>
          <View style={styles.preventionTitleWrap}>
            <Text style={styles.preventionTitle}>Записи о процедурах</Text>
            <Text style={styles.preventionHint}>
              Справочно: не заменяет консультацию ветеринара.
            </Text>
          </View>
          <Button
            label="Добавить"
            width={124}
            fullWidth={false}
            height={44}
            fontFamily={FONTS.montserrat}
            fontWeight="600"
            fontSize={13}
            lineHeight={18}
            horizontalPadding={16}
            verticalPadding={10}
            borderRadius={12}
            animatedPress
            onPress={handleOpenAdd}
          />
        </View>

        {isLoading ? <Text style={styles.documentHint}>Загрузка записей...</Text> : null}
        {isError ? (
          <Text style={styles.documentError}>Не удалось загрузить записи о процедурах</Text>
        ) : null}
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
            {entry.productName ? (
              <Text style={styles.documentHint}>Препарат: {entry.productName}</Text>
            ) : null}
            {entry.notes ? (
              <Text style={styles.documentHint} numberOfLines={2}>
                {entry.notes}
              </Text>
            ) : null}
            <View style={styles.documentActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.documentSecondaryButton,
                  pressed && styles.documentActionPressed,
                ]}
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
              <ScrollView
                contentContainerStyle={styles.preventionModalScroll}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.preventionModalTitle}>
                  {editingEntry ? "Изменить запись" : "Добавить запись"}
                </Text>

                <Text style={styles.preventionFieldLabel}>Тип процедуры</Text>
                <View style={styles.preventionTypeRow}>
                  {PREVENTION_TYPES.map((item) => (
                    <Button
                      key={item.value}
                      label={item.label}
                      variant={type === item.value ? "selected" : "primary"}
                      width={item.value === "TICKS_FLEAS" ? "100%" : "48.8%"}
                      fullWidth={false}
                      height={50}
                      fontSize={13}
                      lineHeight={18}
                      fontFamily={FONTS.montserratMedium}
                      horizontalPadding={6}
                      verticalPadding={0}
                      borderRadius={12}
                      animatedPress
                      onPress={() => setType(item.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: type === item.value }}
                    />
                  ))}
                </View>

                <Input
                  label="Дата процедуры *"
                  value={performedAt}
                  onChangeText={setPerformedAt}
                  placeholder="YYYY-MM-DD"
                  style={styles.preventionInput}
                />
                <Input
                  label="Препарат"
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="Название (необязательно)"
                  style={styles.preventionInput}
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
                  <Switch
                    value={reminderEnabled}
                    onValueChange={setReminderEnabled}
                    trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
                    thumbColor={COLORS.surface}
                    ios_backgroundColor={COLORS.borderLight}
                    accessibilityLabel="Включить напоминание"
                  />
                </View>

                {reminderEnabled ? (
                  <>
                    <View style={[styles.preventionTypeRow, styles.preventionReminderTypeRow]}>
                      <Button
                        label="Через N дней"
                        variant={reminderKind === "AFTER_DAYS" ? "selected" : "primary"}
                        flex={1}
                        fullWidth={false}
                        height={48}
                        fontSize={13}
                        lineHeight={18}
                        fontFamily={FONTS.montserratMedium}
                        horizontalPadding={6}
                        verticalPadding={0}
                        borderRadius={12}
                        animatedPress
                        onPress={() => setReminderKind("AFTER_DAYS")}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: reminderKind === "AFTER_DAYS" }}
                      />
                      <Button
                        label="По дате"
                        variant={reminderKind === "ON_DATE" ? "selected" : "primary"}
                        flex={1}
                        fullWidth={false}
                        height={48}
                        fontSize={13}
                        lineHeight={18}
                        fontFamily={FONTS.montserratMedium}
                        horizontalPadding={6}
                        verticalPadding={0}
                        borderRadius={12}
                        animatedPress
                        onPress={() => setReminderKind("ON_DATE")}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: reminderKind === "ON_DATE" }}
                      />
                    </View>
                    {reminderKind === "AFTER_DAYS" ? (
                      <Input
                        label="Через сколько дней"
                        value={String(reminderDaysAfter)}
                        onChangeText={(value) => setReminderDaysAfter(parseInt(value, 10) || 1)}
                        keyboardType="number-pad"
                        style={styles.preventionInput}
                      />
                    ) : (
                      <Input
                        label="Дата напоминания *"
                        value={reminderOnDate}
                        onChangeText={setReminderOnDate}
                        placeholder="YYYY-MM-DD"
                        style={styles.preventionInput}
                      />
                    )}
                  </>
                ) : null}

                <View style={styles.preventionModalActions}>
                  <Button
                    label="Отмена"
                    variant="secondary"
                    flex={1}
                    fullWidth={false}
                    height={48}
                    fontFamily={FONTS.montserrat}
                    fontWeight="600"
                    fontSize={15}
                    lineHeight={20}
                    horizontalPadding={0}
                    verticalPadding={14}
                    borderRadius={10}
                    onPress={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                  />
                  <Button
                    label={saving ? "Сохранение..." : "Сохранить"}
                    flex={1}
                    fullWidth={false}
                    height={48}
                    fontFamily={FONTS.montserrat}
                    fontWeight="600"
                    fontSize={15}
                    lineHeight={20}
                    horizontalPadding={0}
                    verticalPadding={14}
                    borderRadius={10}
                    onPress={handleSave}
                    disabled={saving}
                  />
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </TourTarget>
  );
}

export default function PetsTabScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { measureTarget } = useTourTargets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const scrollLayoutHeightRef = useRef(0);
  const tourIsActive = useMobileOnboardingTourStore((s) => s.isActive);
  const tourStepId = useMobileOnboardingTourStore((s) => s.currentStepId);
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

  const getPetsTourTargetId = useCallback((): MobileOnboardingTourTargetId | null => {
    if (tourStepId === "add-pet") return "pets-add-button";
    if (tourStepId === "prevention") return "pet-prevention-section";
    if (tourStepId === "documents") return "pet-documents-section";
    return null;
  }, [tourStepId]);

  const scrollToTourTarget = useCallback(
    async (animated: boolean) => {
      if (!tourIsActive || pets.length === 0) return;
      const targetId = getPetsTourTargetId();
      if (!targetId) return;

      const rect = await measureTarget(targetId);
      if (!rect) return;

      const viewportHeight = scrollLayoutHeightRef.current;
      if (viewportHeight <= 0) return;

      const visibleTop = TOUR_TARGET_TOP_INSET;
      const visibleBottom = Math.max(visibleTop + 40, viewportHeight - TOUR_TARGET_BOTTOM_RESERVED);

      let nextOffset = scrollOffsetRef.current;
      const targetTop = rect.y;
      const targetBottom = rect.y + rect.height;

      if (targetTop < visibleTop) {
        nextOffset = Math.max(0, scrollOffsetRef.current - (visibleTop - targetTop) - 12);
      } else if (targetBottom > visibleBottom) {
        nextOffset = Math.max(0, scrollOffsetRef.current + (targetBottom - visibleBottom) + 12);
      } else {
        return;
      }

      scrollRef.current?.scrollTo({ y: nextOffset, animated });
    },
    [getPetsTourTargetId, measureTarget, pets.length, tourIsActive],
  );

  useEffect(() => {
    if (!tourIsActive || pets.length === 0) return;

    const timeoutHandles: ReturnType<typeof setTimeout>[] = [];
    const interaction = InteractionManager.runAfterInteractions(() => {
      const timeout = setTimeout(() => {
        void scrollToTourTarget(true);
        const retry = setTimeout(() => {
          void scrollToTourTarget(false);
        }, TOUR_TARGET_SCROLL_RETRY_MS);
        timeoutHandles.push(retry);
      }, 120);
      timeoutHandles.push(timeout);
    });

    return () => {
      interaction.cancel();
      timeoutHandles.forEach(clearTimeout);
    };
  }, [pets.length, scrollToTourTarget, tourIsActive]);

  return (
    <TexturedSafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        onLayout={(event) => {
          scrollLayoutHeightRef.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={() => {
          if (tourIsActive) {
            setTimeout(() => {
              void scrollToTourTarget(false);
            }, 0);
          }
        }}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader title="Питомцы" description="Здоровье, документы и важные записи питомцев" />
        {pets.length === 0 ? (
          <View style={styles.emptyStateWrap}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="paw-outline" size={31} color={COLORS.primary} />
              </View>
              <Text style={styles.noPets}>Питомцы пока не добавлены</Text>
              <Text style={styles.emptyStateHint}>
                Добавьте питомца, чтобы записывать прививки, ставить напоминания и хранить документы
                по вашему питомцу.
              </Text>
            </View>
            <TourTarget id="pets-add-button">
              <Button
                label="Добавить питомца"
                style={styles.addPetButton}
                onPress={() => {
                  trackPetsClick("pet-add-open");
                  router.push({ pathname: "/pets/add" });
                }}
              />
            </TourTarget>
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
                    accessibilityRole="button"
                    accessibilityLabel={`Изменить фотографию питомца ${pet.name}`}
                  >
                    {pet.photoUrl ? (
                      <Image
                        source={{ uri: pet.photoUrl }}
                        style={styles.petAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <Image source={petAvatarImage} style={styles.petAvatar} contentFit="cover" />
                    )}
                    <View style={styles.petAvatarEditBadge}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color="#F6F0DF" />
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
                    {pet.heightCm ? (
                      <Text style={styles.petDetail}>Рост: {pet.heightCm} см</Text>
                    ) : null}
                    {pet.weightKg ? (
                      <Text style={styles.petDetail}>Вес: {pet.weightKg} кг</Text>
                    ) : null}
                    {pet.neckGirthCm ? (
                      <Text style={styles.petDetail}>Обхват шеи: {pet.neckGirthCm} см</Text>
                    ) : null}
                    {pet.muzzleGirthCm ? (
                      <Text style={styles.petDetail}>Обхват морды: {pet.muzzleGirthCm} см</Text>
                    ) : null}
                    {pet.bellyGirthCm ? (
                      <Text style={styles.petDetail}>Обхват живота: {pet.bellyGirthCm} см</Text>
                    ) : null}
                    {pet.notes ? (
                      <Text style={styles.petNotes} numberOfLines={2}>
                        Заметки: {pet.notes}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.petCardActions}>
                  <View style={styles.petManageActions}>
                    <Button
                      label="Изменить питомца"
                      variant="primary"
                      flex={1}
                      fullWidth={false}
                      height={56}
                      fontSize={11}
                      lineHeight={15}
                      fontFamily={FONTS.montserrat}
                      fontWeight="600"
                      horizontalPadding={2}
                      verticalPadding={0}
                      borderRadius={14}
                      icon="pencil-outline"
                      animatedPress
                      onPress={() => {
                        trackPetsClick("pet-edit-open");
                        handleEditPet(pet);
                      }}
                    />
                    <Button
                      label="Удалить питомца"
                      variant="secondary"
                      flex={1}
                      fullWidth={false}
                      height={56}
                      fontSize={11}
                      lineHeight={15}
                      fontFamily={FONTS.montserrat}
                      fontWeight="600"
                      horizontalPadding={2}
                      verticalPadding={0}
                      borderRadius={14}
                      icon="trash-can-outline"
                      animatedPress
                      onPress={() => handleDeletePet(pet)}
                      accessibilityHint="Открывает подтверждение удаления питомца"
                    />
                  </View>
                  <PetPreventionSection pet={pet} />
                  <PetDocumentsSection pet={pet} />
                </View>
              </View>
            ))}
          </View>
        )}
        {pets.length > 0 ? (
          <TourTarget id="pets-add-button">
            <Button
              label="Добавить питомца"
              style={styles.addPetButton}
              onPress={() => {
                trackPetsClick("pet-add-open");
                router.push({ pathname: "/pets/add" });
              }}
            />
          </TourTarget>
        ) : null}
      </ScrollView>
    </TexturedSafeAreaView>
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
    paddingBottom: SPACING.xxl,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#FFF8E5",
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99, 97, 40, 0.12)",
    marginBottom: SPACING.md,
  },
  emptyStateWrap: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: SPACING.xl,
  },
  noPets: {
    color: COLORS.text,
    fontSize: 19,
    lineHeight: 25,
    textAlign: "center",
    fontFamily: FONTS.montserratBold,
  },
  emptyStateHint: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: FONTS.montserrat,
  },
  petsList: {
    flexDirection: "column",
    gap: SPACING.md,
  },
  petItem: {
    flexDirection: "column",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    backgroundColor: "#FFF8E5",
    borderRadius: 22,
    marginBottom: SPACING.xs,
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5,
  },
  petMainInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  petAvatarPressable: {
    position: "relative",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F5F0E8",
    padding: 4,
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
  petAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  petAvatarEditBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  petInfo: {
    flex: 1,
    paddingTop: 2,
    gap: 2,
  },
  petName: {
    fontSize: 19,
    lineHeight: 25,
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
    marginBottom: 6,
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
    marginTop: SPACING.lg,
  },
  documentsSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(99, 97, 40, 0.18)",
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  documentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },
  documentsTitleWrap: {
    flex: 1,
    gap: 2,
  },
  documentsTitle: {
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
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
    backgroundColor: "#FFF8E5",
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
  documentFileActions: {
    gap: SPACING.xs,
    paddingTop: 2,
    paddingBottom: SPACING.sm,
  },
  documentFileActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: SPACING.xs,
  },
  documentSecondaryButton: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    backgroundColor: "#F5F0E8",
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
    borderColor: "#c62828",
  },
  documentDeleteText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#c62828",
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    textAlign: "center",
  },
  documentActionPressed: {
    opacity: 0.85,
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
    backgroundColor: "#F5F0E8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  documentRenameModalDismiss: {
    ...StyleSheet.absoluteFillObject,
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
    borderTopWidth: 1,
    borderTopColor: "rgba(99, 97, 40, 0.18)",
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  preventionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },
  preventionTitleWrap: {
    flex: 1,
    gap: 2,
  },
  preventionTitle: {
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
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
    flexWrap: "wrap",
    gap: 8,
    marginBottom: SPACING.md,
  },
  preventionReminderTypeRow: {
    marginTop: SPACING.xs,
  },
  preventionToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.md,
    minHeight: 52,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: "#F5F0E8",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  preventionModalActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  preventionInput: {
    minHeight: 52,
  },
  petManageActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  addPetButton: {
    marginTop: SPACING.md,
  },
});
