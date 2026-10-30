import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Stack, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  verifiedVetActor,
  sameVetActor,
  vetVisitsForActor,
  vetHistoryCacheForActor,
  vetDetailCacheForActor,
  vetVisitDetailForActor,
  signedVetMediaUrl,
  type VetReadActor,
} from "./vetVisitsRead";
import * as FileSystem from "expo-file-system/legacy";
import {
  emptyVetVisit,
  vetVisitDateLabel,
  type PetVetVisit,
  type PetVetVisitInput,
  type PetVetAttachment,
} from "@gafus/types";
import { COLORS, FONTS } from "@/shared/config";
import { Button, Loading } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { useAuthStore } from "@/shared/stores";
import { petsApi } from "@/shared/lib/api/pets";
import { petVetVisitsApi as api, type VetLocalFile } from "@/shared/lib/api/pet-vet-visits";
import { reportClientError } from "@/shared/lib/tracer";
import { createVetVisitAndReadback } from "./vetVisitCreate";
import { editVetVisitAndReadback } from "./vetVisitEdit";
import { deleteVetVisitAndReadback } from "./vetVisitDelete";
import { vetFieldErrorMessage, type VetFieldErrors } from "./vetVisitMutationValidation";

const fields = [
  ["specialty", "Специальность врача", 200],
  ["doctorName", "ФИО врача", 200],
  ["clinic", "Какая клиника", 300],
  ["diagnosis", "Какой был диагноз", 10_000],
  ["conclusion", "Какое было заключение", 10_000],
  ["notes", "Ваши заметки", 10_000],
] as const;

export function PetVetVisitShortcut({ petId }: { petId: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Посещения врача"
      style={s.shortcut}
      onPress={() => router.push({ pathname: "/pets/[petId]/vet-visits", params: { petId } })}
    >
      <MaterialCommunityIcons name="stethoscope" size={30} color={COLORS.primary} />
      <View style={s.grow}>
        <Text style={s.shortcutTitle}>Посещения врача</Text>
        <Text style={s.caption}>Приёмы, заключения и медкарты</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.primary} />
    </Pressable>
  );
}

