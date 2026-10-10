import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import WebView from "react-native-webview";
import * as Crypto from "expo-crypto";
import { TexturedSafeAreaView } from "@/shared/components";
import { Loading } from "@/shared/components/ui";
import { COLORS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { reportClientError } from "@/shared/lib/tracer";
import { trackEvent } from "@/shared/lib/analytics";
import { gafusApi } from "@/shared/lib/api/gafus";
import type { GafusMiniGuideDto } from "@gafus/types";

export default function MiniGuidesScreen() {
  const userId = useAuthStore(s => s.user?.id);
  const router = useRouter();
  const cache = useQueryClient();
  const [reader, setReader] = useState<{ html: string; id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Map<string, string>());
  const guides = useQuery({
    queryKey: ["gafus-mini-guides", userId],
    queryFn: gafusApi.miniGuides,
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
  const open = useCallback(async (guide: GafusMiniGuideDto) => {
    if (busy) return;
    setBusy(guide.courseId);
    setError(null);
    try {
      if (!guide.unlocked) {
        if (!guide.canPurchase) throw new Error("Покупка сейчас недоступна");
        const id = pending.current.get(guide.courseId) ?? Crypto.randomUUID();
        pending.current.set(guide.courseId, id);
        await gafusApi.unlock({
          clientRequestId: id,
          target: { type: "MINI_GUIDE", courseId: guide.courseId },
        });
        trackEvent({
          eventName: "button_click", platform: "mobile",
          pathOrScreen: "/gafus-guides", elementId: "gafus-guide-unlock-success",
          courseId: guide.courseId,
        });
        pending.current.delete(guide.courseId);
      }
      const data = await gafusApi.guide(guide.courseId);
      setReader({ id: guide.courseId, html: data.guideContent });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["gafus-status", userId] }),
        guides.refetch(),
      ]);
    } catch (caught) {
      reportClientError(caught instanceof Error ? caught : new Error(String(caught)), {
        issueKey: "MiniGuides",
        keys: { courseId: guide.courseId, operation: "open" },
      });
      setError(caught instanceof Error ? caught.message : "Не удалось открыть мини-гайд");
    } finally {
      setBusy(null);
    }
  }, [busy, guides, cache, userId]);

  if (guides.isPending) return <Loading fullScreen message="Загружаем мини-гайды" />;
  return <TexturedSafeAreaView style={styles.screen} edges={[]}>
    {reader ? <View style={styles.reader}>
      <Pressable style={styles.back} accessibilityRole="button" onPress={() => setReader(null)}>
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
    </View> : <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Мои Гафусы</Text>
      </Pressable>
      <Text style={styles.heading}>Мини-гайды</Text>
      <Text style={styles.note}>Открывайте полезные материалы за Гафусы.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {guides.isError && <Text style={styles.error}>Не удалось получить каталог.</Text>}
      {guides.data?.map(guide => <View style={styles.card} key={guide.courseId}>
        <Text style={styles.title}>{guide.title}</Text>
        <Text style={styles.note}>{guide.description}</Text>
        <Text style={styles.detail}>
          {guide.unlocked
            ? guide.expiresAt
              ? `Доступ до ${new Date(guide.expiresAt).toLocaleDateString("ru-RU")}`
              : "Доступно по подписке"
            : `Стоимость: ${guide.price} Гафус`}
        </Text>
        <Pressable accessibilityRole="button"
          disabled={busy === guide.courseId || (!guide.unlocked && !guide.canPurchase)}
          style={[styles.button,
            (busy === guide.courseId || (!guide.unlocked && !guide.canPurchase))
              && styles.buttonDisabled]}
          onPress={() => void open(guide)}>
          <Text style={styles.buttonText}>
            {busy === guide.courseId ? "Открываем…" : guide.unlocked ? "Читать" : "Открыть за Гафусы"}
          </Text>
        </Pressable>
      </View>)}
      {guides.data?.length === 0 && <Text style={styles.note}>Мини-гайды пока не опубликованы.</Text>}
    </ScrollView>}
  </TexturedSafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: 48, gap: 12 },
  heading: { fontSize: 26, fontWeight: "700", color: COLORS.text },
  note: { fontSize: 14, lineHeight: 21, color: "#656D60" },
  card: { backgroundColor: "#FFFDF7", borderColor: "#E5E2D7",
    borderWidth: 1, borderRadius: 17, padding: 18, gap: 10 },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  detail: { fontSize: 12, color: "#677858" },
  button: { alignSelf: "flex-start", backgroundColor: "#738453",
    borderRadius: 12, paddingHorizontal: 17, paddingVertical: 12 },
  buttonDisabled: { opacity: .5 },
  buttonText: { color: "#fff", fontWeight: "700" },
  back: { paddingVertical: 8, paddingHorizontal: 16 },
  backText: { fontWeight: "600", color: "#70844B" },
  error: { fontSize: 13, color: "#9C4033" },
  reader: { flex: 1 },
  webview: { flex: 1, backgroundColor: "#fff" },
});