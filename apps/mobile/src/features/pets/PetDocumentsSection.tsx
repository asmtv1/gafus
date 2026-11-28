import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { MediaPickerError, pickMedia } from "@/shared/lib/media/mediaPicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { WebView } from "react-native-webview";
import { getPetDocumentDisplayName, PET_DOCUMENT_ALLOWED_MIME_TYPES, PET_DOCUMENT_MAX_SIZE_BYTES, type PetDocumentDto } from "@gafus/types";
import petDocumentsIcon from "../../../assets/images/pet-documents-icon.png";
import { COLORS, FONTS } from "@/shared/config";
import { TourTarget } from "@/shared/lib/tour-targets";
import { Button, Input } from "@/shared/components/ui";
import { trackEvent } from "@/shared/lib/analytics";
import { isCurrentPetsActor, type PetsReadActor } from "@/shared/lib/api/profileTabQueries";
import { petsApi, type Pet, type PetDocument } from "@/shared/lib/api/pets";
import { PetDocumentsList } from "@/features/pets/PetDocumentsList";
import { reportClientError } from "@/shared/lib/error-reporting";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { styles, declOfNum } from "./petTabPresentation";
interface PetDocumentsSectionProps {
  pet: Pet;
  actor: PetsReadActor;
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
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}


export function PetDocumentsSection({ pet, actor }: PetDocumentsSectionProps) {
  const currentActor = useCallback(() => isCurrentPetsActor(actor), [actor]);
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
    queryKey: ["pets", "documents", pet.id, actor.ownerId, actor.authEpoch],
    enabled: currentActor(),
    queryFn: () => petsApi.getDocuments(pet.id, currentActor),
  });

  const documents = useMemo(
    () =>
      [...(currentActor() ? documentsResponse?.data ?? [] : [])].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [documentsResponse?.data, currentActor],
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
      const response = await petsApi.uploadDocument(pet.id, uri, mimeType, fileName, currentActor);
      return { cancelled: false, response } as const;
    },
    onSuccess: (result) => {
      if (!currentActor()) return;
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
      void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
      setPendingDocument(null);
      setDocumentTitle("");
    },
    onError: (error) => {
      if (!currentActor()) return;
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
    if (!currentActor()) return;
    let result;
    try {
      result = await pickMedia({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      }, {
        onPermissionDenied: () => { if (currentActor()) Alert.alert("Доступ", "Нужен доступ к галерее для выбора документа"); },
      });
    } catch (error) {
      if (!currentActor()) return;
      reportClientError(error, {
        issueKey: "PetsScreen",
        keys: { operation: "pick_pet_document", petId: pet.id },
      });
      Alert.alert("Ошибка", error instanceof MediaPickerError ? error.message : "Не удалось выбрать документ");
      return;
    }
    if (!currentActor() || result.canceled || !result.assets[0]) {
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
    if (!currentActor()) return;
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
      petsApi.deleteDocument(pet.id, documentId, currentActor),
    onSuccess: (response) => {
      if (!currentActor()) return;
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
      void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
    },
    onError: (error) => {
      if (!currentActor()) return;
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
      return petsApi.renameDocument(pet.id, documentId, name, currentActor);
    },
    onSuccess: (response) => {
      if (!currentActor()) return;
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось обновить название документа");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["pets", "documents", pet.id] });
      void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
      setEditingDocumentId(null);
      setEditingDocumentName("");
      setIsRenameModalVisible(false);
    },
    onError: (error) => {
      if (!currentActor()) return;
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "rename_pet_document", petId: pet.id },
      });
      Alert.alert("Ошибка", "Не удалось обновить название документа");
    },
  });

  const handleOpenDocument = async (document: PetDocumentDto) => {
    if (!currentActor()) return;
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
      if (!currentActor()) return;
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
    if (!currentActor()) return;
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
          onPress: () => { if (currentActor()) deleteDocumentMutation.mutate({ documentId: document.id }); },
        },
      ],
    );
  };

  const handleStartRenameDocument = (document: PetDocument) => {
    if (!currentActor()) return;
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
    if (!currentActor()) return;
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
    if (!currentActor()) return;
    try {
      await Share.share({
        message: document.url,
        url: document.url,
      });
    } catch (error) {
      if (!currentActor()) return;
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "PetsScreen",
        keys: { operation: "share_pet_document", petId: pet.id, documentId: document.id },
      });
      Alert.alert("Ошибка", "Не удалось поделиться документом");
    }
  };

  const handleDownloadDocument = async (document: PetDocument) => {
    if (!currentActor()) return;
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
      if (!currentActor()) {
        await FileSystem.deleteAsync(destinationUri, { idempotent: true });
        return;
      }

      await Share.share({
        message: "Документ скачан. Выберите приложение для сохранения или отправки.",
        url: destinationUri,
      });
    } catch (error) {
      if (!currentActor()) return;
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
          <View style={styles.documentHeading}>
            <Image
              source={petDocumentsIcon}
              style={styles.documentSectionIcon}
              contentFit="contain"
            />
            <View style={styles.documentsTitleWrap}>
              <Text style={styles.documentsTitle}>Документы</Text>
              {!isLoading && !isError && documents.length > 0 && (
                <Text style={styles.documentHint}>
                  {documents.length}{" "}
                  {declOfNum(documents.length, ["документ", "документа", "документов"])}
                </Text>
              )}
            </View>
          </View>
          <Button
            label="Добавить"
            variant="outline"
            icon="plus"
            width={122}
            fullWidth={false}
            height={44}
            fontSize={12}
            horizontalPadding={5}
            verticalPadding={0}
            borderRadius={12}
            accessibilityLabel="Добавить документ"
            disabled={uploadDocumentMutation.isPending}
            onPress={() => void handlePickDocument()}
          />
        </View>

        {isLoading ? <Text style={styles.documentHint}>Загружаем документы…</Text> : null}
        {isError ? <Text style={styles.documentError}>Не удалось загрузить документы</Text> : null}
        {!isLoading && !isError && documents.length === 0 && (
          <View style={styles.documentEmptyState}>
            <MaterialCommunityIcons name="file-document-outline" size={24} color="#8A957A" />
            <View style={styles.documentEmptyContent}>
              <Text style={styles.documentEmptyTitle}>Документов пока нет</Text>
              <Text style={styles.documentHint}>Добавьте фото ветпаспорта или справку.</Text>
            </View>
          </View>
        )}

        {documents.length > 0 && (
          <PetDocumentsList
            documents={documents}
            busy={deleteDocumentMutation.isPending || renameDocumentMutation.isPending}
            onOpen={(document) => void handleOpenDocument(document)}
            onRename={handleStartRenameDocument}
            onShare={(document) => void handleShareDocument(document)}
            onDownload={(document) => void handleDownloadDocument(document)}
            onDelete={handleDeleteDocument}
          />
        )}

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