function Attachment({
  petId,
  visitId,
  item,
  actor,
}: {
  petId: string;
  visitId: string;
  item: PetVetAttachment;
  actor: VetReadActor;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const [previewRequested, setPreviewRequested] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const preview = useQuery({
    queryKey: ["vet-media", "owner", actor.ownerId, actor.authEpoch, petId, visitId, item.id],
    enabled: previewRequested && item.hasPreview && sameVetActor(actor),
    queryFn: async () => {
      const result = await api.media(petId, visitId, item.id, "preview", () => sameVetActor(actor));
      if (!sameVetActor(actor)) return null;
      const url = signedVetMediaUrl(result.url);
      if (!url) throw new Error("VET_MEDIA_UNSIGNED_OR_EXPIRED");
      return { url };
    },
    staleTime: 50_000,
    gcTime: 0,
    retry: false,
  });
  async function perform(work: () => Promise<void>) {
    if (busy || !sameVetActor(actor)) return;
    setBusy(true);
    try {
      await work();
    } catch {
      reportClientError(new Error("Vet attachment action failed"), {
        issueKey: "PetVetVisits",
        keys: { operation: "attachment" },
      });
      if (sameVetActor(actor))
        Alert.alert("Не удалось открыть вложение", "Проверьте доступ и повторите позднее.");
    } finally {
      if (sameVetActor(actor)) setBusy(false);
    }
  }
  async function download() {
    const response = await api.media(petId, visitId, item.id, "download", () =>
      sameVetActor(actor),
    );
    if (!sameVetActor(actor)) return;
    const url = signedVetMediaUrl(response.url);
    if (!url) throw new Error("VET_MEDIA_UNSIGNED_OR_EXPIRED");
    const ext =
      (
        {
          "application/pdf": "pdf",
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        } as Record<string, string>
      )[item.mimeType] ?? "bin";
    const temp = `${FileSystem.cacheDirectory}vet-${item.id}.${ext}`;
    try {
      if (!sameVetActor(actor)) return;
      const result = await FileSystem.downloadAsync(url, temp);
      if (!sameVetActor(actor)) return;
      if (result.status !== 200) throw new Error("Не удалось скачать файл. Повторите попытку");
      if (Platform.OS === "android") {
        const permission =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const dest = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          item.name,
          item.mimeType,
        );
        const contents = await FileSystem.readAsStringAsync(temp, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(dest, contents, {
          encoding: FileSystem.EncodingType.Base64,
        });
        Alert.alert("Готово", "Оригинал сохранён в выбранную папку");
      } else await Share.share({ url: temp });
    } finally {
      await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => undefined);
    }
  }
  return (
    <View style={s.attachment}>
      <Pressable
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Открыть ${item.name}`}
        onPress={() =>
          void perform(async () => {
            const response = await api.media(petId, visitId, item.id, "original", () =>
              sameVetActor(actor),
            );
            if (!sameVetActor(actor)) return;
            const url = signedVetMediaUrl(response.url);
            if (!url) throw new Error("VET_MEDIA_UNSIGNED_OR_EXPIRED");
            if (item.mimeType === "application/pdf") await Linking.openURL(url);
            else {
              setFullFailed(false);
              setFull(url);
            }
          })
        }
      >
        {sameVetActor(actor) &&
        previewRequested &&
        item.hasPreview &&
        preview.data?.url &&
        !previewFailed ? (
          <Image
            key={imageAttempt}
            source={{ uri: preview.data.url }}
            style={s.preview}
            contentFit="contain"
            cachePolicy="memory"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <View style={s.pdf}>
            <MaterialCommunityIcons
              name={item.mimeType === "application/pdf" ? "file-pdf-box" : "image-outline"}
              size={38}
              color={COLORS.primary}
            />
          </View>
        )}
        <Text style={s.fileName}>{item.name}</Text>
        {item.previewProcessing && <Text style={s.caption}>Обрабатываем превью…</Text>}
      </Pressable>
      {item.hasPreview &&
        sameVetActor(actor) &&
        (!previewRequested || preview.error || previewFailed) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!sameVetActor(actor)) return;
              setPreviewRequested(true);
              setPreviewFailed(false);
              setImageAttempt((value) => value + 1);
              if (previewRequested) void preview.refetch();
            }}
          >
            <Text style={s.link}>
              {previewRequested ? "Повторить загрузку превью" : "Показать превью"}
            </Text>
          </Pressable>
        )}
      <Button
        label={busy ? "Загрузка…" : "Скачать оригинал"}
        variant="caramel"
        disabled={busy}
        onPress={() => void perform(download)}
      />
      <Modal
        visible={!!full && sameVetActor(actor)}
        animationType="fade"
        onRequestClose={() => setFull(null)}
      >
        <SafeAreaProvider>
          <TexturedSafeAreaView style={s.viewer}>
            <View style={s.viewerHeader}>
              <Button label="Закрыть" variant="caramel" onPress={() => setFull(null)} />
            </View>
            <ScrollView
              style={s.grow}
              contentContainerStyle={s.viewerImageWrap}
              minimumZoomScale={1}
              maximumZoomScale={4}
              centerContent
            >
              {fullFailed ? (
                <View style={s.content}>
                  <Text accessibilityRole="alert">Не удалось загрузить изображение</Text>
                  <Button
                    label="Повторить"
                    disabled={busy}
                    onPress={() =>
                      void perform(async () => {
                        const res = await api.media(petId, visitId, item.id, "original", () =>
                          sameVetActor(actor),
                        );
                        if (!sameVetActor(actor)) return;
                        const url = signedVetMediaUrl(res.url);
                        if (!url) throw new Error("VET_MEDIA_UNSIGNED_OR_EXPIRED");
                        setFull(url);
                        setImageAttempt((value) => value + 1);
                        setFullFailed(false);
                      })
                    }
                  />
                </View>
              ) : (
                full && (
                  <Image
                    key={imageAttempt}
                    accessibilityLabel={item.name}
                    source={{ uri: full }}
                    style={s.fullImage}
                    contentFit="contain"
                    cachePolicy="memory"
                    onError={() => setFullFailed(true)}
                  />
                )
              )}
            </ScrollView>
          </TexturedSafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

export function PetVetVisitsScreen({ petId }: { petId: string }) {
  const navigation = useNavigation();
  const { top: topInset } = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const authUser = useAuthStore((state) => state.user);
  const authActive = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);
  const actorSnapshot = authActive && !authLoading && authUser?.id ? verifiedVetActor() : null;
  const actorOwnerId = actorSnapshot?.ownerId ?? null;
  const actorEpoch = actorSnapshot?.authEpoch ?? null;
  const actor = useMemo(
    () => (actorOwnerId && actorEpoch ? { ownerId: actorOwnerId, authEpoch: actorEpoch } : null),
    [actorOwnerId, actorEpoch],
  );
  const listOptions = vetVisitsForActor(actor, petId);
  const visits = useQuery({
    ...listOptions,
    refetchInterval: (query) =>
      query.state.data?.kind === "ready" &&
      query.state.data.data.some((visit) =>
        visit.attachments.some((file) => file.previewProcessing),
      )
        ? 5_000
        : false,
  });
  const [focusProof, setFocusProof] = useState<string | null>(null);
  const refetchVisits = visits.refetch;
  const proofKey = actor ? `${actor.ownerId}:${actor.authEpoch}:${petId}` : null;
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setFocusProof(null);
      if (actor && sameVetActor(actor) && listOptions.enabled)
        void refetchVisits().then((result) => {
          if (mounted && sameVetActor(actor) && result.data)
            setFocusProof(`${actor.ownerId}:${actor.authEpoch}:${petId}`);
        });
      return () => {
        mounted = false;
        setFocusProof(null);
      };
    }, [actor, petId, refetchVisits, listOptions.enabled]),
  );
  const readReady =
    !!actor &&
    sameVetActor(actor) &&
    focusProof === proofKey &&
    !visits.isPending &&
    !visits.isFetching;
  const validatedHistory = readReady ? vetHistoryCacheForActor(visits.data, actor, petId) : null;
  const readStatus = validatedHistory?.kind ?? null;
  const listData = validatedHistory?.kind === "ready" ? validatedHistory.data : null;
  const pet = useQuery({
    queryKey: ["vet-pet-title", "owner", actor?.ownerId ?? null, actor?.authEpoch ?? null, petId],
    enabled: !!actor && sameVetActor(actor) && listOptions.enabled,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      if (!actor || !sameVetActor(actor)) return null;
      const result = await petsApi.getById(petId, () => sameVetActor(actor));
      if (
        !sameVetActor(actor) ||
        !result.success ||
        !result.data ||
        result.data.id !== petId ||
        result.data.ownerId !== actor.ownerId ||
        typeof result.data.name !== "string" ||
        !result.data.name.trim()
      ) return null;
      // Cache entries are untrusted: stamp GET provenance in the returned DTO.
      return {
        name: result.data.name,
        petId,
        ownerId: actor.ownerId,
        authEpoch: actor.authEpoch,
      };
    },
  });
  // Keep only the last source-verified title. A poisoned actor-keyed QueryCache
  // entry cannot replace the header with another owner's private pet name.
  const [confirmedPetTitle, setConfirmedPetTitle] = useState<{
    name: string;
    petId: string;
    ownerId: string;
    authEpoch: string;
  } | null>(null);
  useEffect(() => {
    const value = pet.data;
    if (
      !actor ||
      !sameVetActor(actor) ||
      pet.isFetching ||
      !value ||
      value.petId !== petId ||
      value.ownerId !== actor.ownerId ||
      value.authEpoch !== actor.authEpoch ||
      typeof value.name !== "string" ||
      !value.name.trim()
    ) return;
    setConfirmedPetTitle(value);
  }, [actor, pet.data, pet.isFetching, petId]);
  const safePetTitle =
    actor &&
    confirmedPetTitle?.ownerId === actor.ownerId &&
    confirmedPetTitle.authEpoch === actor.authEpoch &&
    confirmedPetTitle.petId === petId
      ? confirmedPetTitle.name
      : null;
  const [editing, setEditing] = useState<PetVetVisit | "new" | null>(null);
  const [draft, setDraft] = useState<PetVetVisitInput>(emptyVetVisit);
  const [files, setFiles] = useState<VetLocalFile[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const detailOptions = vetVisitDetailForActor(
    actor,
    petId,
    listData?.some((item) => item.id === expanded) ? expanded : null,
  );
  const detailQuery = useQuery({
    ...detailOptions,
    enabled: readReady && readStatus === "ready" && detailOptions.enabled,
  });
  const verifiedDetail = readReady
    ? vetDetailCacheForActor(detailQuery.data, actor, petId, expanded)
    : null;
  const detail =
    readReady &&
    !detailQuery.isFetching &&
    !detailQuery.isPending &&
    verifiedDetail?.kind === "ready"
      ? verifiedDetail.data
      : null;
  const [busy, setBusy] = useState(false);
  const [createUnknown, setCreateUnknown] = useState(false);
  const [vetErrors, setVetErrors] = useState<VetFieldErrors>({});
  // Immediate barrier for rapid two taps; no automatic replay after lost ACK.
  const createFlight = useRef(false);
  const createUnknownRef = useRef(false);
  const editFlight = useRef(false);
  const editUnknownRef = useRef(false);
  const deleteFlight = useRef(false);
  const deletePrompt = useRef(false);
  const deleteUnknownRef = useRef(false);
  const [deleteUnknown, setDeleteUnknown] = useState(false);
  const activeDetailRef = useRef<string | null>(null);
  activeDetailRef.current = detail?.id ?? null;
  const lifecycle = useRef(0);
  const mounted = useRef(true);
  const scope = useRef({ ownerId: actorOwnerId, epoch: actorEpoch, petId });
  scope.current = { ownerId: actorOwnerId, epoch: actorEpoch, petId };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
    };
  }, []);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  useEffect(() => {
    lifecycle.current += 1;
    createFlight.current = false;
    createUnknownRef.current = false;
    editFlight.current = false;
    editUnknownRef.current = false;
    deleteFlight.current = false;
    deletePrompt.current = false;
    deleteUnknownRef.current = false;
    setDeleteUnknown(false);
    setCreateUnknown(false);
    setVetErrors({});
    setBusy(false);
    setEditing(null);
    setDraft(emptyVetVisit());
    setFiles([]);
    setExpanded(null);
    setDay("");
    setError("");
  }, [actorOwnerId, actorEpoch, petId]);
  usePreventRemove(!!editing, ({ data }) => {
    if (busy) return;
    Alert.alert("Закрыть форму?", "Несохранённые изменения будут потеряны", [
      { text: "Продолжить заполнение", style: "cancel" },
      { text: "Закрыть", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => {
    if (error) {
      Keyboard.dismiss();
      scroll.current?.scrollTo({ y: 0, animated: true });
    }
  }, [error]);
  function confirmDelete(visit: PetVetVisit) {
    if (
      !actor ||
      !sameVetActor(actor) ||
      !readReady ||
      readStatus !== "ready" ||
      busy ||
      createFlight.current ||
      editFlight.current ||
      deleteFlight.current ||
      deletePrompt.current ||
      deleteUnknownRef.current ||
      createUnknownRef.current ||
      editUnknownRef.current ||
      activeDetailRef.current !== visit.id
    )
      return;
    if (visit.attachments.length) {
      setError("Удаление посещений с вложениями требует отдельной проверки.");
      return;
    }
    deletePrompt.current = true;
    const generation = lifecycle.current;
    const route = { ownerId: actor.ownerId, epoch: actor.authEpoch, petId };
    const live = () =>
      mounted.current &&
      lifecycle.current === generation &&
      scope.current.ownerId === route.ownerId &&
      scope.current.epoch === route.epoch &&
      scope.current.petId === route.petId &&
      sameVetActor(actor);
    const cancel = () => {
      if (live()) deletePrompt.current = false;
    };
    Alert.alert(
      "Удалить посещение?",
      "Удалить запись без вложений?",
      [
        { text: "Отмена", style: "cancel", onPress: cancel },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            if (
              !live() ||
              !deletePrompt.current ||
              deleteFlight.current ||
              deleteUnknownRef.current ||
              activeDetailRef.current !== visit.id ||
              !readReady ||
              readStatus !== "ready"
            )
              return;
            deletePrompt.current = false;
            deleteFlight.current = true;
            setBusy(true);
            setError("");
            void (async () => {
              try {
                const result = await deleteVetVisitAndReadback({
                  actor,
                  petId,
                  original: visit,
                  live,
                });
                if (!live()) return;
                if (result.kind === "confirmed") {
                  setExpanded(null);
                  setFocusProof(null);
                  void refetchVisits().then((response) => {
                    if (live() && response.data)
                      setFocusProof(`${actor.ownerId}:${actor.authEpoch}:${petId}`);
                  });
                } else if (result.kind === "unknown") {
                  deleteUnknownRef.current = true;
                  setDeleteUnknown(true);
                  setError(
                    "Результат удаления неизвестен. Повторное удаление заблокировано. Проверьте запись вручную.",
                  );
                } else if (result.kind === "blocked_attachments") {
                  setError("У записи появились вложения. Удаление заблокировано.");
                } else if (result.kind === "missing") {
                  setError("Запись недоступна. Обновите историю посещений.");
                }
              } finally {
                if (live()) {
                  deleteFlight.current = false;
                  setBusy(false);
                }
              }
            })();
          },
        },
      ],
      { cancelable: true, onDismiss: cancel },
    );
  }
  function edit(visit: PetVetVisit | "new") {
    if (
      !actor ||
      !sameVetActor(actor) ||
      createFlight.current ||
      createUnknownRef.current ||
      editFlight.current ||
      editUnknownRef.current ||
      deleteFlight.current ||
      deletePrompt.current ||
      deleteUnknownRef.current
    )
      return;
    const next = visit === "new" ? emptyVetVisit() : { ...visit };
    setDraft(next);
    setDay(next.visitedOn.split("-").reverse().join("."));
    setEditing(visit);
    setFiles([]);
    setError("");
    setVetErrors({});
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: true }));
  }
  async function save() {
    if (editing === "new") {
      if (
        createFlight.current ||
        createUnknownRef.current ||
        !actor ||
        !sameVetActor(actor) ||
        !readReady ||
        readStatus !== "ready"
      )
        return;
      if (files.length) {
        setError("Сначала уберите вложения: их сохранение требует отдельной проверки.");
        return;
      }
      createFlight.current = true;
      setBusy(true);
      setError("");
      setVetErrors({});
      const generation = lifecycle.current;
      const route = { ownerId: actor.ownerId, epoch: actor.authEpoch, petId };
      const live = () =>
        mounted.current &&
        lifecycle.current === generation &&
        scope.current.ownerId === route.ownerId &&
        scope.current.epoch === route.epoch &&
        scope.current.petId === route.petId;
      try {
        const result = await createVetVisitAndReadback({ actor, petId, day, draft, live });
        if (!live() || !sameVetActor(actor)) return;
        if (result.kind === "rejected") {
          setVetErrors(result.fieldErrors);
          setError(vetFieldErrorMessage(result.fieldErrors));
        } else if (result.kind === "invalid") {
          setError(
            result.field === "date"
              ? "Проверьте дату: формат ДД.ММ.ГГГГ, с 1900 года и не позже сегодня."
              : result.field === "specialty"
                ? "Укажите специальность врача (не более 200 символов)."
                : "Проверьте длину полей записи.",
          );
        } else if (result.kind === "confirmed") {
          setEditing(null);
          setFiles([]);
          setExpanded(result.visit.id);
          // Never put POST ACK into the private read-only query cache.
          // One fresh list GET updates the owner-scoped active query; do not
          // trigger a second request with invalidateQueries before refetch.
          setFocusProof(null);
          void refetchVisits().then((response) => {
            if (live() && sameVetActor(actor) && response.data)
              setFocusProof(`${actor.ownerId}:${actor.authEpoch}:${petId}`);
          });
        } else if (result.kind === "unknown") {
          createUnknownRef.current = true;
          setCreateUnknown(true);
          setError(
            "Результат сохранения неизвестен. Проверьте историю посещений; повторное создание заблокировано, чтобы не создать дубль.",
          );
        }
      } finally {
        if (live() && sameVetActor(actor)) {
          createFlight.current = false;
          setBusy(false);
        }
      }
      return;
    }
    if (editing) {
      if (
        editFlight.current ||
        editUnknownRef.current ||
        !actor ||
        !sameVetActor(actor) ||
        !readReady ||
        readStatus !== "ready"
      )
        return;
      if (files.length) {
        setError("Сначала уберите новые вложения: их загрузка требует отдельной проверки.");
        return;
      }
      editFlight.current = true;
      setBusy(true);
      setError("");
      setVetErrors({});
      const generation = lifecycle.current;
      const route = { ownerId: actor.ownerId, epoch: actor.authEpoch, petId };
      const original = editing;
      const live = () =>
        mounted.current &&
        lifecycle.current === generation &&
        scope.current.ownerId === route.ownerId &&
        scope.current.epoch === route.epoch &&
        scope.current.petId === route.petId;
      try {
        const result = await editVetVisitAndReadback({ actor, petId, original, day, draft, live });
        if (!live() || !sameVetActor(actor)) return;
        if (result.kind === "confirmed" || result.kind === "unchanged") {
          setEditing(null);
          setFiles([]);
          setExpanded(original.id);
          setFocusProof(null);
          void refetchVisits().then((response) => {
            if (live() && sameVetActor(actor) && response.data)
              setFocusProof(`${actor.ownerId}:${actor.authEpoch}:${petId}`);
          });
        } else if (result.kind === "rejected") {
          setVetErrors(result.fieldErrors);
          setError(vetFieldErrorMessage(result.fieldErrors));
        } else if (result.kind === "invalid") {
          setError(
            result.field === "date"
              ? "Проверьте дату посещения."
              : result.field === "specialty"
                ? "Проверьте специальность врача."
                : "Проверьте поля записи.",
          );
        } else if (result.kind === "missing") {
          setError("Запись больше недоступна. Обновите историю посещений.");
        } else if (result.kind === "unknown") {
          editUnknownRef.current = true;
          setCreateUnknown(true); // Disable action buttons until manual status verification.
          setError(
            "Результат изменения неизвестен. Проверьте запись в истории; повторное сохранение заблокировано.",
          );
        }
      } finally {
        if (live() && sameVetActor(actor)) {
          editFlight.current = false;
          setBusy(false);
        }
      }
      return;
    }
  }
  const attachments = editing && editing !== "new" ? editing.attachments : [];
  if (!petId)
    return (
      <TexturedSafeAreaView style={s.screen}>
        <Text>Питомец не найден</Text>
      </TexturedSafeAreaView>
    );
  return (
    <TexturedSafeAreaView style={s.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          // Keep the native back button and title, but let the shared sky
          // texture extend underneath the status bar and navigation header.
          headerTransparent: true,
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => null,
          title: "Посещения врача",
          headerBackButtonMenuEnabled: false,
        }}
      />
      <KeyboardAvoidingView
        style={s.grow}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.content,
            { paddingTop: topInset + (Platform.OS === "ios" ? 44 : 56) + 20 },
          ]}
        >
          <Text style={s.petName}>
            {readReady ? (safePetTitle ?? "Посещения врача") : "Посещения врача"}
          </Text>
          {error && readStatus === "ready" && (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
          {readReady && readStatus !== "ready" && (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={s.errorText}>
                {readStatus === "missing"
                  ? "Питомец или посещение не найдено"
                  : readStatus === "unauthorized" || readStatus === "stale"
                    ? "Доступ к медкарте не подтверждён. Войдите снова."
                    : "Не удалось загрузить историю посещений. Попробуйте ещё раз."}
              </Text>
              {readStatus === "unknown" && (
                <Button
                  label="Повторить"
                  variant="caramel"
                  onPress={() => {
                    setFocusProof(null);
                    void refetchVisits().then((result) => {
                      if (actor && sameVetActor(actor) && result.data)
                        setFocusProof(`${actor.ownerId}:${actor.authEpoch}:${petId}`);
                    });
                  }}
                />
              )}
            </View>
          )}
          {!actor || !sameVetActor(actor) ? (
            <View accessibilityRole="alert">
              <Text>Медкарта доступна только владельцу после входа.</Text>
            </View>
          ) : !readReady ? (
            <Loading message="Загрузка посещений…" />
          ) : readStatus !== "ready" ? null : editing ? (
            <View style={s.form}>
              <Text style={s.title}>
                {editing === "new" ? "Новое посещение" : "Редактирование посещения"}
              </Text>
              <Text style={s.label}>Дата посещения *</Text>
              <TextInput
                style={s.input}
                value={day}
                editable={!busy}
                keyboardType="numbers-and-punctuation"
                placeholder="ДД.ММ.ГГГГ"
                placeholderTextColor="#706b60"
                maxLength={10}
                accessibilityLabel="Дата посещения, ДД.ММ.ГГГГ"
                onChangeText={(value) => {
                  setDay(value);
                  setVetErrors({});
                }}
              />
              {vetErrors.visitedOn && <Text style={s.errorText}>Проверьте дату посещения.</Text>}
              {vetErrors.body && <Text style={s.errorText}>Проверьте данные записи.</Text>}
              {fields.map(([field, label, maxLength]) => (
                <View key={field}>
                  <Text style={s.label}>
                    {label}
                    {field === "specialty" ? " *" : ""}
                  </Text>
                  {field !== "specialty" && <Text style={s.optional}>Необязательно</Text>}
                  <TextInput
                    accessibilityLabel={label}
                    style={[s.input, maxLength > 300 && s.multiline]}
                    editable={!busy}
                    value={draft[field]}
                    maxLength={maxLength}
                    multiline={maxLength > 300}
                    textAlignVertical={maxLength > 300 ? "top" : "center"}
                    onChangeText={(value) => {
                      setDraft({ ...draft, [field]: value });
                      setVetErrors({});
                    }}
                  />
                  {vetErrors[field] && (
                    <Text style={s.errorText}>
                      {field === "specialty"
                        ? "Проверьте специальность врача."
                        : "Проверьте значение или длину поля."}
                    </Text>
                  )}
                </View>
              ))}
              <Text style={s.title}>Медкарты и фотографии</Text>
              <Text style={s.caption}>
                До 5 вложений, каждое до 10 МБ. JPEG, PNG, WebP или PDF.
              </Text>
              {attachments.map((a) => (
                <View key={a.id} style={s.fileRow}>
                  <Text style={s.fileText}>{a.name}</Text>
                  <Button
                    label="Удалить"
                    variant="outline"
                    fullWidth={false}
                    disabled={busy}
                    onPress={() => setError("Удаление вложений требует отдельной проверки.")}
                  />
                </View>
              ))}
              {files.map((file, index) => (
                <View key={`${file.uri}-${index}`} style={s.fileRow}>
                  <View style={s.grow}>
                    <Text style={s.fileText}>{file.name}</Text>
                    <Text style={s.caption}>Ещё не загружен</Text>
                  </View>
                  <Button
                    label="Убрать"
                    variant="caramel"
                    fullWidth={false}
                    disabled={busy}
                    onPress={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  />
                </View>
              ))}
              {attachments.length + files.length < 5 && (
                <View style={s.buttons}>
                  <Button
                    label="Выбрать фото"
                    variant="caramel"
                    disabled={busy}
                    onPress={() => setError("Загрузка вложений требует отдельной проверки.")}
                  />
                  <Button
                    label="Сфотографировать"
                    variant="caramel"
                    disabled={busy}
                    onPress={() => setError("Загрузка вложений требует отдельной проверки.")}
                  />
                  <Button
                    label="Выбрать PDF или файл"
                    variant="caramel"
                    disabled={busy}
                    onPress={() => setError("Загрузка вложений требует отдельной проверки.")}
                  />
                </View>
              )}
              <View style={s.buttons}>
                <Button
                  label={busy ? "Сохранение…" : "Сохранить"}
                  disabled={busy || createUnknown}
                  onPress={() => void save()}
                />
                <Button
                  label="Отмена"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    Alert.alert("Закрыть форму?", "Несохранённые изменения будут потеряны", [
                      { text: "Продолжить редактирование", style: "cancel" },
                      {
                        text: "Закрыть",
                        onPress: () => {
                          setEditing(null);
                          setFiles([]);
                          setError("");
                          if (actor && sameVetActor(actor)) void refetchVisits();
                        },
                      },
                    ])
                  }
                />
              </View>
            </View>
          ) : (
            <>
              <Button
                label="Добавить запись"
                icon="plus"
                onPress={() => edit("new")}
                disabled={busy || createUnknown}
              />
              {listData?.length === 0 && (
                <View style={s.empty}>
                  <MaterialCommunityIcons name="stethoscope" size={42} color={COLORS.primary} />
                  <Text style={s.title}>Здесь будет история посещений</Text>
                  <Text style={s.body}>
                    Сохраните дату приёма, заключение врача и медкарты, чтобы всё было под рукой.
                  </Text>
                </View>
              )}
              {listData?.map((visit) => (
                <View key={visit.id} style={s.visit}>
                  <Pressable
                    style={s.visitHeader}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: expanded === visit.id }}
                    onPress={() => {
                      if (actor && sameVetActor(actor))
                        setExpanded(expanded === visit.id ? null : visit.id);
                    }}
                  >
                    <View style={s.grow}>
                      <Text style={s.caption}>{vetVisitDateLabel(visit.visitedOn)}</Text>
                      <Text style={s.title}>{visit.specialty}</Text>
                      <Text style={s.caption}>
                        {[visit.doctorName, visit.clinic].filter(Boolean).join(" · ")}
                        {visit.attachments.length ? ` · Вложения: ${visit.attachments.length}` : ""}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={expanded === visit.id ? "chevron-up" : "chevron-down"}
                      size={24}
                      color={COLORS.primary}
                    />
                  </Pressable>
                  {expanded === visit.id && (
                    <View style={s.visitBody}>
                      {!detail && (detailQuery.isPending || detailQuery.isFetching) && (
                        <Loading message="Загрузка посещения…" />
                      )}
                      {!detail && !detailQuery.isPending && !detailQuery.isFetching && (
                        <View accessibilityRole="alert">
                          <Text>
                            {detailQuery.data?.kind === "missing"
                              ? "Посещение не найдено"
                              : "Не удалось подтвердить доступ к записи."}
                          </Text>
                          {detailQuery.data?.kind === "unknown" && (
                            <Button label="Повторить" onPress={() => void detailQuery.refetch()} />
                          )}
                        </View>
                      )}
                      {detail && (
                        <>
                          {fields
                            .filter(([field]) => detail[field])
                            .map(([field, label]) => (
                              <View key={field} style={s.detail}>
                                <Text style={s.caption}>{label}</Text>
                                <Text selectable style={s.body}>
                                  {detail[field]}
                                </Text>
                              </View>
                            ))}
                          {!!detail.attachments.length && (
                            <View style={s.buttons}>
                              <Text style={s.title}>Вложения · {detail.attachments.length}</Text>
                              {detail.attachments.map((a) => (
                                <Attachment
                                  key={a.id}
                                  petId={petId}
                                  visitId={detail.id}
                                  item={a}
                                  actor={actor}
                                />
                              ))}
                            </View>
                          )}
                          <View style={s.buttons}>
                            <Button
                              label="Редактировать"
                              variant="caramel"
                              disabled={busy}
                              onPress={() => {
                                if (actor && sameVetActor(actor)) edit(detail);
                              }}
                            />
                            <Button
                              label="Удалить запись"
                              variant="danger"
                              disabled={busy || deleteUnknown}
                              onPress={() => confirmDelete(detail)}
                            />
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </TexturedSafeAreaView>
  );
}

const s = StyleSheet.create({
  grow: { flex: 1 },
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 20, paddingBottom: 48, gap: 20 },
  petName: { fontFamily: FONTS.montserratBold, fontSize: 24, color: COLORS.text },
  shortcut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    backgroundColor: "#fffdf8",
    borderRadius: 16,
  },
  shortcutTitle: {
    fontFamily: FONTS.montserratBold,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 5,
  },
  caption: { color: "#595344", fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 19 },
  form: { padding: 18, backgroundColor: "#fffdf8", borderRadius: 16 },
  title: { fontFamily: FONTS.montserratBold, fontSize: 18, color: COLORS.text, marginVertical: 10 },
  label: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    color: COLORS.text,
    marginTop: 18,
    marginBottom: 8,
  },
  optional: { color: "#595344", fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#aaa187",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    fontFamily: FONTS.montserrat,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 48,
  },
  multiline: { minHeight: 110 },
  buttons: { gap: 12, marginTop: 22 },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  body: { fontFamily: FONTS.montserrat, fontSize: 14, lineHeight: 23, color: COLORS.text },
  error: { backgroundColor: "#fff1ee", padding: 16, borderRadius: 12, gap: 12 },
  errorText: { color: "#8b2719", fontSize: 14, lineHeight: 22 },
  visit: { backgroundColor: "#fffdf8", borderRadius: 16 },
  visitHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18 },
  visitBody: { paddingHorizontal: 18, paddingBottom: 18 },
  detail: { gap: 8, marginTop: 18 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#ded8c7",
  },
  fileText: { flex: 1, color: COLORS.text, fontSize: 13 },
  attachment: { gap: 10 },
  preview: { width: "100%", height: 200, backgroundColor: "#ece5d2", borderRadius: 10 },
  pdf: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ece5d2",
    borderRadius: 10,
  },
  fileName: { color: COLORS.text, fontSize: 13, marginTop: 8 },
  link: {
    color: COLORS.primary,
    fontSize: 13,
    paddingVertical: 10,
    textDecorationLine: "underline",
  },
  viewer: { flex: 1, backgroundColor: COLORS.background },
  viewerHeader: { padding: 16 },
  viewerImageWrap: { flexGrow: 1, justifyContent: "center" },
  fullImage: { width: "100%", height: 600 },
});
