import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useAuthStore } from "@/shared/stores";
import { reportClientError } from "@/shared/lib/tracer";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Chat2StaffQueue } from "./Chat2StaffQueue";
import { Chat2ListNavigation } from "./Chat2ListNavigation";
import { Chat2Avatar } from "./Chat2Avatar";
import { chat2, nameFor, type Conversation, type ChatUser, type Group } from "./api";

const bg = "#fffdf8",
  olive = "#76884b",
  muted = "#879081",
  border = "#e6e9df";
const emojii = (kind: string) =>
  (
    ({
      DIRECT: "👤",
      CYNOLOGIST: "🐕",
      CITY: "🏙️",
      BREED: "🐶",
      COURSE: "🎓",
      GROUP: "👥",
      COURSE_TOPIC: "📚",
      COMMUNITY: "🐾",
    }) as Record<string, string>
  )[kind] ?? "🐾";
export default function Chat2ListScreen() {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (!owner || binding?.principalId !== owner || !binding.authEpoch)
    return <Text accessibilityRole="alert">Для доступа к чатам войдите в аккаунт.</Text>;
  // Per-auth-epoch React state: no stale conversation previews on account switches.
  return <Chat2ListOwned key={`${owner}:${binding.authEpoch}`} owner={owner} />;
}
function Chat2ListOwned({ owner }: { owner: string }) {
  const router = useRouter();
  const staff = ["ADMIN", "MODERATOR"].includes(useAuthStore.getState().user?.role ?? "");
  const [list, setList] = useState<Conversation[]>([]),
    [mode, setMode] = useState<
      "list" | "people" | "create" | "discover" | "courses" | "moderation"
    >("list");
  const [tab, setTab] = useState<"all" | "direct" | "group" | "unread">("all");
  const [search, setSearch] = useState(""),
    [people, setPeople] = useState<ChatUser[]>([]),
    [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [avatar, setAvatar] = useState<{ uri: string; name: string; mime: string; size: number } | null>(null);
  async function pickAvatar() {
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], quality: 0.85, allowsMultipleSelection: false,
      });
      if (selection.canceled) return;
      const chosen = selection.assets[0];
      if (!chosen) return;
      const asset = { uri: chosen.uri,
        name: chosen.fileName ?? "group-avatar.jpg",
        mime: chosen.mimeType ?? "image/jpeg", size: chosen.fileSize ?? 0 };
      if (!["image/jpeg", "image/png", "image/webp"].includes(asset.mime) ||
          asset.size < 10 || asset.size > 5 * 1024 * 1024)
        return setError("Аватарка: JPG, PNG или WebP до 5 МБ");
      setError(""); setAvatar(asset);
    } catch {
      reportClientError(new Error("CHAT2_AVATAR_PICK_FAILED"), {
        issueKey: "Chat2List", keys: { operation: "pickAvatar" },
      });
      setError("Не удалось выбрать фотографию");
    }
  }
  const [name, setName] = useState(""),
    [description, setDescription] = useState("");
  const [kind, setKind] = useState<"GROUP" | "CITY" | "BREED" | "COURSE_TOPIC">("GROUP"),
    [privateGroup, setPrivateGroup] = useState(false);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!owner) return;
    try {
      setList(await chat2.list());
      setError("");
    } catch (e) {
      reportClientError(new Error("CHAT2_REFRESH_FAILED"), {
        issueKey: "Chat2List",
        keys: { operation: "refresh" },
      });
      setError(e instanceof Error ? e.message : "Чаты недоступны");
    }
  }, [owner]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    if (!owner) return;
    let live = true;
    const t = setInterval(() => {
      if (live) void refresh();
    }, 15000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [owner, refresh]);
  useEffect(() => {
    if (mode !== "people" && mode !== "discover") return;
    if (mode === "people" && search.trim().length < 2) {
      setPeople([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      const action = mode === "people" ? chat2.users(search.trim()) : chat2.discover(search.trim());
      void action
        .then((result) => {
          if (!active) return;
          if (mode === "people") setPeople(result as ChatUser[]);
          else setGroups(result as Group[]);
        })
        .catch(() => {
          reportClientError(new Error("CHAT2_SEARCH_FAILED"), {
            issueKey: "Chat2List",
            keys: { operation: "search" },
          });
          if (active) setError("Не удалось найти результаты");
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode, search]);
  const open = (id: string) =>
    router.push({ pathname: "/(main)/chats/[id]", params: { id } } as Href);
  async function run(fn: () => Promise<{ conversationId: string }>) {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { conversationId } = await fn();
      await refresh();
      setMode("list");
      setSearch("");
      open(conversationId);
    } catch (e) {
      reportClientError(new Error("CHAT2_CREATE_FAILED"), {
        issueKey: "Chat2List",
        keys: { operation: "create" },
      });
      setError(e instanceof Error ? e.message : "Не удалось создать чат");
    } finally {
      setLoading(false);
    }
  }
  async function showCourses() {
    setMode("courses");
    setSearch("");
    setError("");
    setLoading(true);
    try {
      setCourses(await chat2.courseOptions());
    } catch (e) {
      reportClientError(new Error("CHAT2_COURSE_DISCOVERY_FAILED"), {
        issueKey: "Chat2List",
        keys: { operation: "course_discovery" },
      });
      setError(e instanceof Error ? e.message : "Курсы недоступны");
    } finally {
      setLoading(false);
    }
  }
  const visible = list.filter((c) => {
    if (tab === "direct" && !["DIRECT", "CYNOLOGIST"].includes(c.kind)) return false;
    if (tab === "group" && ["DIRECT", "CYNOLOGIST"].includes(c.kind)) return false;
    if (tab === "unread" && c.unreadCount === 0) return false;
    return `${nameFor(c, owner ?? "")} ${c.lastMessage?.text ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  return (
    <TexturedSafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.controls}>
      <View style={styles.header}>
        <Text style={styles.title}>Сообщения</Text>
        <TouchableOpacity
          style={styles.toolButton}
          accessibilityLabel="Новое сообщение"
          onPress={() => {
            setSearch("");
            setMode("people");
          }}
        >
          <Text style={styles.tool}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolButton}
          accessibilityLabel="Создать групповой чат"
          onPress={() => setMode("create")}
        >
          <Text style={styles.tool}>＋</Text>
        </TouchableOpacity>
      </View>
      {mode !== "create" && (
        <TextInput
          style={styles.search}
          placeholder={mode === "people" ? "Поиск пользователя" : "Поиск по чатам"}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          accessibilityLabel="Поиск"
        />
      )}
      {mode === "list" && (
        <View style={styles.tabs}>
          {(
            [
              ["all", "Все"],
              ["direct", "Личные"],
              ["group", "Группы"],
              ["unread", "Новые"],
            ] as const
          ).map(([key, title]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={[styles.tab, tab === key && styles.selectedTab]}
            >
              <Text style={[styles.tabText, tab === key && styles.selectedTabText]}>{title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {mode !== "list" && (
        <TouchableOpacity
          style={styles.back}
          onPress={() => {
            setMode("list");
            setError("");
            setSearch("");
          }}
        >
          <Text style={styles.backText}>← К перепискам</Text>
        </TouchableOpacity>
      )}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        contentContainerStyle={styles.content}
      >
        {mode === "list" && (
          <>
            <Text style={styles.conversationHeading} accessibilityRole="header">
              Переписки
            </Text>
            {visible.length === 0 && <Text style={styles.empty}>Здесь пока нет переписок.</Text>}
            {visible.map((c) => (
              <TouchableOpacity style={styles.row} onPress={() => open(c.id)} key={c.id}>
                <View style={styles.avatar}>
                  <Chat2Avatar room={c} ownerId={owner}>
                    <Text style={styles.emoji}>{emojii(c.kind)}</Text>
                  </Chat2Avatar>
                </View>
                <View style={styles.details}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {nameFor(c, owner ?? "")}
                  </Text>
                  <Text numberOfLines={1} style={styles.preview}>
                    {c.lastMessage?.text ?? "Начните разговор"}
                  </Text>
                </View>
                {c.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{c.unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            <Chat2ListNavigation
              onDiscover={() => {
                setMode("discover");
                setSearch("");
              }}
              onCynologist={() => void run(chat2.cynologist)}
              onCourses={() => void showCourses()}
              onModeration={staff ? () => setMode("moderation") : undefined}
              loading={loading}
            />
          </>
        )}
        {mode === "moderation" && staff && <Chat2StaffQueue open={mode === "moderation"} />}
        {mode === "people" && (
          <>
            <Text style={styles.section}>Новое личное сообщение</Text>
            {search.trim().length < 2 && (
              <Text style={styles.empty}>Введите минимум два символа для поиска.</Text>
            )}
            {people.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.row}
                onPress={() => void run(() => chat2.direct(u.id))}
                disabled={loading}
              >
                <View style={styles.avatar}>
                  <Text>👤</Text>
                </View>
                <Text style={styles.rowTitle}>{u.username}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        {mode === "courses" && (
          <>
            <Text style={styles.section}>Чаты ваших курсов</Text>
            {loading && <ActivityIndicator color={olive} />}
            {!loading && courses.length === 0 && (
              <Text style={styles.empty}>Пока нет доступных курсов.</Text>
            )}
            {courses.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.row}
                onPress={() => void run(() => chat2.course(c.id))}
                disabled={loading}
              >
                <View style={styles.avatar}>
                  <Text>🎓</Text>
                </View>
                <Text style={styles.rowTitle}>{c.name}</Text>
                <Text style={styles.join}>Открыть</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        {mode === "discover" && (
          <>
            <Text style={styles.section}>Каталог сообществ</Text>
            {groups.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.row}
                onPress={() => (c.joined ? open(c.id) : void run(() => chat2.join(c.id)))}
                disabled={loading}
              >
                <View style={styles.avatar}>
                  <Chat2Avatar room={{ kind: c.kind, members: [], avatarUrl: c.avatarUrl }} ownerId={owner}>
                    <Text>{emojii(c.kind)}</Text>
                  </Chat2Avatar>
                </View>
                <View style={styles.details}>
                  <Text style={styles.rowTitle}>{c.name}</Text>
                  <Text style={styles.preview}>{c.memberCount} участников</Text>
                </View>
                <Text style={styles.join}>{c.joined ? "Открыть" : "Вступить"}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        {mode === "create" && (
          <View style={styles.form}>
            <Text style={styles.section}>Новый групповой чат</Text>
            <TouchableOpacity onPress={() => void pickAvatar()} accessibilityLabel="Выбрать аватарку группы"
              style={{ alignSelf: "center", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {avatar
                ? <Image source={{ uri: avatar.uri }} style={{ width: 86, height: 86, borderRadius: 43 }} />
                : <View style={[styles.avatar, { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center" }]}><Text style={{ fontSize: 28 }}>👥</Text></View>}
              <Text style={{ color: olive }}>Добавить фотографию группы</Text>
            </TouchableOpacity>
            {avatar && <TouchableOpacity onPress={() => setAvatar(null)} accessibilityLabel="Убрать выбранную аватарку">
              <Text style={{ color: muted, textAlign: "center" }}>Убрать фотографию</Text>
            </TouchableOpacity>}
            <Text style={styles.label}>Название *</Text>
            <TextInput
              style={styles.input}
              value={name}
              maxLength={120}
              onChangeText={setName}
              placeholder="Название группы"
            />
            <Text style={styles.label}>Тематика</Text>
            <View style={styles.chips}>
              {(
                [
                  ["GROUP", "Группа"],
                  ["CITY", "Город"],
                  ["BREED", "Порода"],
                  ["COURSE_TOPIC", "Курс"],
                ] as const
              ).map(([k, text]) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, kind === k && styles.chipActive]}
                  onPress={() => setKind(k)}
                >
                  <Text>{text}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Доступ</Text>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, !privateGroup && styles.chipActive]}
                onPress={() => setPrivateGroup(false)}
              >
                <Text>Открытый</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, privateGroup && styles.chipActive]}
                onPress={() => setPrivateGroup(true)}
              >
                <Text>По приглашению</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Описание</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              multiline
              value={description}
              maxLength={2000}
              onChangeText={setDescription}
            />
            <TouchableOpacity
              style={styles.primary}
              disabled={loading || name.trim().length < 2}
              onPress={() =>
                void run(async () => {
                  const created = await chat2.create(name.trim(), kind,
                    privateGroup ? "PRIVATE" : "PUBLIC", description.trim());
                  if (avatar) {
                    try { await chat2.setAvatar(created.conversationId, avatar); }
                    catch {
                      reportClientError(new Error("CHAT2_AVATAR_UPLOAD_FAILED"), {
                        issueKey: "Chat2List", keys: { operation: "createAvatar" },
                      });
                      Alert.alert("Чат создан", "Не удалось загрузить аватарку. Её можно добавить в настройках чата.");
                    }
                  }
                  setAvatar(null);
                  return created;
                })
              }
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryText}>Создать чат</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bg },
  controls: { margin: 16, marginBottom: 12, paddingBottom: 6, backgroundColor: bg, borderRadius: 22, borderWidth: 1, borderColor: border },
  header: { padding: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  toolButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#e7eddb" },
  title: { fontSize: 23, fontWeight: "700", color: "#3e4a32", flex: 1 },
  tool: { fontSize: 25, color: olive },
  search: {
    backgroundColor: "#f0f2ed",
    marginHorizontal: 15,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  tabs: { flexDirection: "row", justifyContent: "space-evenly", marginBottom: 9 },
  tab: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20 },
  selectedTab: { backgroundColor: "#e7eddb" },
  tabText: { color: muted, fontSize: 12 },
  selectedTabText: { color: olive, fontWeight: "700" },
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  conversationHeading: {
    marginHorizontal: 4,
    marginBottom: 3,
    color: "#3e4a32",
    fontSize: 17,
    fontWeight: "700",
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: bg,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 18,
    minHeight: 76,
  },
  avatar: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#e7eddb",
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: { fontSize: 22 },
  details: { flex: 1, gap: 5 },
  rowTitle: { flexShrink: 1, color: "#313b2b", fontWeight: "600", fontSize: 15 },
  preview: { fontSize: 12, color: muted },
  badge: { backgroundColor: olive, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, color: "white", fontWeight: "700" },
  back: { marginHorizontal: 15, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f0f2ed" },
  backText: { color: olive },
  section: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3e4a32",
    paddingHorizontal: 17,
    marginBottom: 16,
    marginTop: 8,
  },
  empty: { color: muted, padding: 22, backgroundColor: bg, borderRadius: 18, borderWidth: 1, borderColor: border },
  error: { color: "#a33d30", padding: 14, marginHorizontal: 16, marginBottom: 10, backgroundColor: "#fff1ed", borderRadius: 14 },
  join: { color: olive, fontSize: 12, fontWeight: "600" },
  form: { padding: 17, gap: 12, backgroundColor: bg, borderRadius: 20, borderWidth: 1, borderColor: border },
  label: { fontSize: 13, color: "#556247", fontWeight: "600" },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  multiline: { minHeight: 78, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderColor: border, padding: 10, borderRadius: 11 },
  chipActive: { backgroundColor: "#e7eddb", borderColor: olive },
  primary: {
    backgroundColor: olive,
    marginTop: 16,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "white", fontWeight: "700" },
});
