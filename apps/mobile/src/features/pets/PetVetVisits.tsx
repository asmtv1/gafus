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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  emptyVetVisit,
  vetVisitDateLabel,
  VET_VISIT_MAX_ATTACHMENTS,
  VET_VISIT_MAX_FILE_BYTES,
  VET_VISIT_MIME_TYPES,
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

const fields = [
  ["specialty", "Специальность врача", 200],
  ["doctorName", "ФИО врача", 200],
  ["clinic", "Какая клиника", 300],
  ["diagnosis", "Какой был диагноз", 10_000],
  ["conclusion", "Какое было заключение", 10_000],
  ["notes", "Ваши заметки", 10_000],
] as const;
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось выполнить действие. Повторите попытку";
function confirm(title: string, text: string, work: () => void) {
  Alert.alert(title, text, [
    { text: "Отмена", style: "cancel" },
    { text: "Удалить", style: "destructive", onPress: work },
  ]);
}

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
}: {
  petId: string;
  visitId: string;
  item: PetVetAttachment;
}) {
  const ownerId = useAuthStore((state) => state.user?.id);
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const preview = useQuery({
    queryKey: ["vet-media", ownerId, petId, visitId, item.id],
    enabled: item.hasPreview,
    queryFn: () => api.media(petId, visitId, item.id, "preview"),
    staleTime: 50_000,
    gcTime: 0,
    retry: false,
  });
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      reportClientError(new Error("Vet attachment action failed"), {
        issueKey: "PetVetVisits",
        keys: { operation: "attachment" },
      });
      Alert.alert("Не удалось открыть вложение", message(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    const { url } = await api.media(petId, visitId, item.id, "download");
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
      const result = await FileSystem.downloadAsync(url, temp);
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
            const { url } = await api.media(petId, visitId, item.id, "original");
            if (item.mimeType === "application/pdf") await Linking.openURL(url);
            else {
              setFullFailed(false);
              setFull(url);
            }
          })
        }
      >
        {item.hasPreview && preview.data && !previewFailed ? (
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
      {(preview.error || previewFailed) && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPreviewFailed(false);
            setImageAttempt((value) => value + 1);
            void preview.refetch();
          }}
        >
          <Text style={s.link}>Повторить загрузку превью</Text>
        </Pressable>
      )}
      <Button
        label={busy ? "Загрузка…" : "Скачать оригинал"}
        variant="caramel"
        disabled={busy}
        onPress={() => void perform(download)}
      />
      <Modal visible={!!full} animationType="fade" onRequestClose={() => setFull(null)}>
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
                        setFull((await api.media(petId, visitId, item.id, "original")).url);
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
  const ownerId = useAuthStore((state) => state.user?.id);
  const client = useQueryClient();
  const key = ["pet-vet-visits", ownerId, petId];
  const visits = useQuery({
    queryKey: key,
    queryFn: () => api.list(petId),
    gcTime: 0,
    enabled: !!petId && !!ownerId,
    refetchInterval: (query) =>
      query.state.data?.some((visit) => visit.attachments.some((file) => file.previewProcessing))
        ? 5_000
        : false,
  });
  const pet = useQuery({
    queryKey: ["pet", petId],
    queryFn: async () => {
      const result = await petsApi.getById(petId);
      if (!result.success || !result.data) throw new Error(result.error ?? "Питомец не найден");
      return result.data;
    },
    enabled: !!petId,
  });
  const [editing, setEditing] = useState<PetVetVisit | "new" | null>(null);
  const [draft, setDraft] = useState<PetVetVisitInput>(emptyVetVisit);
  const [files, setFiles] = useState<VetLocalFile[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
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
  async function refresh() {
    const data = await api.list(petId);
    client.setQueryData(key, data);
    return data;
  }
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      reportClientError(new Error("Vet visit action failed"), {
        issueKey: "PetVetVisits",
        keys: { operation: "saveOrDelete" },
      });
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(visit: PetVetVisit | "new") {
    const next = visit === "new" ? emptyVetVisit() : { ...visit };
    setDraft(next);
    setDay(next.visitedOn.split("-").reverse().join("."));
    setEditing(visit);
    setFiles([]);
    setError("");
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: true }));
  }
  function append(selected: VetLocalFile[]) {
    const existing = editing && editing !== "new" ? editing.attachments.length : 0;
    if (existing + files.length + selected.length > VET_VISIT_MAX_ATTACHMENTS)
      throw new Error("На одно посещение можно добавить до 5 вложений");
    if (
      selected.some(
        (file) =>
          !file.size ||
          file.size > VET_VISIT_MAX_FILE_BYTES ||
          !VET_VISIT_MIME_TYPES.includes(file.type as (typeof VET_VISIT_MIME_TYPES)[number]),
      )
    )
      throw new Error("Выберите JPEG, PNG, WebP или PDF размером до 10 МБ каждый");
    setFiles((current) => [...current, ...selected]);
  }
  async function pick(camera: boolean) {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Нужен доступ к камере",
          "Разрешите доступ в настройках, чтобы сфотографировать медкарту",
          [
            { text: "Закрыть", style: "cancel" },
            { text: "Настройки", onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
    }
    const remaining =
      5 - files.length - (editing && editing !== "new" ? editing.attachments.length : 0);
    const result = camera
      ? await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: remaining,
          quality: 1,
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
    if (!result.canceled)
      append(
        await Promise.all(
          result.assets.map(async (asset) => {
            const info = await FileSystem.getInfoAsync(asset.uri);
            return {
              uri: asset.uri,
              name: asset.fileName ?? "Медкарта.jpg",
              type: asset.mimeType ?? "image/jpeg",
              size: asset.fileSize ?? (info.exists ? info.size : 0),
            };
          }),
        ),
      );
  }
  async function save() {
    const parts = day.split(".");
    const visitedOn = parts.length === 3 ? parts.reverse().join("-") : "";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) ||
      new Date(`${visitedOn}T00:00:00`).getTime() > Date.now()
    ) {
      setError("Укажите дату посещения в формате ДД.ММ.ГГГГ, не позднее сегодняшней");
      return;
    }
    if (!draft.specialty.trim()) {
      setError("Укажите специальность врача");
      return;
    }
    await perform(async () => {
      const visit = await api.save(
        petId,
        { ...draft, visitedOn },
        editing && editing !== "new" ? editing.id : undefined,
      );
      setEditing(visit);
      for (const file of files) {
        await api.upload(petId, visit.id, file);
        setFiles((current) => current.filter((item) => item !== file));
        const fresh = (await refresh()).find((item) => item.id === visit.id);
        if (fresh) setEditing(fresh);
      }
      await refresh();
      setEditing(null);
      setFiles([]);
      setExpanded(visit.id);
    });
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
          <Text style={s.petName}>{pet.data?.name ?? "Посещения врача"}</Text>
          {(error || visits.error) && (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={s.errorText}>{error || message(visits.error)}</Text>
              {visits.error && (
                <Button label="Повторить" variant="caramel" onPress={() => void visits.refetch()} />
              )}
            </View>
          )}
          {visits.isLoading ? (
            <Loading message="Загрузка посещений…" />
          ) : editing ? (
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
                onChangeText={setDay}
              />
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
                    onChangeText={(value) => setDraft({ ...draft, [field]: value })}
                  />
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
                    onPress={() =>
                      confirm(
                        "Удалить вложение?",
                        a.name,
                        () =>
                          void perform(async () => {
                            if (editing === "new") return;
                            await api.removeAttachment(petId, editing.id, a.id);
                            const data = await refresh();
                            setEditing(data.find((v) => v.id === editing.id) ?? null);
                          }),
                      )
                    }
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
                    onPress={() => void perform(() => pick(false))}
                  />
                  <Button
                    label="Сфотографировать"
                    variant="caramel"
                    disabled={busy}
                    onPress={() => void perform(() => pick(true))}
                  />
                  <Button
                    label="Выбрать PDF или файл"
                    variant="caramel"
                    disabled={busy}
                    onPress={() =>
                      void perform(async () => {
                        const result = await DocumentPicker.getDocumentAsync({
                          type: [...VET_VISIT_MIME_TYPES],
                          multiple: true,
                          copyToCacheDirectory: true,
                        });
                        if (!result.canceled)
                          append(
                            result.assets.map((a) => ({
                              uri: a.uri,
                              name: a.name,
                              type: a.mimeType ?? "application/octet-stream",
                              size: a.size ?? 0,
                            })),
                          );
                      })
                    }
                  />
                </View>
              )}
              <View style={s.buttons}>
                <Button
                  label={busy ? "Сохранение…" : "Сохранить"}
                  disabled={busy}
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
                          void perform(async () => {
                            await refresh();
                          });
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
                disabled={busy}
              />
              {!visits.data?.length && !visits.error && (
                <View style={s.empty}>
                  <MaterialCommunityIcons name="stethoscope" size={42} color={COLORS.primary} />
                  <Text style={s.title}>Здесь будет история посещений</Text>
                  <Text style={s.body}>
                    Сохраните дату приёма, заключение врача и медкарты, чтобы всё было под рукой.
                  </Text>
                </View>
              )}
              {visits.data?.map((visit) => (
                <View key={visit.id} style={s.visit}>
                  <Pressable
                    style={s.visitHeader}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: expanded === visit.id }}
                    onPress={() => setExpanded(expanded === visit.id ? null : visit.id)}
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
                      {fields
                        .filter(([field]) => visit[field])
                        .map(([field, label]) => (
                          <View key={field} style={s.detail}>
                            <Text style={s.caption}>{label}</Text>
                            <Text selectable style={s.body}>
                              {visit[field]}
                            </Text>
                          </View>
                        ))}
                      {!!visit.attachments.length && (
                        <View style={s.buttons}>
                          <Text style={s.title}>Вложения · {visit.attachments.length}</Text>
                          {visit.attachments.map((a) => (
                            <Attachment key={a.id} petId={petId} visitId={visit.id} item={a} />
                          ))}
                        </View>
                      )}
                      <View style={s.buttons}>
                        <Button
                          label="Редактировать"
                          variant="caramel"
                          disabled={busy}
                          onPress={() => edit(visit)}
                        />
                        <Button
                          label="Удалить запись"
                          variant="danger"
                          disabled={busy}
                          onPress={() =>
                            confirm(
                              "Удалить посещение?",
                              "Запись и все её вложения будут удалены",
                              () =>
                                void perform(async () => {
                                  await api.remove(petId, visit.id);
                                  await refresh();
                                }),
                            )
                          }
                        />
                      </View>
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
