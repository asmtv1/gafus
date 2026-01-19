// UI-специфичные типы для FavoriteButton

export interface FavoriteButtonProps {
  id: string;
  isFavorite?: boolean;
  onUnfavorite?: (courseId: string) => void;
}
