import { ChatQuotedReply } from "./ChatQuotedReply";
import { useRouter } from "expo-router";
import { ChatMessageTimestamp } from "./ChatMessageTimestamp";
import { ChatMessageActionList } from "./ChatMessageActionList";
import { openAppSubscriptionPaywall } from "@/features/app-subscription";
import {
  ChatReactionContext,
  ChatReactionPicker,
  ChatReactionList,
  ChatReactionUsers,
  supportedChatReactions,
} from "./ChatReactions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/shared/lib/api/user";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  Chat,
  Channel,
  MessageList,
  WithComponents,
  MessageHeader,
  MessageAuthor,
  useMessageContext,
  useCreateChatClient,
} from "stream-chat-expo";
import type { CynologistChatSessionDto, CynologistChatStateDto } from "@gafus/consultation-shared";
import {
  cynologistIntakeSchema,
  INTAKE_FIELDS,
  CHAT_ROLE_LABELS,
  CHAT_REPLY_COPY,
  CHAT_HOURS_COPY,
} from "@gafus/consultation-shared";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Button } from "@/shared/components/ui/Button";
import { Loading } from "@/shared/components/ui/Loading";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { chatApi, uploadChatFile } from "@/shared/lib/api/cynologistChat";

function useChatAuthorProfile(username?: string) {
  return useQuery({
    queryKey: ["chat-public-profile", username],
    enabled: !!username,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const result = await userApi.getPublicProfile(username!);
      if (!result.success) throw new Error(result.error ?? "Не удалось загрузить профиль");
      return result.data;
    },
  });
}
function GafusMessageAuthor(props: React.ComponentProps<typeof MessageAuthor>) {
  const router = useRouter();
  const { message: contextMessage } = useMessageContext();
  const message = props.message ?? contextMessage;
  const { data } = useChatAuthorProfile(message.user?.name);
  const image = message.user?.image || data?.profile?.avatarUrl || undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Открыть профиль ${message.user?.name ?? "пользователя"}`}
      disabled={!message.user?.name}
      onPress={() =>
        message.user?.name &&
        router.push({ pathname: "/profile/[username]", params: { username: message.user.name } })
      }
    >
      <MessageAuthor
        {...props}
        message={{ ...message, user: message.user ? { ...message.user, image } : undefined }}
      />
    </Pressable>
  );
}
function GafusMessageHeader() {
  const router = useRouter();
  const { message, alignment, groupStyles } = useMessageContext();
  const { data } = useChatAuthorProfile(message.user?.name);
  const role =
    data?.role === "ADMIN" ? "admin" : data?.role === "TRAINER" ? "trainer" : data?.chatRole;
  return (
    <View style={{ alignItems: alignment === "left" ? "flex-start" : "flex-end" }}>
      <MessageHeader />

      {message.type !== "deleted" &&
        message.user?.name &&
        (!groupStyles.length || groupStyles.includes("top") || groupStyles.includes("single")) && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
              justifyContent: alignment === "right" ? "flex-end" : "flex-start",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Открыть профиль ${message.user.name}`}
              hitSlop={8}
              onPress={() =>
                router.push({
                  pathname: "/profile/[username]",
                  params: { username: message.user!.name! },
                })
              }
            >
              <Text
                style={{ fontFamily: FONTS.montserratBold, fontSize: 12, color: COLORS.primary }}
              >
                {message.user.name}
              </Text>
            </Pressable>
            {!!role && (
              <Text
                style={{
                  fontFamily: FONTS.montserrat,
                  fontSize: 10,
                  color: COLORS.primary,
                  backgroundColor: "#eeeedf",
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}
              >
                {CHAT_ROLE_LABELS[role]}
              </Text>
            )}
          </View>
        )}
    </View>
  );
}

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
  const containerRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const messageInputRef = useRef<TextInput>(null);
  const [messageInputHeight, setMessageInputHeight] = useState(48);
  const [reply, setReply] = useState<{ id: string; text: string; name: string } | null>(null);
  function selectReply(message: {
    id: string;
    text?: string;
    user?: { name?: string } | null;
    type?: string;
  }) {
    if (!state.canSend || busy || retry || editingId || message.type === "deleted") return;
    requestAnimationFrame(() => messageInputRef.current?.focus());
    setReply({
      id: message.id,
      text: message.text || "Фото или видео",
      name: message.user?.name || "Пользователь",
    });
  }
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [retry, setRetry] = useState(false);
  async function send() {
    setBusy(true);
    setError("");
    try {
      if (editingId) {
        await chatApi("message-actions", {
          method: "POST",
          chatId,
          community,
          body: { action: "edit", messageId: editingId, text },
        });
        setEditingId(null);
        setText("");
        setRetry(false);
        return;
      }
      if (reply && channel?.getConfig()?.quotes !== true)
        throw new Error(
          "Ответы с цитатой пока недоступны: требуется обновление настроек чата. Ваш черновик сохранён.",
        );
      await chatApi("messages", {
        method: "POST",
        chatId,
        community,
        body: {
          clientMessageId: requestId,
          text,
          attachmentIds: files.map((f) => f.id),
          ...(reply ? { quotedMessageId: reply.id } : {}),
        },
      });
      setText("");
      setReply(null);
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
  async function removeMessage(messageId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await chatApi("message-actions", {
        method: "POST",
        chatId,
        community,
        body: { action: "delete", messageId },
      });
      if (editingId === messageId) {
        setEditingId(null);
        setText("");
        setRetry(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const reactionLock = useRef(false);
  const [reactionPending, setReactionPending] = useState(false);
  const lastMessageTap = useRef<{ id: string; time: number } | null>(null);
  async function changeReaction(messageId: string, type: string, remove: boolean) {
    if (!state.canSend || reactionLock.current) return;
    reactionLock.current = true;
    setReactionPending(true);
    try {
      await chatApi("reactions", {
        method: "POST",
        chatId,
        community,
        body: { messageId, type, action: remove ? "remove" : "set" },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      reactionLock.current = false;
      setReactionPending(false);
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
    <View
      ref={containerRef}
      style={styles.flex}
      onLayout={() => containerRef.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}
    >
      <WithComponents
        overrides={{
          MessageHeader: GafusMessageHeader,
          MessageTimestamp: ChatMessageTimestamp,
          MessageActionList: ChatMessageActionList,
          Reply: ChatQuotedReply,
          MessageReactionPicker: ChatReactionPicker,
          ReactionListBottom: ChatReactionList,
          MessageUserReactions: ChatReactionUsers,
          MessageAuthor: GafusMessageAuthor,
        }}
      >
        <ChatReactionContext.Provider
          value={{
            enabled: state.canSend,
            pending: reactionPending,
            change: (id, type, remove) => {
              void changeReaction(id, type, remove);
            },
          }}
        >
          <Chat
            client={client}
            style={{
              semantics: {
                accentPrimary: COLORS.primary,
                borderUtilityActive: COLORS.primary,
                backgroundCoreApp: "transparent",
                chatBgIncoming: "#1E2C3B",
                chatBgOutgoing: "#1E2C3B",
                chatTextIncoming: "#FFFFFF",
                chatTextOutgoing: "#FFFFFF",
                chatBgAttachmentIncoming: "#1E2C3B",
                chatBgAttachmentOutgoing: "#1E2C3B",
              },
              messageList: { container: { backgroundColor: "transparent" } },
            }}
          >
            <KeyboardAvoidingView
              style={styles.flex}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={keyboardOffset}
            >
              <Channel
                channel={channel}
                supportedReactions={supportedChatReactions}
                reactionListPosition="bottom"
                onPressMessage={({ message, emitter, defaultHandler }) => {
                  if (
                    emitter !== "messageContent" ||
                    !message ||
                    !state.canSend ||
                    message.type === "deleted" ||
                    message.type === "system"
                  ) {
                    defaultHandler?.();
                    return;
                  }
                  const now = Date.now();
                  const previous = lastMessageTap.current;
                  if (previous?.id === message.id && now - previous.time < 300) {
                    lastMessageTap.current = null;
                    void changeReaction(
                      message.id,
                      "like",
                      message.own_reactions?.some((reaction) => reaction.type === "like") ?? false,
                    );
                  } else {
                    lastMessageTap.current = { id: message.id, time: now };
                    defaultHandler?.();
                  }
                }}
                disableKeyboardCompatibleView
                markReadOnMount={!community}
                doMarkReadRequest={community ? () => undefined : undefined}
                enableSwipeToReply={state.canSend && !busy && !retry && !editingId}
                customMessageSwipeAction={({ message }) => selectReply(message)}
                hasFilePicker={false}
                audioRecordingEnabled={false}
                messageActions={({
                  message,
                  editMessage,
                  deleteMessage,
                  quotedReply,
                  dismissOverlay,
                }) => {
                  const replyActions =
                    state.canSend &&
                    !busy &&
                    !retry &&
                    !editingId &&
                    message.type !== "deleted" &&
                    message.type !== "system"
                      ? [
                          {
                            ...quotedReply,
                            title: "Ответить",
                            action: () => {
                              dismissOverlay();
                              selectReply(message);
                            },
                          },
                        ]
                      : [];
                  const age = Date.now() - new Date(message.created_at ?? "").getTime();
                  if (
                    busy ||
                    retry ||
                    message.user?.id !== session.userId ||
                    message.id.startsWith("intake-") ||
                    message.type === "deleted" ||
                    message.type === "system" ||
                    !Number.isFinite(age) ||
                    age < 0 ||
                    age >= 86400000
                  )
                    return replyActions;
                  return [
                    ...replyActions,
                    ...(age < 900000
                      ? [
                          {
                            ...editMessage,
                            title: "Редактировать",
                            action: () => {
                              dismissOverlay();
                              if (files.length || text.trim()) {
                                Alert.alert(
                                  "Черновик сообщения",
                                  "Отправьте или очистите черновик перед редактированием.",
                                );
                                return;
                              }
                              setReply(null);
                              setEditingId(message.id);
                              setText(message.text ?? "");
                            },
                          },
                        ]
                      : []),
                    {
                      ...deleteMessage,
                      title: "Удалить у всех",
                      action: () => {
                        dismissOverlay();
                        Alert.alert(
                          "Удалить сообщение?",
                          "Сообщение будет удалено у всех участников чата.",
                          [
                            { text: "Отмена", style: "cancel" },
                            {
                              text: "Удалить",
                              style: "destructive",
                              onPress: () => {
                                void removeMessage(message.id);
                              },
                            },
                          ],
                        );
                      },
                    },
                  ];
                }}
              >
                <View style={styles.flex}>
                  <View style={styles.flex}>
                    <MessageList />
                  </View>
                  {state.canSend || editingId ? (
                    <View style={styles.composer}>
                      {reply && (
                        <View style={styles.replyPreview}>
                          <MaterialCommunityIcons name="reply" size={24} color={COLORS.primary} />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{ color: COLORS.primary, fontFamily: FONTS.montserratBold }}
                              numberOfLines={1}
                            >
                              {reply.name}
                            </Text>
                            <Text style={styles.caption} numberOfLines={1}>
                              {reply.text}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Отменить ответ"
                            disabled={busy || retry}
                            onPress={() => setReply(null)}
                            hitSlop={10}
                          >
                            <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
                          </Pressable>
                        </View>
                      )}
                      {editingId && (
                        <View style={styles.composerRow}>
                          <Text style={{ flex: 1, color: COLORS.primary }}>
                            Редактирование сообщения
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Отменить редактирование"
                            disabled={busy}
                            onPress={() => {
                              setEditingId(null);
                              setText("");
                              setRetry(false);
                            }}
                          >
                            <MaterialCommunityIcons name="close" size={24} color={COLORS.primary} />
                          </Pressable>
                        </View>
                      )}
                      <View style={styles.composerRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Прикрепить фото или видео"
                          accessibilityHint="Фото до 10 МБ, видео до 100 МБ и двух минут"
                          accessibilityState={{
                            disabled: busy || retry || !!editingId || files.length >= 5,
                          }}
                          disabled={busy || retry || !!editingId || files.length >= 5}
                          onPress={() => void pick()}
                          style={({ pressed }) => [
                            styles.attachmentButton,
                            pressed && styles.attachmentPressed,
                            (busy || retry || !!editingId || files.length >= 5) &&
                              styles.attachmentDisabled,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name="paperclip"
                            size={26}
                            color={COLORS.primary}
                          />
                        </Pressable>
                        <TextInput
                          ref={messageInputRef}
                          style={[
                            styles.input,
                            styles.messageInput,
                            { height: text.length ? messageInputHeight : 48 },
                          ]}
                          accessibilityLabel="Сообщение"
                          placeholder="Напишите сообщение"
                          multiline
                          scrollEnabled={false}
                          onContentSizeChange={({ nativeEvent }) =>
                            setMessageInputHeight(
                              Math.max(48, Math.ceil(nativeEvent.contentSize.height)),
                            )
                          }
                          maxLength={5000}
                          value={text}
                          onChangeText={(value) => {
                            setText(value);
                            void channel?.keystroke().catch(() => undefined);
                          }}
                          editable={!busy && !retry}
                        />
                        {(text.trim().length > 0 || files.length > 0) && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              retry
                                ? "Повторить отправку"
                                : editingId
                                  ? "Сохранить изменения"
                                  : "Отправить сообщение"
                            }
                            accessibilityState={{ disabled: busy, busy }}
                            disabled={busy}
                            onPress={() => void send()}
                            style={({ pressed }) => [
                              styles.sendButton,
                              pressed && styles.attachmentPressed,
                              busy && styles.attachmentDisabled,
                            ]}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color={COLORS.primary} />
                            ) : (
                              <MaterialCommunityIcons
                                name={retry ? "reload" : editingId ? "check" : "send"}
                                size={25}
                                color={COLORS.primary}
                              />
                            )}
                          </Pressable>
                        )}
                      </View>
                      {files.map((f) => (
                        <Text key={f.id}>{f.name}</Text>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.composer}>
                      <Text>
                        {community
                          ? "Общий чат временно недоступен."
                          : "История доступна. Для отправки сообщений продлите тариф."}
                      </Text>
                      <Button
                        label="Выбрать тариф"
                        onPress={() =>
                          openAppSubscriptionPaywall({
                            reason: "required",
                            contentMode: "subscription",
                          })
                        }
                        style={community ? { display: "none" } : undefined}
                      />
                    </View>
                  )}
                  {error && <Text accessibilityRole="alert">{error}</Text>}
                </View>
              </Channel>
            </KeyboardAvoidingView>
          </Chat>
        </ChatReactionContext.Provider>
      </WithComponents>
    </View>
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
    <TexturedSafeAreaView
      style={styles.flex}
      edges={insideHub ? [] : ["top", "bottom"]}
      inheritBackground={insideHub}
    >
      {!insideHub && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(252,245,226,0.6)" }]}
        />
      )}
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
            onPress={() =>
              openAppSubscriptionPaywall({ reason: "required", contentMode: "subscription" })
            }
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
  replyPreview: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  composer: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16, gap: 6 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  messageInput: { flex: 1, textAlignVertical: "top" },
  attachmentButton: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  sendButton: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  attachmentPressed: { backgroundColor: COLORS.cardBackground },
  attachmentDisabled: { opacity: 0.4 },
  gender: { flexDirection: "row", gap: 12, marginTop: 8 },
  error: { padding: 16, color: "#a32424" },
});
