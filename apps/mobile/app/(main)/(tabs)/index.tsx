import { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable, TextInput } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Loading } from "@/shared/components/ui";
import { useCourseStore } from "@/shared/stores";
import { coursesApi, type Course } from "@/shared/lib/api";
import { CourseCard } from "@/features/courses/components";
import { COLORS, SPACING, BORDER_RADIUS } from "@/constants";

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
};

/**
 * Страница со всеми курсами (точный дизайн как веб-версия)
 */
export default function CoursesScreen() {
  const queryClient = useQueryClient();
  const { filters, setFilter, clearFilters, addToFavorites, removeFromFavorites, isFavorite } =
    useCourseStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState(filters.search || "");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  // Загрузка курсов
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.getAll(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Обновляем поиск с debounce
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      setFilter("search", text);
    },
    [setFilter],
  );

  // Фильтруем курсы локально (как в веб-версии)
  // API возвращает массив курсов напрямую в data
  const filteredCourses = useMemo(() => {
    if (!data?.data || !Array.isArray(data.data)) return [];

    let courses = data.data;

    // Фильтрация по поисковому запросу
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      courses = courses.filter(
        (c) =>
          c.name?.toLowerCase().includes(query) ||
          c.description?.toLowerCase().includes(query) ||
          c.shortDesc?.toLowerCase().includes(query) ||
          c.authorUsername?.toLowerCase().includes(query),
      );
    }

    // Фильтрация по типу (personal/group)
    if (filters.type) {
      // В API нет поля type для фильтрации, пропускаем
      // Можно добавить фильтрацию по isPrivate если нужно
    }

    // Фильтрация по уровню
    if (filters.level) {
      courses = courses.filter((c) => c.trainingLevel === filters.level);
    }

    // Сортировка по дате создания (новые → старые)
    courses = [...courses].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return courses;
  }, [data?.data, searchQuery, filters.type, filters.level]);

  const handleToggleFavorite = async (courseId: string) => {
    const wasFavorite = isFavorite(courseId);
    if (wasFavorite) {
      removeFromFavorites(courseId);
    } else {
      addToFavorites(courseId);
    }
    setPendingIds((prev) => [...prev, courseId]);
    try {
      const res = await coursesApi.toggleFavorite(courseId, wasFavorite ? "remove" : "add");
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["favorites"] });
      } else {
        throw new Error(res.error ?? "Ошибка избранного");
      }
    } catch (err) {
      if (wasFavorite) {
        addToFavorites(courseId);
      } else {
        removeFromFavorites(courseId);
      }
      setSnackbar({
        visible: true,
        message: err instanceof Error ? err.message : "Ошибка избранного",
      });
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== courseId));
    }
  };

  const renderCourseItem = ({ item }: { item: Course }) => {
    const courseIsFavorite = isFavorite(item.id) ?? item.isFavorite;

    return (
      <CourseCard
        course={item}
        isFavorite={courseIsFavorite}
        onToggleFavorite={() => handleToggleFavorite(item.id)}
        disabled={pendingIds.includes(item.id)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Поиск (как в веб-версии) */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <View style={styles.searchIconContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск курсов..."
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
          {searchQuery.length > 0 && (
            <Pressable
              style={styles.clearButton}
              onPress={() => {
                setSearchQuery("");
                setFilter("search", "");
              }}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Список курсов */}
      {isLoading ? (
        <Loading fullScreen message="Загрузка курсов..." />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Ошибка загрузки курсов</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredCourses}
          renderItem={renderCourseItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? `По запросу "${searchQuery}" ничего не найдено`
                  : "В этой категории пока нет курсов"}
              </Text>
            </View>
          }
        />
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Поиск (как в веб-версии)
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchWrapper: {
    position: "relative",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  searchIconContainer: {
    position: "absolute",
    left: 16,
    top: "50%",
    transform: [{ translateY: -10 }],
    zIndex: 1,
  },
  searchIcon: {
    fontSize: 20,
  },
  searchInput: {
    width: "100%",
    paddingVertical: 14,
    paddingLeft: 48,
    paddingRight: 48,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.cardBackground,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "500",
    fontFamily: "System",
  },
  clearButton: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: [{ translateY: -10 }],
    padding: 8,
    borderRadius: 6,
  },
  clearButtonText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: SPACING.md,
  },
  retryText: {
    color: COLORS.secondary,
    fontWeight: "600",
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: "center",
    fontSize: 16,
  },
});
