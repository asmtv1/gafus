import { useCallback, useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { cynologistDisplayInitials, plainConsultationAboutHtml } from "@gafus/consultation-shared";
import type { ListedCynologistCardDto } from "@gafus/consultation-shared";
import { Image } from "expo-image";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { TourTarget } from "@/shared/lib/tour-targets";
import { PageHeader, TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { trackEvent } from "@/shared/lib/analytics";

/**
 * Каталог кинологов — паритет с web (карточки, поднавигация, тексты).
 */
export default function ConsultationsCynologistsListScreen() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["consultations", "cynologists"],
    queryFn: async () => {
      const res = await consultationsApi.listCynologists();
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка загрузки");
      }
      return res.data ?? [];
    },
  });

  const items = useMemo(() => query.data ?? [], [query.data]);

  useEffect(() => {
    if (query.isError && query.error) {
      reportClientError(
        query.error instanceof Error ? query.error : new Error(String(query.error)),
        { issueKey: "consultation", keys: { screen: "list" } },
      );
    }
  }, [query.isError, query.error]);

  const onOpen = useCallback(
    (c: ListedCynologistCardDto) => {
      hapticFeedback.medium();
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/consultations",
        elementId: "consultation-cynologist-open",
      });
      const q = new URLSearchParams({
        displayName: c.displayName ?? "",
        slotDurationMin: String(c.slotDurationMin),
      });
      router.push(`/consultations/${encodeURIComponent(c.userId)}?${q.toString()}` as Href);
    },
    [router],
  );

  return (
    <TexturedSafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TourTarget id="consultations-list">
          <PageHeader
            title="Консультации"
            description="Выберите кинолога и удобное время для встречи"
          />
        </TourTarget>

        <View style={styles.subNav}>
          <Button
            label="Каталог кинологов"
            variant="selected"
            flex={1}
            fullWidth={false}
            height={52}
            fontSize={12}
            lineHeight={18}
            fontFamily={FONTS.montserratMedium}
            horizontalPadding={6}
            verticalPadding={0}
            borderRadius={12}
            animatedPress
            compact
            haptic={false}
            accessibilityRole="radio"
            accessibilityState={{ checked: true }}
          />
          <Button
            label="Мои консультации"
            variant="primary"
            flex={1}
            fullWidth={false}
            height={52}
            fontSize={12}
            lineHeight={18}
            fontFamily={FONTS.montserratMedium}
            horizontalPadding={6}
            verticalPadding={0}
            borderRadius={12}
            animatedPress
            compact
            haptic={false}
            onPress={() => {
              hapticFeedback.light();
              router.push("/(main)/(tabs)/consultations?view=mine" as Href);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: false }}
          />
        </View>

        {query.isError ? (
          <Text style={styles.error}>Не удалось загрузить список. Попробуйте позже.</Text>
        ) : null}
        {query.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
        {!query.isLoading && items.length === 0 ? (
          <Text style={styles.muted}>
            Пока нет доступных кинологов для записи. Загляните позже.
          </Text>
        ) : null}

        {!query.isLoading && items.length > 0 ? (
          <View style={styles.catalogHeading}>
            <Text style={styles.sectionTitle}>Доступные специалисты</Text>
            <Text style={styles.catalogCaption}>Выберите того, с кем хотите обсудить питомца</Text>
          </View>
        ) : null}

        {items.map((c) => {
          const src = resolveImageUrl(c.avatarUrl);
          const about = plainConsultationAboutHtml(c.about);
          const title = c.displayName ?? "Кинолог";
          return (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardInner}>
                <View style={styles.avatarFrame}>
                  {src ? (
                    <Image source={{ uri: src }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarPlaceholder}>
                      {cynologistDisplayInitials(c.displayName)}
                    </Text>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.title}>{title}</Text>
                  {about ? (
                    <Text style={styles.about}>{about}</Text>
                  ) : (
                    <Text style={styles.aboutEmpty}>
                      Описание появится, когда кинолог заполнит профиль.
                    </Text>
                  )}
                  <View style={styles.meta}>
                    <Text style={styles.metaLine}>
                      Длительность слота: {c.slotDurationMin} мин. · Часовой пояс: МСК (UTC+3)
                    </Text>
                    <Button
                      label="Выбрать слот"
                      icon="arrow-right"
                      iconPosition="right"
                      fullWidth={false}
                      height={44}
                      fontFamily={FONTS.montserratMedium}
                      fontSize={14}
                      lineHeight={18}
                      horizontalPadding={14}
                      verticalPadding={0}
                      borderRadius={14}
                      animatedPress
                      haptic={false}
                      style={styles.ctaButtonLayout}
                      onPress={() => onOpen(c)}
                      accessibilityLabel={`Выбрать слот у кинолога ${title}`}
                      accessibilityHint="Открывает календарь свободных слотов"
                    />
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xxl },
  subNav: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  catalogHeading: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontFamily: FONTS.montserratBold,
    fontSize: 20,
    color: COLORS.text,
    lineHeight: 26,
  },
  catalogCaption: {
    color: "#756D65",
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  card: {
    backgroundColor: "#FFF8E5",
    borderRadius: 16,
    marginBottom: SPACING.md,
    overflow: "hidden",
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  cardInner: { flexDirection: "row", padding: SPACING.md, gap: SPACING.md },
  avatarFrame: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    backgroundColor: "#ECE5D2",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { width: 88, height: 88 },
  avatarPlaceholder: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 28,
    color: COLORS.textSecondary,
  },
  cardBody: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONTS.montserratBold, fontSize: 18, color: COLORS.text, lineHeight: 24 },
  about: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.text,
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
  aboutEmpty: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: "italic",
  },
  meta: { marginTop: SPACING.sm },
  metaLine: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary },
  ctaButtonLayout: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
  },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
});
