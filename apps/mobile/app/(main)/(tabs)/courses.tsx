import { useState, useCallback, useMemo } from "react";
import { 
  View, 
  StyleSheet, 
  FlatList, 
  RefreshControl,
  Pressable,
} from "react-native";
import { 
  Text, 
  Searchbar, 
  Chip, 
  IconButton,
  Divider,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";

import { Loading } from "@/shared/components/ui";
import { useCourseStore } from "@/shared/stores";
import { coursesApi, type Course } from "@/shared/lib/api";
import { COLORS, SPACING, BORDER_RADIUS } from "@/constants";

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
};

/**
 * Страница со всеми курсами
 */
export default function CoursesScreen() {
  const { 
    filters, 
    setFilter, 
    clearFilters,
    favorites,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
  } = useCourseStore();

  const [refreshing, setRefreshing] = useState(false);

  // Загрузка курсов
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["courses", filters],
    queryFn: () => coursesApi.getAll({
      type: filters.type || undefined,
      level: filters.level || undefined,
      search: filters.search || undefined,
    }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Фильтруем курсы локально по поиску
  const filteredCourses = useMemo(() => {
    if (!data?.data?.courses) return [];
    
    let courses = data.data.courses;
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      courses = courses.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.shortDesc.toLowerCase().includes(searchLower)
      );
    }
    
    return courses;
  }, [data?.data?.courses, filters.search]);

  const handleToggleFavorite = (courseId: string) => {
    if (isFavorite(courseId)) {
      removeFromFavorites(courseId);
    } else {
      addToFavorites(courseId);
    }
  };

  const renderCourseItem = ({ item }: { item: Course }) => (
    <CourseCard 
      course={item} 
      isFavorite={isFavorite(item.id)}
      onToggleFavorite={() => handleToggleFavorite(item.id)}
    />
  );

  const hasActiveFilters = filters.type || filters.level;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Поиск */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Поиск курсов..."
          value={filters.search}
          onChangeText={(text) => setFilter("search", text)}
          style={styles.searchbar}
        />
      </View>

      {/* Фильтры */}
      <View style={styles.filtersContainer}>
        <View style={styles.chipRow}>
          <Chip
            selected={filters.type === "personal"}
            onPress={() => setFilter("type", filters.type === "personal" ? null : "personal")}
            style={styles.chip}
          >
            Персональные
          </Chip>
          <Chip
            selected={filters.type === "group"}
            onPress={() => setFilter("type", filters.type === "group" ? null : "group")}
            style={styles.chip}
          >
            Групповые
          </Chip>
        </View>

        <View style={styles.chipRow}>
          {Object.entries(LEVEL_LABELS).map(([key, label]) => (
            <Chip
              key={key}
              selected={filters.level === key}
              onPress={() => setFilter("level", filters.level === key ? null : key)}
              style={styles.chip}
              compact
            >
              {label}
            </Chip>
          ))}
        </View>

        {hasActiveFilters && (
          <Pressable onPress={clearFilters} style={styles.clearFilters}>
            <Text style={styles.clearFiltersText}>Сбросить фильтры</Text>
          </Pressable>
        )}
      </View>

      <Divider />

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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {filters.search || hasActiveFilters
                  ? "Курсы не найдены"
                  : "Нет доступных курсов"}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Карточка курса (дизайн как в веб-версии)
 */
function CourseCard({ 
  course, 
  isFavorite, 
  onToggleFavorite 
}: { 
  course: Course;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <Link href={`/training/${course.type}`} asChild>
      <Pressable style={styles.courseCard}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: course.logoImg }}
            style={styles.courseImage}
            contentFit="cover"
            transition={200}
          />
        </View>
        
        <View style={styles.courseContent}>
          <Text style={styles.courseTitle} numberOfLines={2}>
            {course.name}
          </Text>
          
          <View style={styles.courseMeta}>
            <Text style={styles.metaText}>
              <Text style={styles.metaBold}>Длительность:</Text> {course.duration}
            </Text>
            <Text style={styles.metaText}>
              <Text style={styles.metaBold}>Уровень:</Text> {LEVEL_LABELS[course.trainingLevel] || course.trainingLevel}
            </Text>
          </View>
          
          <Text style={styles.courseDesc} numberOfLines={3}>
            <Text style={styles.metaBold}>Описание:</Text> {course.shortDesc}
          </Text>
        </View>
        
        <View style={styles.authorRow}>
          <Text style={styles.metaText}>
            {course.totalDays} дней • {LEVEL_LABELS[course.trainingLevel]}
          </Text>
          <IconButton
            icon={isFavorite ? "heart" : "heart-outline"}
            iconColor={isFavorite ? COLORS.error : COLORS.textSecondary}
            size={20}
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            style={styles.favoriteButton}
          />
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  searchContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  searchbar: {
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.cardBackground,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  chip: {
    marginRight: SPACING.xs,
  },
  clearFilters: {
    alignSelf: "flex-start",
  },
  clearFiltersText: {
    color: COLORS.secondary,
    fontSize: 12,
  },
  listContent: {
    padding: SPACING.md,
  },
  // Стили карточки курса (как в веб-версии)
  courseCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  imageContainer: {
    padding: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
  },
  courseImage: {
    width: "100%",
    height: 140,
    borderRadius: BORDER_RADIUS.md,
  },
  courseContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  courseTitle: {
    fontSize: 20,
    fontWeight: "400",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  courseMeta: {
    marginBottom: SPACING.sm,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.text,
    marginBottom: 4,
  },
  metaBold: {
    fontWeight: "700",
  },
  courseDesc: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 18,
  },
  authorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginTop: SPACING.sm,
  },
  favoriteButton: {
    margin: 0,
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
  },
});
