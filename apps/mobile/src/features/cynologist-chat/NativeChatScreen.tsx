import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Chat, Channel, MessageList, OverlayProvider, useCreateChatClient } from "stream-chat-expo";
import type { CynologistChatSessionDto, CynologistChatStateDto } from "@gafus/consultation-shared";
import {
  cynologistIntakeSchema,
  INTAKE_FIELDS,
  CHAT_REPLY_COPY,
  CHAT_HOURS_COPY,
} from "@gafus/consultation-shared";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Button } from "@/shared/components/ui/Button";
import { Loading } from "@/shared/components/ui/Loading";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { chatApi, uploadChatFile } from "@/shared/lib/api/cynologistChat";

export function Connected({
  state,
  session,
  refresh,
  chatId,
  community = false,
}: {
  state: Pick<CynologistChatStateDto, "canSend">;
  session: CynologistChatSessionDto;
  refresh: () => Promise<void>;
  chatId?: string;
  community?: boolean;
}) {
  const userData = useMemo(() => ({ id: session.userId }), [session.userId]);
  const tokenOrProvider = useCallback(
    async () =>
      (await chatApi<CynologistChatSessionDto>("session", { method: "POST", chatId, community }))
        .token,
    [chatId, community],
  );
  const client = useCreateChatClient({ apiKey: session.apiKey, userData, tokenOrProvider });
  const channel = useMemo(
    () => client?.channel(session.channelType, session.channelId),
    [client, session.channelType, session.channelId],
  );
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [retry, setRetry] = useState(false);
  const router = useRouter();
  async function send() {
    setBusy(true);
    setError("");
    try {
      await chatApi("messages", {
        method: "POST",
        chatId,
        community,
        body: { clientMessageId: requestId, text, attachmentIds: files.map((f) => f.id) },
      });
      setText("");
      setFiles([]);
      setRequestId(Crypto.randomUUID());
      setRetry(false);
    } catch (e) {
      setError((e as Error).message);
      setRetry(true);
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  async function pick() {
    setBusy(true);
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        videoMaxDuration: 120,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1920x1080,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const video = asset.type === "video";
      if ((asset.fileSize ?? 0) > (video ? 100 : 10) * 1024 * 1024)
        throw new Error(video ? "Видео должно быть до 100 МБ" : "Фото должно быть до 10 МБ");
      const uri = video
        ? asset.uri
        : (await manipulateAsync(asset.uri, [], { compress: 0.9, format: SaveFormat.JPEG })).uri;
      const uploaded = await uploadChatFile(
        {
          uri,
          name: video ? (asset.fileName ?? "video.mp4") : "photo.jpg",
          mime: video ? (asset.mimeType ?? "video/mp4") : "image/jpeg",
        },
        chatId,
        community,
      );
      setFiles((old) => [...old, uploaded]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!client || !channel) return <Loading message="Загрузка сообщений…" fullScreen embedded />;
  return (
    <OverlayProvider>
      <Chat
        client={client}
        style={{
          semantics: { accentPrimary: COLORS.primary, borderUtilityActive: COLORS.primary },
        }}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Channel
            channel={channel}
            markReadOnMount={!community}
            doMarkReadRequest={community ? () => undefined : undefined}
            enableSwipeToReply={false}
            hasFilePicker={false}
            audioRecordingEnabled={false}
            messageActions={() => []}
          >
            <View style={styles.flex}>
              <MessageList />
            </View>
          </Channel>
          {state.canSend ? (
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                accessibilityLabel="Сообщение"
                placeholder="Напишите сообщение"
                multiline
                maxLength={5000}
                value={text}
                onChangeText={(value) => {
                  setText(value);
                  void channel?.keystroke().catch(() => undefined);
                }}
                editable={!busy && !retry}
              />
              {files.map((f) => (
                <Text key={f.id}>{f.name}</Text>
              ))}
              <Button
                label={busy ? "Подождите…" : "Фото или видео"}
                variant="outline"
                disabled={busy || retry || files.length >= 5}
                onPress={() => void pick()}
              />
              <Text style={styles.caption}>Фото до 10 МБ · видео H.264 до 100 МБ и двух минут</Text>
              <Button
                label={retry ? "Повторить отправку" : "Отправить"}
                disabled={busy || (!text.trim() && !files.length)}
                onPress={() => void send()}
              />
            </View>
          ) : (
            <View style={styles.composer}>
              <Text>
                {community
                  ? "Общий чат временно недоступен."
                  : "История доступна. Для отправки сообщений продлите тариф."}
              </Text>
              <Button
                label="Открыть профиль"
                onPress={() => router.push("/(main)/(tabs)/profile" as Href)}
                style={community ? { display: "none" } : undefined}
              />
            </View>
          )}
          {error && <Text accessibilityRole="alert">{error}</Text>}
        </KeyboardAvoidingView>
      </Chat>
    </OverlayProvider>
  );
}
export default function ChatScreen({
  chatId,
  insideHub = false,
}: {
  chatId?: string;
  insideHub?: boolean;
}) {
  const accountId = useAuthStore((s) => s.user?.id);
  const [state, setState] = useState<CynologistChatStateDto | null>(null);
  const [session, setSession] = useState<CynologistChatSessionDto | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [intake, setIntake] = useState<Record<string, string>>({ petGender: "" });
  const router = useRouter();
  const refresh = useCallback(async () => {
    setState(await chatApi<CynologistChatStateDto>("", { chatId }));
  }, [chatId]);
  useEffect(() => {
    let alive = true;
    setState(null);
    setSession(null);
    setIntake({ petGender: "" });
    setError("");
    if (accountId)
      chatApi<CynologistChatStateDto>("", { chatId })
        .then(async (next) => {
          if (!alive) return;
          setState(next);
          if (next.chat?.provisionStatus === "READY") {
            const token = await chatApi<CynologistChatSessionDto>("session", {
              method: "POST",
              chatId,
            });
            if (alive) setSession(token);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [accountId, chatId]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh().catch(() => undefined);
    });
    return () => sub.remove();
  }, [refresh]);
  async function start() {
    const result = cynologistIntakeSchema.safeParse(state?.chat?.intake ?? intake);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setState(await chatApi("start", { method: "POST", body: result.data }));
      setSession(await chatApi("session", { method: "POST", chatId }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!state && !error)
    return <Loading message="Загрузка сообщений…" fullScreen embedded={insideHub} />;
  return (
    <TexturedSafeAreaView style={styles.flex} edges={insideHub ? ["bottom"] : ["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Чат с кинологом</Text>
        <Text>{CHAT_REPLY_COPY}</Text>
        <Text style={styles.caption}>{CHAT_HOURS_COPY}</Text>
      </View>
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {state && !state.chat && !state.canUseCynologistChat && (
        <View style={styles.header}>
          <Text>Чат входит в месячный и трёхмесячный тариф.</Text>
          <Button
            label="Выбрать тариф"
            onPress={() => router.push("/(main)/(tabs)/profile" as Href)}
          />
        </View>
      )}
      {state && !state.enabled && <Text>Новые сообщения временно недоступны.</Text>}
      {state &&
        state.enabled &&
        state.canUseCynologistChat &&
        (!state.chat || state.chat.provisionStatus !== "READY") && (
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text>Заполните анкету один раз. Она станет первым сообщением кинологу.</Text>
            {!state.chat &&
              INTAKE_FIELDS.map(([key, label, max]) => (
                <View key={key}>
                  <Text>{label}</Text>
                  {key === "petGender" ? (
                    <View style={styles.gender}>
                      <Button
                        label="Мальчик"
                        fullWidth={false}
                        variant={intake[key] === "MALE" ? "primary" : "outline"}
                        onPress={() => setIntake({ ...intake, [key]: "MALE" })}
                      />
                      <Button
                        label="Девочка"
                        fullWidth={false}
                        variant={intake[key] === "FEMALE" ? "primary" : "outline"}
                        onPress={() => setIntake({ ...intake, [key]: "FEMALE" })}
                      />
                    </View>
                  ) : (
                    <TextInput
                      style={styles.input}
                      accessibilityLabel={label}
                      maxLength={max}
                      value={intake[key] ?? ""}
                      keyboardType={key === "clientPhone" ? "phone-pad" : "default"}
                      multiline={max >= 1000}
                      onChangeText={(value) => setIntake({ ...intake, [key]: value })}
                    />
                  )}
                </View>
              ))}
            <Button
              label={state.chat ? "Продолжить создание" : "Начать переписку"}
              disabled={busy}
              onPress={() => void start()}
            />
          </ScrollView>
        )}
      {state && session && accountId && session.userId === `gafus-${accountId}` && (
        <Connected
          key={`${accountId}/${session.userId}`}
          state={state}
          session={session}
          refresh={refresh}
          chatId={chatId}
        />
      )}
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: 16, gap: 6 },
  title: { fontFamily: FONTS.montserrat, color: COLORS.primary, fontSize: 24, fontWeight: "700" },
  caption: { fontSize: 12, color: COLORS.textSecondary },
  form: { padding: 16, gap: 18 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fffdf7",
    minHeight: 48,
  },
  composer: { padding: 12, gap: 6 },
  gender: { flexDirection: "row", gap: 12, marginTop: 8 },
  error: { padding: 16, color: "#a32424" },
});
