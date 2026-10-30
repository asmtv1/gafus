import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import WebView from "react-native-webview";
import * as Crypto from "expo-crypto";
import { TexturedSafeAreaView } from "@/shared/components";
import { Loading } from "@/shared/components/ui";
import { COLORS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { trackEvent } from "@/shared/lib/analytics";
import { gafusApi } from "@/shared/lib/api/gafus";
import type { GafusMiniGuideDto } from "@gafus/types";

export default function MiniGuidesScreen() {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  if (authLoading || (authenticated && !epoch))
    return <Loading fullScreen message="Загружаем мини-гайды" />;
  if (!owner || !epoch)
    return (
      <TexturedSafeAreaView style={styles.screen} edges={[]}>
        <Text style={styles.note}>Для просмотра мини-гайдов войдите в аккаунт.</Text>
      </TexturedSafeAreaView>
    );
  return <ActorMiniGuides key={`${owner}:${epoch}`} owner={owner} epoch={epoch} />;
}

function ActorMiniGuides({ owner, epoch }: { owner: string; epoch: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const retryInFlight = useRef(false);
  const pending = useRef(new Map<string, string>());
  const acknowledged = useRef(new Set<string>());
  const unknown = useRef(new Set<string>());
  const [reader, setReader] = useState<{ html: string; id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useCallback(() => {
    const auth = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      auth.isAuthenticated &&
      !auth.isLoading &&
      auth.user?.id === owner &&
      binding?.principalId === owner &&
      binding.authEpoch === epoch
    );
  }, [owner, epoch]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const guides = useQuery({
    queryKey: ["gafus-mini-guides", owner, epoch],
    queryFn: gafusApi.miniGuides,
    staleTime: 15_000,
  });
  const retryList = async () => {
    if (!current() || retryInFlight.current) return;
    retryInFlight.current = true;
    try {
      const result = await guides.refetch();
      if (current() && result.isError) setError("Не удалось обновить каталог мини-гайдов.");
    } catch {
      if (current()) {
        reportClientError(new Error("MINI_GUIDES_CATALOG_RETRY_FAILED"), {
          issueKey: "MiniGuides",
          keys: { operation: "catalog_retry" },
        });
        setError("Не удалось обновить каталог мини-гайдов.");
      }
    } finally {
      retryInFlight.current = false;
    }
  };
  const open = async (guide: GafusMiniGuideDto) => {
    if (!current() || inFlight.current || unknown.current.has(guide.courseId)) return;
    if (!guide.unlocked && !acknowledged.current.has(guide.courseId) && !guide.canPurchase) {
      setError("Мини-гайд сейчас недоступен для открытия.");
      return;
    }
    inFlight.current = true;
    setBusy(guide.courseId);
    setError(null);
    let unlockAcknowledged = guide.unlocked || acknowledged.current.has(guide.courseId);
    try {
      if (!unlockAcknowledged) {
        const id = pending.current.get(guide.courseId) ?? Crypto.randomUUID();
        pending.current.set(guide.courseId, id);
        try {
          await gafusApi.unlock({
            clientRequestId: id,
            target: { type: "MINI_GUIDE", courseId: guide.courseId },
          });
        } catch {
          if (current()) {
            unknown.current.add(guide.courseId);
            reportClientError(new Error("MINI_GUIDE_UNLOCK_OUTCOME_UNKNOWN"), {
              issueKey: "MiniGuides",
              keys: { operation: "unlock" },
            });
            setError(
              "Результат открытия неизвестен. Проверьте баланс и доступ перед повторной попыткой.",
            );
          }
          return;
        }
        if (!current()) return;
        acknowledged.current.add(guide.courseId);
        pending.current.delete(guide.courseId);
        unlockAcknowledged = true;
        try {
          trackEvent({
            eventName: "button_click",
            platform: "mobile",
            pathOrScreen: "/gafus-guides",
            elementId: "gafus-guide-unlock-success",
            courseId: guide.courseId,
          });
        } catch {
          if (current())
            reportClientError(new Error("MINI_GUIDE_POST_ACK_ANALYTICS_FAILED"), {
              issueKey: "MiniGuides",
              keys: { operation: "analytics" },
            });
        }
      }
      if (!current()) return;
      try {
        const data = await gafusApi.guide(guide.courseId);
        if (!current()) return;
        if (typeof data.guideContent !== "string" || !data.guideContent.trim()) {
          setError("Материал мини-гайда пока недоступен. Попробуйте открыть его ещё раз.");
          return;
        }
        setReader({ id: guide.courseId, html: data.guideContent });
      } catch {
        if (current()) {
          reportClientError(new Error("MINI_GUIDE_CONTENT_READ_FAILED"), {
            issueKey: "MiniGuides",
            keys: { operation: "guide_read" },
          });
          setError(
            unlockAcknowledged
              ? "Доступ подтверждён, но мини-гайд не загрузился. Повторите чтение."
              : "Не удалось загрузить мини-гайд. Попробуйте ещё раз.",
          );
        }
        return;
      }
      if (!current()) return;
      const results = await Promise.allSettled([
        Promise.resolve().then(() =>
          cache.invalidateQueries({ queryKey: ["gafus-status", owner] }),
        ),
        Promise.resolve().then(() => guides.refetch()),
      ]);
      if (current() && results.some((result) => result.status === "rejected")) {
        reportClientError(new Error("MINI_GUIDE_CACHE_REFRESH_FAILED"), {
          issueKey: "MiniGuides",
          keys: { operation: "invalidate" },
        });
      }
    } finally {
      inFlight.current = false;
      if (current()) setBusy(null);
    }
  };

  if (guides.isPending) return <Loading fullScreen message="Загружаем мини-гайды" />;
  return (
    <TexturedSafeAreaView style={styles.screen} edges={[]}>
      {reader ? (
        <View style={styles.reader}>
          <Pressable
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="К мини-гайдам"
            onPress={() => {
              if (current()) setReader(null);
            }}
          >
            <Text style={styles.backText}>← К мини-гайдам</Text>
          </Pressable>
          <WebView
            source={{ html: reader.html, baseUrl: "about:blank" }}
            originWhitelist={["about:blank"]}
            javaScriptEnabled={false}
            allowFileAccess={false}
            setSupportMultipleWindows={false}
            mixedContentMode="never"
            style={styles.webview}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Мои Гафусы"
            onPress={() => {
              if (current()) router.back();
            }}
            style={styles.back}
          >
            <Text style={styles.backText}>← Мои Гафусы</Text>
          </Pressable>
          <Text style={styles.heading}>Мини-гайды</Text>
          <Text style={styles.note}>Открывайте полезные материалы за Гафусы.</Text>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {guides.isError ? (
            <View>
              <Text style={styles.error}>Не удалось получить каталог.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Повторить загрузку мини-гайдов"
                onPress={() => void retryList()}
                style={styles.back}
              >
                <Text style={styles.backText}>Повторить</Text>
              </Pressable>
            </View>
          ) : (
            guides.data?.map((guide) => (
              <View style={styles.card} key={guide.courseId}>
                <Text style={styles.title}>{guide.title}</Text>
                <Text style={styles.note}>{guide.description}</Text>
                <Text style={styles.detail}>
                  {guide.unlocked || acknowledged.current.has(guide.courseId)
                    ? guide.expiresAt
                      ? `Доступ до ${new Date(guide.expiresAt).toLocaleDateString("ru-RU")}`
                      : "Доступ открыт"
                    : `Стоимость: ${guide.price} Гафус`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Открыть мини-гайд ${guide.title}`}
                  disabled={
                    busy !== null ||
                    unknown.current.has(guide.courseId) ||
                    (!guide.unlocked &&
                      !acknowledged.current.has(guide.courseId) &&
                      !guide.canPurchase)
                  }
                  style={[
                    styles.button,
                    (busy !== null ||
                      unknown.current.has(guide.courseId) ||
                      (!guide.unlocked &&
                        !acknowledged.current.has(guide.courseId) &&
                        !guide.canPurchase)) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={() => void open(guide)}
                >
                  <Text style={styles.buttonText}>
                    {busy === guide.courseId
                      ? "Открываем…"
                      : guide.unlocked || acknowledged.current.has(guide.courseId)
                        ? "Читать"
                        : "Открыть за Гафусы"}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
          {!guides.isError && guides.data?.length === 0 && (
            <Text style={styles.note}>Мини-гайды пока не опубликованы.</Text>
          )}
        </ScrollView>
      )}
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: 48, gap: 12 },
  heading: { fontSize: 26, fontWeight: "700", color: COLORS.text },
  note: { fontSize: 14, lineHeight: 21, color: "#656D60" },
  card: {
    backgroundColor: "#FFFDF7",
    borderColor: "#E5E2D7",
    borderWidth: 1,
    borderRadius: 17,
    padding: 18,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  detail: { fontSize: 12, color: "#677858" },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#738453",
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700" },
  back: { paddingVertical: 8, paddingHorizontal: 16 },
  backText: { fontWeight: "600", color: "#70844B" },
  error: { fontSize: 13, color: "#9C4033" },
  reader: { flex: 1 },
  webview: { flex: 1, backgroundColor: "#fff" },
});
