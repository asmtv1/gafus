import { useCallback, useEffect, useMemo } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { cynologistDisplayInitials } from "@gafus/consultation-shared";
import type { ListedCynologistCardDto } from "@gafus/consultation-shared";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import type { Href } from "expo-router";
import { useFocusEffect, useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { TourTarget } from "@/shared/lib/tour-targets";
import { TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { trackEvent } from "@/shared/lib/analytics";

const LANA_CYNOLOGIST_USER_ID = "cmhq7qk2s0000nn01jr2ptnil";

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
      return { items: res.data ?? [], bookingEligibility: res.bookingEligibility };
    },
  });

  const { refetch } = query;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

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
    <TexturedSafeAreaView style={styles.root} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <TourTarget id="consultations-list">
          <Image
            source={require("../../../../assets/images/consultations-catalog-header.png")}
            style={styles.headerImage}
            contentFit="cover"
            accessible
            accessibilityLabel="Консультации. Выберите кинолога и удобное время для встречи"
          />
        </TourTarget>
        <View style={styles.content}>

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

        {query.data?.bookingEligibility && !query.data.bookingEligibility.canBook ? (
          <Text accessibilityRole="alert" style={[styles.muted, { marginBottom: SPACING.md }]}>
            {query.data.bookingEligibility.message}
          </Text>
        ) : null}

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
                  {c.userId === LANA_CYNOLOGIST_USER_ID ? (
                    <View style={styles.badges}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Составитель курсов</Text>
                      </View>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Главный кинолог проекта</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.meta}>
                <Text style={styles.metaLine}>Длительность слота: {c.slotDurationMin} мин.</Text>
                <Text style={styles.metaLine}>Часовой пояс: МСК (UTC+3)</Text>
              </View>
              <View style={styles.actions}>
                <Button
                  label="Подробнее о кинологе"
                  variant="caramel"
                  height={48}
                  fontFamily={FONTS.montserratMedium}
                  fontSize={14}
                  lineHeight={20}
                  borderRadius={14}
                  animatedPress
                  haptic={false}
                  onPress={() => {
                    hapticFeedback.light();
                    if (!c.username) {
                      Alert.alert("Профиль кинолога", "Не удалось открыть профиль. Попробуйте позже.");
                      return;
                    }
                    router.push({ pathname: "/profile/[username]", params: { username: c.username } });
                  }}
                  accessibilityLabel={`Подробнее о кинологе ${title}`}
                  accessibilityHint="Открывает профиль кинолога"
                />
                <Button
                  label="Выбрать время"
                  icon="arrow-right"
                  iconPosition="right"
                  height={48}
                  fontFamily={FONTS.montserratMedium}
                  fontSize={14}
                  lineHeight={18}
                  horizontalPadding={14}
                  verticalPadding={0}
                  borderRadius={14}
                  animatedPress
                  haptic={false}
                  onPress={() => onOpen(c)}
                  accessibilityLabel={`Выбрать время у кинолога ${title}`}
                  accessibilityHint="Открывает календарь свободных слотов"
                />
              </View>
            </View>
          );
        })}
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: SPACING.xxl },
  headerImage: {
    width: "100%",
    height: 180,
  },
  content: { padding: SPACING.md },
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
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    marginBottom: SPACING.md,
    overflow: "hidden",
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  cardInner: { flexDirection: "row", alignItems: "center", padding: SPACING.md, gap: SPACING.md },
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
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.xs },
  badge: {
    maxWidth: "100%",
    borderRadius: 8,
    backgroundColor: "#E7E9D7",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 10,
    lineHeight: 15,
    color: "#4A542E",
  },
  meta: { paddingHorizontal: SPACING.md, gap: 2 },
  metaLine: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  actions: { padding: SPACING.md, gap: SPACING.sm },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md, fontFamily: FONTS.montserrat },
});
