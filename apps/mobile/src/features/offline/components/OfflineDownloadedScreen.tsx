import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Text } from "react-native-paper";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { getOfflineCourseTypes, getCourseMeta } from "@/shared/lib/offline";
import { COLORS, SPACING, FONTS } from "@/constants";

interface OfflineCourseItem {
  courseType: string;
  name: string;
}

/**
 * Экран «Скачанные курсы» — показывается при офлайне при попытке открыть контент (Курсы / Избранное).
 * Список строится по данным в файловой системе и meta.json.
 */
export function OfflineDownloadedScreen() {
  const router = useRouter();
  const [items, setItems] = useState<OfflineCourseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const types = await getOfflineCourseTypes();
      if (cancelled) return;
      const list: OfflineCourseItem[] = [];
      for (const courseType of types) {
        const meta = await getCourseMeta(courseType);
        if (cancelled) return;
        list.push({
          courseType,
          name: meta?.course?.name ?? courseType,
        });
      }
      setItems(list);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenCourse = (courseType: string) => {
    router.push(`/training/${courseType}`);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Загрузка списка...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Скачанные курсы</Text>
      <Text style={styles.subtitle}>
        Доступны без интернета. Выберите курс для тренировки.
      </Text>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons
            name="download-off-outline"
            size={48}
            color={COLORS.disabled}
          />
          <Text style={styles.emptyTitle}>Нет скачанных курсов</Text>
          <Text style={styles.emptyText}>
            Скачайте курсы при подключении к интернету — на вкладке «Курсы» или
            «Избранное» нажмите «Скачать для работы в офлайн» на карточке курса.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.courseType}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
              onPress={() => handleOpenCourse(item.courseType)}
            >
              <MaterialCommunityIcons
                name="book-open-variant"
                size={24}
                color={COLORS.primary}
              />
              <Text style={styles.itemName} numberOfLines={2}>
                {item.name}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={COLORS.textSecondary}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    gap: SPACING.md,
  },
  loadingText: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  title: {
    fontSize: 28,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginBottom: SPACING.xs,
    fontFamily: FONTS.impact,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  list: {
    gap: SPACING.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cardBackground,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: SPACING.md,
  },
  itemPressed: {
    opacity: 0.85,
  },
  itemName: {
    flex: 1,
    fontFamily: FONTS.montserrat,
    fontSize: 16,
    color: COLORS.text,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    fontFamily: FONTS.impact,
    fontSize: 20,
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
