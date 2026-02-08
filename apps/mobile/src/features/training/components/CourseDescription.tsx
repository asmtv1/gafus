import { useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Surface } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, SPACING } from "@/constants";

interface CourseDescriptionProps {
  description: string | null;
  equipment?: string | null;
  trainingLevel?: string | null;
}

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
  EXPERT: "Экспертный",
};

/**
 * Компонент описания курса с возможностью сворачивания/разворачивания (как на web)
 */
export function CourseDescription({
  description,
  equipment,
  trainingLevel,
}: CourseDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Улучшенный парсер Markdown с поддержкой жирного текста, курсива, эмодзи и ссылок
  const renderMarkdown = (text: string) => {
    if (!text) return null;

    // Разбиваем на строки
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let listItems: string[] = [];
    let inList = false;

    // Функция для рендеринга текста с поддержкой жирного, курсива и эмодзи
    const renderTextWithFormatting = (text: string, style: any) => {
      // Паттерны для markdown форматирования
      const boldPattern = /\*\*(.+?)\*\*/g;
      const _italicPattern = /\*(.+?)\*/g;
      const _parts: React.ReactNode[] = [];
      const _lastIndex = 0;
      let key = 0;

      // Сначала обрабатываем жирный текст
      let match;
      const processedText = text;
      const segments: { text: string; bold?: boolean; italic?: boolean }[] = [];

      // Находим все жирные фрагменты
      const boldMatches: { start: number; end: number; text: string }[] = [];
      while ((match = boldPattern.exec(processedText)) !== null) {
        boldMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[1],
        });
      }

      // Находим все курсивные фрагменты (не внутри жирного)
      const italicMatches: { start: number; end: number; text: string }[] = [];
      const italicPattern2 = /(?<!\*)\*([^*]+?)\*(?!\*)/g;
      while ((match = italicPattern2.exec(processedText)) !== null) {
        // Проверяем, не находится ли внутри жирного
        const isInsideBold = boldMatches.some(
          (b) => match!.index >= b.start && match!.index < b.end,
        );
        if (!isInsideBold) {
          italicMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[1],
          });
        }
      }

      // Сортируем все совпадения
      const allMatches = [
        ...boldMatches.map((m) => ({ ...m, type: "bold" as const })),
        ...italicMatches.map((m) => ({ ...m, type: "italic" as const })),
      ].sort((a, b) => a.start - b.start);

      // Строим сегменты
      let currentIndex = 0;
      allMatches.forEach((match) => {
        if (match.start > currentIndex) {
          segments.push({ text: processedText.substring(currentIndex, match.start) });
        }
        segments.push({
          text: match.text,
          bold: match.type === "bold",
          italic: match.type === "italic",
        });
        currentIndex = match.end;
      });
      if (currentIndex < processedText.length) {
        segments.push({ text: processedText.substring(currentIndex) });
      }

      if (segments.length === 0) {
        segments.push({ text: processedText });
      }

      return (
        <Text key={key++} style={style}>
          {segments.map((segment, idx) => {
            if (segment.bold && segment.italic) {
              return (
                <Text key={idx} style={[style, styles.markdownBold, styles.markdownItalic]}>
                  {segment.text}
                </Text>
              );
            }
            if (segment.bold) {
              return (
                <Text key={idx} style={[style, styles.markdownBold]}>
                  {segment.text}
                </Text>
              );
            }
            if (segment.italic) {
              return (
                <Text key={idx} style={[style, styles.markdownItalic]}>
                  {segment.text}
                </Text>
              );
            }
            return segment.text;
          })}
        </Text>
      );
    };

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(" ");
        elements.push(
          <View key={`p-${elements.length}`} style={styles.paragraphContainer}>
            {renderTextWithFormatting(paragraphText, styles.markdownParagraph)}
          </View>,
        );
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <View key={`list-${elements.length}`} style={styles.listContainer}>
            {listItems.map((item, idx) => (
              <View key={idx} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <View style={styles.listTextContainer}>
                  {renderTextWithFormatting(item.trim(), styles.listText)}
                </View>
              </View>
            ))}
          </View>,
        );
        listItems = [];
        inList = false;
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Заголовки
      if (trimmed.startsWith("# ")) {
        flushParagraph();
        flushList();
        const title = trimmed.replace(/^#+\s/, "");
        elements.push(
          <View key={`h1-${index}`} style={styles.headingContainer}>
            {renderTextWithFormatting(title, styles.markdownH1)}
          </View>,
        );
        return;
      }
      if (trimmed.startsWith("## ")) {
        flushParagraph();
        flushList();
        const title = trimmed.replace(/^#+\s/, "");
        elements.push(
          <View key={`h2-${index}`} style={styles.headingContainer}>
            {renderTextWithFormatting(title, styles.markdownH2)}
          </View>,
        );
        return;
      }
      if (trimmed.startsWith("### ")) {
        flushParagraph();
        flushList();
        const title = trimmed.replace(/^#+\s/, "");
        elements.push(
          <View key={`h3-${index}`} style={styles.headingContainer}>
            {renderTextWithFormatting(title, styles.markdownH3)}
          </View>,
        );
        return;
      }

      // Списки
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        flushParagraph();
        if (!inList) inList = true;
        listItems.push(trimmed.replace(/^[-*]\s/, ""));
        return;
      }

      // Обычный текст
      if (trimmed) {
        flushList();
        currentParagraph.push(trimmed);
      } else {
        flushParagraph();
        flushList();
      }
    });

    flushParagraph();
    flushList();

    return elements.length > 0 ? (
      elements
    ) : (
      <View style={styles.paragraphContainer}>
        {renderTextWithFormatting(text, styles.markdownParagraph)}
      </View>
    );
  };

  const getTrainingLevelText = (level: string | null) => {
    if (!level) return "Не указан";
    return LEVEL_LABELS[level] || level;
  };

  if (!description) return null;

  return (
    <View style={styles.container}>
      <Pressable onPress={handleToggle}>
        <Surface style={[styles.header, isExpanded && styles.headerExpanded]} elevation={1}>
          <Text variant="titleMedium" style={styles.title}>
            Описание курса
          </Text>
          <View style={styles.expandControl}>
            <Text style={styles.expandText}>{isExpanded ? "Скрыть" : "Подробнее"}</Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={24}
              color={COLORS.primary}
              style={[styles.expandIcon, isExpanded && styles.expandIconExpanded]}
            />
          </View>
        </Surface>
      </Pressable>

      {isExpanded && (
        <View style={styles.content}>
          <Surface style={styles.contentSurface} elevation={1}>
            <View style={styles.markdownContainer}>
              {renderMarkdown(description)}

              {(equipment || trainingLevel) && (
                <View style={styles.courseInfo}>
                  {trainingLevel && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Уровень сложности:</Text>
                      <Text style={styles.infoValue}>{getTrainingLevelText(trainingLevel)}</Text>
                    </View>
                  )}
                  {equipment && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Необходимое оборудование:</Text>
                      <Text style={styles.infoValue}>{equipment}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </Surface>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderWidth: 1,
    borderColor: "#636128",
    borderRadius: 12,
  },
  headerExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  title: {
    fontWeight: "600",
    color: "#352E2E",
    flex: 1,
  },
  expandControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  expandText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#636128",
  },
  expandIcon: {
    transform: [{ rotate: "0deg" }],
  },
  expandIconExpanded: {
    transform: [{ rotate: "180deg" }],
  },
  content: {
    // Высота определяется контентом (max-content)
  },
  contentSurface: {
    backgroundColor: "#ECE5D2",
    borderWidth: 1,
    borderColor: "#636128",
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  markdownContainer: {
    padding: SPACING.md,
  },
  paragraphContainer: {
    marginBottom: SPACING.sm,
  },
  headingContainer: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  markdownParagraph: {
    fontSize: 14,
    lineHeight: 20,
    color: "#352E2E",
  },
  markdownBold: {
    fontWeight: "600",
    color: "#352E2E",
  },
  markdownItalic: {
    fontStyle: "italic",
    color: "#5a5249",
  },
  markdownH1: {
    fontSize: 20,
    fontWeight: "600",
    color: "#352E2E",
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  markdownH2: {
    fontSize: 18,
    fontWeight: "600",
    color: "#352E2E",
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  markdownH3: {
    fontSize: 16,
    fontWeight: "600",
    color: "#352E2E",
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  listContainer: {
    marginLeft: SPACING.md,
    marginBottom: SPACING.sm,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: SPACING.xs,
  },
  listBullet: {
    fontSize: 16,
    color: "#352E2E",
    marginRight: SPACING.xs,
  },
  listText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#352E2E",
  },
  listTextContainer: {
    flex: 1,
  },
  courseInfo: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: "#F5F0E8",
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 8,
  },
  infoItem: {
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#636128",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: "#352E2E",
    paddingLeft: SPACING.xs,
  },
});
