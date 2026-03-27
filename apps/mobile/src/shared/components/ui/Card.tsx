import { StyleSheet, type ViewStyle } from "react-native";
import { Card as PaperCard, type CardProps as PaperCardProps } from "react-native-paper";
import { BORDER_RADIUS, SPACING, COLORS } from "@/constants";

interface CardProps extends Omit<PaperCardProps, "elevation"> {
  children: React.ReactNode;
}

/**
 * Карточка над Paper Card.
 * По умолчанию elevated (тень); для overflow: hidden без предупреждения Surface используйте mode="contained".
 */
export function Card({ children, style, mode = "elevated", ...props }: CardProps) {
  return (
    <PaperCard mode={mode} style={[styles.card, style as ViewStyle]} {...props}>
      {children}
    </PaperCard>
  );
}

// Подкомпоненты для удобства
Card.Cover = PaperCard.Cover;
Card.Content = PaperCard.Content;
Card.Title = PaperCard.Title;
Card.Actions = PaperCard.Actions;

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
});
