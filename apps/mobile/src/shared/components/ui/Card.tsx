import { StyleSheet, type ViewStyle } from "react-native";
import { Card as PaperCard, type CardProps as PaperCardProps } from "react-native-paper";
import { BORDER_RADIUS, SPACING, COLORS } from "@/constants";

interface CardProps extends Omit<PaperCardProps, "elevation"> {
  children: React.ReactNode;
}

/**
 * Карточка с тенью
 * Обёртка над React Native Paper Card
 */
export function Card({ children, style, ...props }: CardProps) {
  return (
    <PaperCard mode="elevated" style={[styles.card, style as ViewStyle]} {...props}>
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
