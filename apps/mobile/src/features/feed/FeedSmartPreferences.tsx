import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedPersonalizationSettings } from "@gafus/types";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { feedApi } from "@/shared/lib/api/feed";
import { Loading } from "@/shared/components";

const options: { key: keyof FeedPersonalizationSettings; label: string; hint: string }[] = [
  {
    key: "enabled",
    label: "Персональные рекомендации",
    hint: "Использовать умную сортировку «Для вас»",
  },
  { key: "useCity", label: "Мой город", hint: "Чаще показывать людей из вашего города" },
  { key: "usePets", label: "Мои питомцы", hint: "Учитывать вид и породу питомцев" },
  {
    key: "useBehavior",
    label: "Моя активность",
    hint: "Учитывать реакции, комментарии и просмотры",
  },
  { key: "exploration", label: "Новые авторы", hint: "Иногда показывать незнакомые публикации" },
];

export function FeedSmartPreferences({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  if (!owner || !epoch) {
    return visible ? (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <Text accessibilityRole="alert" style={styles.error}>
              Для настройки ленты войдите в аккаунт.
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.close}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    ) : null;
  }
  return (
    <ActorFeedSmartPreferences
      key={`${owner}:${epoch}`}
      owner={owner}
      epoch={epoch}
      visible={visible}
      onClose={onClose}
    />
  );
}

function ActorFeedSmartPreferences({
  owner,
  epoch,
  visible,
  onClose,
}: {
  owner: string;
  epoch: string;
  visible: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const unknownRef = useRef(false);
  const retryInFlight = useRef(false);
  const current = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === owner &&
      binding?.principalId === owner &&
      binding.authEpoch === epoch
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const queryKey = ["feed", "personalization", owner, epoch] as const;
  const settings = useQuery({
    queryKey,
    queryFn: async () => {
      if (!current()) throw new Error("FEED_PREF_STALE_ACTOR");
      const result = await feedApi.getPersonalization();
      if (!current()) throw new Error("FEED_PREF_STALE_ACTOR");
      return result;
    },
    enabled: visible && current(),
    retry: false,
  });
  const retry = async () => {
    if (retryInFlight.current || inFlight.current || !current()) return;
    retryInFlight.current = true;
    try {
      await settings.refetch();
    } catch {
      if (current()) {
        reportClientError(new Error("FEED_PREF_READ_FAILED"), {
          issueKey: "FeedSmartPreferences",
          keys: { operation: "refetch" },
        });
      }
    } finally {
      retryInFlight.current = false;
    }
  };
  const refreshAfterCommit = async () => {
    if (!current()) return;
    try {
      queryClient.removeQueries({ queryKey: ["feed", "posts", owner, "smart"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["feed", "posts", owner] }),
        queryClient.invalidateQueries({ queryKey: ["feed-status", owner] }),
      ]);
    } catch {
      if (current()) {
        reportClientError(new Error("FEED_PREF_CACHE_REFRESH_FAILED"), {
          issueKey: "FeedSmartPreferences",
          keys: { operation: "invalidate" },
        });
        setNotice("Изменение сохранено. Обновите ленту, чтобы увидеть результат.");
      }
    }
  };
  const markUnknown = (operation: "change" | "reset", alreadyReported = false) => {
    if (!current()) return;
    unknownRef.current = true;
    setUnknown(true);
    setNotice(
      "Результат изменения неизвестен. Проверьте настройки позже; повторная отправка заблокирована.",
    );
    if (!alreadyReported) {
      reportClientError(new Error("FEED_PREF_MUTATION_UNKNOWN"), {
        issueKey: "FeedSmartPreferences",
        keys: { operation },
      });
    }
  };
  async function change(key: keyof FeedPersonalizationSettings, value: boolean) {
    if (
      !current() ||
      inFlight.current ||
      unknownRef.current ||
      settings.isPending ||
      settings.isError
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const updated = await feedApi.setPersonalization({ [key]: value });
      if (!current()) return;
      if (!updated || updated[key] !== value) {
        markUnknown("change");
        return;
      }
      setNotice("Настройка сохранена.");
      await refreshAfterCommit();
    } catch {
      if (current()) {
        reportClientError(new Error("FEED_PREF_MUTATION_UNKNOWN"), {
          issueKey: "FeedSmartPreferences",
          keys: { operation: "change" },
        });
      }
      markUnknown("change", true);
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  function reset() {
    if (
      !current() ||
      inFlight.current ||
      unknownRef.current ||
      settings.isPending ||
      settings.isError
    )
      return;
    const actorIsCurrent = current;
    Alert.alert(
      "Сбросить рекомендации?",
      "Рекомендации начнут подстраиваться заново. Реакции, комментарии и закладки сохранятся.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сбросить",
          style: "destructive",
          onPress: () => {
            if (!actorIsCurrent() || inFlight.current || unknownRef.current) return;
            inFlight.current = true;
            setBusy(true);
            setNotice("");
            void (async () => {
              try {
                const result = await feedApi.resetPersonalization();
                if (!current()) return;
                if (!result || result.reset !== true) {
                  markUnknown("reset");
                  return;
                }
                setNotice("Рекомендации сброшены.");
                await refreshAfterCommit();
              } catch {
                if (current()) {
                  reportClientError(new Error("FEED_PREF_MUTATION_UNKNOWN"), {
                    issueKey: "FeedSmartPreferences",
                    keys: { operation: "reset" },
                  });
                }
                markUnknown("reset", true);
              } finally {
                inFlight.current = false;
                if (current()) setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть настройки"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={styles.panel} accessibilityViewIsModal>
          <View style={styles.head}>
            <Text style={styles.title}>Настроить ленту</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.close}>Закрыть</Text>
            </Pressable>
          </View>
          {settings.isPending ? (
            <Loading variant="inline" />
          ) : settings.isError || !settings.data ? (
            <View>
              <Text accessibilityRole="alert" style={styles.error}>
                Не удалось загрузить настройки.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void retry()}>
                <Text style={styles.close}>Повторить загрузку</Text>
              </Pressable>
            </View>
          ) : (
            options.map((option) => {
              const disabled =
                busy || unknown || (option.key !== "enabled" && settings.data.enabled === false);
              return (
                <View key={option.key} style={styles.row}>
                  <View style={styles.textColumn}>
                    <Text style={styles.label}>{option.label}</Text>
                    <Text style={styles.hint}>{option.hint}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={option.label}
                    value={settings.data[option.key]}
                    disabled={disabled}
                    onValueChange={(value) => void change(option.key, value)}
                    trackColor={{ true: COLORS.primary }}
                  />
                </View>
              );
            })
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy || unknown || settings.isPending || settings.isError || !settings.data}
            onPress={reset}
            style={styles.reset}
          >
            <Text style={styles.resetText}>Сбросить рекомендации</Text>
          </Pressable>
          {!!notice && (
            <Text accessibilityRole="alert" style={unknown ? styles.error : styles.hint}>
              {notice}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 20 },
  panel: { backgroundColor: COLORS.cardBackground, borderRadius: 18, padding: 18 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  title: { fontSize: 17, fontFamily: FONTS.montserrat, fontWeight: "700", color: COLORS.text },
  close: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  textColumn: { flex: 1 },
  label: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  hint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
  error: { color: "#AE382E", marginTop: 10 },
  reset: { paddingVertical: 15, alignItems: "center" },
  resetText: { color: COLORS.primary, fontSize: 13, fontWeight: "600" },
});
