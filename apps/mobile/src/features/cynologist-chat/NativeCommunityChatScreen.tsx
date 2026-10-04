import { COMMUNITY_CHAT_RULES } from "@gafus/consultation-shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import CommunityModeration from "./CommunityModeration";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import type { CommunityChatStateDto, CynologistChatSessionDto } from "@gafus/consultation-shared";
import { Connected } from "./NativeChatScreen";
import { chatApi } from "@/shared/lib/api/cynologistChat";
import { useAuthStore } from "@/shared/stores";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Loading } from "@/shared/components/ui/Loading";
import { COLORS, FONTS } from "@/shared/config";
export default function NativeCommunityChatScreen() {
  const accountId = useAuthStore((s) => s.user?.id);
  const [state, setState] = useState<CommunityChatStateDto | null>(null);
  const [session, setSession] = useState<CynologistChatSessionDto | null>(null);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<{ accountId: string; visible: boolean } | null>(null);
  const showRules = !!accountId && rules?.accountId === accountId && rules.visible;
  useEffect(() => {
    let alive = true;
    if (accountId) {
      AsyncStorage.getItem(`community-chat-rules:v1:${accountId}`)
        .then((value) => {
          if (alive) setRules({ accountId, visible: value !== "dismissed" });
        })
        .catch(() => {
          if (alive) setRules({ accountId, visible: true });
        });
    }
    return () => {
      alive = false;
    };
  }, [accountId]);
  function dismissRules() {
    if (!accountId) return;
    setRules({ accountId, visible: false });
    void AsyncStorage.setItem(`community-chat-rules:v1:${accountId}`, "dismissed").catch(
      () => undefined,
    );
  }
  const refresh = useCallback(async () => {
    setState(await chatApi<CommunityChatStateDto>("", { community: true }));
  }, []);
  useEffect(() => {
    let alive = true;
    setState(null);
    setSession(null);
    setError("");
    chatApi<CommunityChatStateDto>("", { community: true })
      .then(async (value) => {
        if (!alive) return;
        setState(value);
        if (value.enabled) {
          const next = await chatApi<CynologistChatSessionDto>("session", {
            method: "POST",
            community: true,
          });
          if (alive) setSession(next);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [accountId]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh().catch(() => undefined);
    });
    return () => listener.remove();
  }, [refresh]);
  if (!state && !error) return <Loading message="Загрузка сообщений…" fullScreen embedded />;
  return (
    <TexturedSafeAreaView style={styles.flex} edges={[]} inheritBackground>
      {(showRules || state?.isModerator || state?.isBanned) && (
        <View style={styles.header}>
          {showRules && (
            <View style={styles.rules}>
              <View style={styles.rulesHeading}>
                <Text style={styles.rulesTitle}>Правила чата</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Закрыть правила чата"
                  onPress={dismissRules}
                  hitSlop={10}
                  style={styles.closeRules}
                >
                  <MaterialCommunityIcons name="close" size={20} color={COLORS.primary} />
                </Pressable>
              </View>
              <Text style={styles.rulesText}>{COMMUNITY_CHAT_RULES}</Text>
            </View>
          )}
          {state?.isModerator && <CommunityModeration />}
          {state?.isBanned && (
            <Text accessibilityRole="alert">
              Вы заблокированы в общем чате. Отправка сообщений недоступна.
            </Text>
          )}
        </View>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {state && !state.enabled && <Text style={styles.header}>Общий чат пока недоступен.</Text>}
      {state?.enabled && !session && !error && (
        <Loading message="Загрузка сообщений…" fullScreen embedded />
      )}
      {state && session && accountId && session.userId === `gafus-${accountId}` && (
        <Connected state={state} session={session} refresh={refresh} community />
      )}
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: 16, gap: 6 },
  title: { fontFamily: FONTS.montserratBold, fontSize: 24, color: COLORS.primary },
  rules: {
    padding: 7,
    gap: 3,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
  },
  rulesHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeRules: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  rulesTitle: { fontFamily: FONTS.montserratBold, fontSize: 13, color: COLORS.primary },
  rulesText: { fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 16, color: COLORS.text },
  error: { padding: 16, color: "#a32424" },
});
