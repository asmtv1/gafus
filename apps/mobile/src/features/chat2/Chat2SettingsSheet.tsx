import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { reportClientError } from "@/shared/lib/tracer";
import { SwipeDismissHandle } from "@/shared/components/gestures/SwipeDismissHandle";
import * as ImagePicker from "expo-image-picker";
import { chat2, type ChatUser, type Conversation, type Member } from "./api";
import { Chat2ReportQueue } from "./Chat2ReportQueue";

const olive = "#738651",
  line = "#e3e9dc",
  muted = "#788471";
/** Private chat settings: all permission decisions are enforced by Hono, not by this sheet. */
export function Chat2SettingsSheet({
  open,
  onClose,
  id,
  room,
  owner,
  onRefresh,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  room: Conversation;
  owner: string;
  onRefresh: () => Promise<void>;
  onLeave: () => void;
}) {
  const [name, setName] = useState(room.name ?? ""),
    [description, setDescription] = useState(room.description ?? "");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">(
    room.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
  );
  const [showReports, setShowReports] = useState(false);
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [people, setPeople] = useState<ChatUser[]>([]);
  const group = ["GROUP", "CITY", "BREED", "COURSE_TOPIC"].includes(room.kind);
  const unsavedSettings = editing && (
    name !== (room.name ?? "") || description !== (room.description ?? "") ||
    visibility !== (room.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE"));
  async function pickGroupAvatar() {
    if (busy) return;
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], quality: 0.85, allowsMultipleSelection: false,
      });
      if (selection.canceled) return;
      const selected = selection.assets[0];
      if (!selected) return;
      await act(() => chat2.setAvatar(id, {
        uri: selected.uri, name: selected.fileName ?? "group-avatar.jpg",
        mime: selected.mimeType ?? "image/jpeg", size: selected.fileSize ?? 0,
      }));
    } catch (e) {
      reportClientError(new Error("CHAT2_AVATAR_PICK_FAILED"), {
        issueKey: "Chat2Settings", keys: { operation: "pickAvatar" },
      });
      setError(e instanceof Error ? e.message : "Не удалось выбрать аватарку");
    }
  }
  const moderator = room.role === "OWNER" || room.role === "ADMIN";
  useEffect(() => {
    if (!open || !moderator || query.trim().length < 2) {
      setPeople([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void chat2
        .users(query.trim())
        .then((rows) => {
          if (live) setPeople(rows.filter((x) => !room.members.some((m) => m.userId === x.id)));
        })
        .catch(() => {
          if (live) setPeople([]);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, moderator, query, room.members]);
  async function act(run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run();
      await onRefresh();
      setQuery("");
    } catch (e) {
      reportClientError(new Error("CHAT2_SETTINGS_FAILED"), {
        issueKey: "Chat2Settings",
        keys: { operation: "action" },
      });
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  }
  function confirmMember(
    member: Member,
    action: "BAN" | "KICK" | "PROMOTE" | "DEMOTE" | "TRANSFER",
  ) {
    const verb = {
      BAN: "Заблокировать",
      KICK: "Исключить",
      PROMOTE: "Назначить администратором",
      DEMOTE: "Убрать права администратора",
      TRANSFER: "Передать владение",
    }[action];
    Alert.alert(`${verb} ${member.username}?`, "", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Подтвердить",
        style: action === "BAN" || action === "KICK" ? "destructive" : "default",
        onPress: () =>
          void act(() =>
            action === "TRANSFER"
              ? chat2.transfer(id, member.userId)
              : chat2.moderate(id, member.userId, action),
          ),
      },
    ]);
  }
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={style.overlay}>
        <View style={style.sheet}>
          <SwipeDismissHandle close={onClose} disabled={busy || unsavedSettings} />
          <View style={style.header}>
            <Text style={style.title}>Настройки чата</Text>
            <Pressable accessibilityLabel="Закрыть настройки" onPress={onClose}>
              <Text style={style.close}>×</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={style.scroll}>
            <Text style={style.roomTitle}>{room.name || "Переписка"}</Text>
            {group && <View style={{ alignItems: "center", gap: 9, marginVertical: 12 }}>
              {room.avatarUrl
                ? <Image source={{ uri: room.avatarUrl }} style={{ width: 90, height: 90, borderRadius: 45 }} />
                : <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: line, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 32 }}>👥</Text></View>}
              {moderator && <>
                <Pressable accessibilityLabel="Выбрать аватарку группы" disabled={busy} onPress={() => void pickGroupAvatar()} style={style.button}>
                  <Text style={style.action}>{room.avatarUrl ? "Заменить аватарку" : "Установить аватарку"}</Text>
                </Pressable>
                {room.avatarUrl && <Pressable disabled={busy} style={style.button}
                  onPress={() => Alert.alert("Удалить аватарку группы?", "", [
                    { text: "Отмена", style: "cancel" },
                    { text: "Удалить", style: "destructive", onPress: () => void act(() => chat2.removeAvatar(id)) },
                  ])}>
                  <Text style={{ color: "#b44137" }}>Удалить аватарку</Text>
                </Pressable>}
              </>}
            </View>}
            {!!room.description && <Text style={style.description}>{room.description}</Text>}
            {!!error && (
              <Text style={style.error} accessibilityRole="alert">
                {error}
              </Text>
            )}
            <Pressable
              style={style.button}
              disabled={busy}
              onPress={() => void act(() => chat2.mute(id, !room.muted))}
            >
              <Text style={style.action}>
                {room.muted ? "Включить уведомления" : "Отключить уведомления"}
              </Text>
            </Pressable>
            {room.kind !== "DIRECT" && room.kind !== "CYNOLOGIST" && room.role !== "OWNER" && (
              <Pressable
                style={style.button}
                onPress={() =>
                  Alert.alert("Покинуть чат?", "", [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Выйти",
                      style: "destructive",
                      onPress: () =>
                        void act(async () => {
                          await chat2.leave(id);
                          onLeave();
                        }),
                    },
                  ])
                }
                disabled={busy}
              >
                <Text style={style.action}>Выйти из чата</Text>
              </Pressable>
            )}
            {moderator && ["GROUP", "CITY", "BREED", "COMMUNITY", "COURSE"].includes(room.kind) && (
              <>
                <Pressable style={style.button} onPress={() => setShowReports((value) => !value)}>
                  <Text style={style.action}>
                    {showReports ? "Скрыть жалобы" : "Жалобы участников"}
                  </Text>
                </Pressable>
                <Chat2ReportQueue id={id} open={open && showReports} />
              </>
            )}
            {group && moderator && (
              <>
                <Pressable style={style.button} onPress={() => setEditing(!editing)}>
                  <Text style={style.action}>
                    {editing ? "Скрыть редактирование" : "Изменить название и описание"}
                  </Text>
                </Pressable>
                {editing && (
                  <View style={style.form}>
                    <Text style={style.label}>Название</Text>
                    <TextInput
                      style={style.input}
                      value={name}
                      onChangeText={setName}
                      maxLength={120}
                    />
                    <Text style={style.label}>Описание</Text>
                    <TextInput
                      style={[style.input, style.multiline]}
                      multiline
                      value={description}
                      onChangeText={setDescription}
                      maxLength={2000}
                    />
                    <Text style={style.label}>Доступ</Text>
                    <View style={style.row}>
                      {(
                        [
                          ["PUBLIC", "Открытый"],
                          ["PRIVATE", "По приглашению"],
                        ] as const
                      ).map(([key, title]) => (
                        <Pressable
                          key={key}
                          style={[style.chip, visibility === key && style.activeChip]}
                          onPress={() => setVisibility(key)}
                        >
                          <Text style={style.action}>{title}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable
                      style={[style.primary, (!name.trim() || busy) && style.disabled]}
                      disabled={name.trim().length < 2 || busy}
                      onPress={() =>
                        void act(() =>
                          chat2.updateGroup(id, {
                            name: name.trim(),
                            description: description.trim(),
                            visibility,
                          }),
                        )
                      }
                    >
                      <Text style={style.primaryText}>Сохранить настройки</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
            <Text style={style.heading}>Участники · {room.members.length}</Text>
            {room.members.map((member) => (
              <View key={member.userId} style={style.member}>
                <Text style={style.memberName}>
                  👤 {member.username}
                  {member.userId === owner ? " (вы)" : ""}
                </Text>
                <Text style={style.memberRole}>
                  {member.role === "OWNER"
                    ? "Владелец"
                    : member.role === "ADMIN"
                      ? "Администратор"
                      : "Участник"}
                </Text>
                {group && moderator && member.userId !== owner && member.role !== "OWNER" && (
                  <View style={style.row}>
                    {room.role === "OWNER" && member.role === "MEMBER" && (
                      <Pressable onPress={() => confirmMember(member, "PROMOTE")} disabled={busy}>
                        <Text style={style.smallAction}>Сделать админом</Text>
                      </Pressable>
                    )}
                    {room.role === "OWNER" && member.role === "ADMIN" && (
                      <Pressable onPress={() => confirmMember(member, "DEMOTE")} disabled={busy}>
                        <Text style={style.smallAction}>Снять админа</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => confirmMember(member, "KICK")} disabled={busy}>
                      <Text style={style.smallAction}>Исключить</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmMember(member, "BAN")} disabled={busy}>
                      <Text style={style.destructive}>Заблокировать</Text>
                    </Pressable>
                    {room.role === "OWNER" && (
                      <Pressable onPress={() => confirmMember(member, "TRANSFER")} disabled={busy}>
                        <Text style={style.smallAction}>Передать группу</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))}
            {group && moderator && (
              <View style={style.form}>
                <Text style={style.heading}>Добавить участника</Text>
                <TextInput
                  style={style.input}
                  placeholder="Найти пользователя"
                  value={query}
                  onChangeText={setQuery}
                />
                {people.map((user) => (
                  <Pressable
                    key={user.id}
                    style={style.button}
                    disabled={busy}
                    onPress={() => void act(() => chat2.invite(id, user.id))}
                  >
                    <Text style={style.action}>＋ {user.username}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const style = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0006" },
  sheet: {
    backgroundColor: "#fffdf8",
    maxHeight: "87%",
    borderTopLeftRadius: 21,
    borderTopRightRadius: 21,
    paddingTop: 12,
  },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 19, paddingVertical: 8 },
  title: { fontSize: 19, fontWeight: "700", color: "#39462e", flex: 1 },
  close: { fontSize: 27, color: olive, paddingHorizontal: 9 },
  scroll: { paddingHorizontal: 18, paddingBottom: 45 },
  roomTitle: { fontSize: 17, fontWeight: "700", color: "#414d36", marginBottom: 4 },
  description: { color: muted, fontSize: 12, marginBottom: 12 },
  heading: { fontSize: 16, color: "#3e4d33", fontWeight: "700", marginTop: 19, marginBottom: 10 },
  button: {
    borderWidth: 1,
    borderColor: line,
    backgroundColor: "#f5f8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginVertical: 5,
  },
  action: { fontSize: 13, color: olive, fontWeight: "600" },
  form: { gap: 7, marginTop: 10 },
  label: { fontSize: 12, color: muted },
  input: {
    borderColor: line,
    borderWidth: 1,
    borderRadius: 11,
    backgroundColor: "white",
    padding: 12,
  },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  chip: { borderColor: line, borderWidth: 1, padding: 8, borderRadius: 10 },
  activeChip: { backgroundColor: "#e6ebda", borderColor: olive },
  member: { borderBottomColor: line, borderBottomWidth: 1, paddingVertical: 11, gap: 5 },
  memberName: { fontSize: 14, fontWeight: "600", color: "#44533b" },
  memberRole: { color: muted, fontSize: 11 },
  smallAction: { color: olive, fontSize: 11, paddingVertical: 6 },
  destructive: { color: "#ac4a36", fontSize: 11, paddingVertical: 6 },
  primary: { borderRadius: 12, backgroundColor: olive, padding: 13, alignItems: "center" },
  primaryText: { color: "white", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: "#a8443a", padding: 9 },
});
