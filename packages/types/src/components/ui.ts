export interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  index?: number;
  isAboveFold?: boolean;
  isCritical?: boolean;
  placeholder?: string;
  unoptimized?: boolean;
  priority?: boolean;
  loading?: "lazy" | "eager";
  onError?: () => void;
  style?: React.CSSProperties;
}

export interface CoursesSkeletonProps {
  count?: number;
}

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}
