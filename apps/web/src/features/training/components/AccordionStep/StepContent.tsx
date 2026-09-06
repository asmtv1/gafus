"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import ImageViewer from "@shared/components/ui/ImageViewer";

import type { StepType } from "./types";

import styles from "./AccordionStep.module.css";

function StepImageViewer({
  src,
  alt,
  width,
  height,
  className,
  thumbnailClassName,
  priority,
  loading,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  thumbnailClassName?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
}) {
  return (
    <ImageViewer
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      thumbnailClassName={thumbnailClassName}
      priority={priority}
      loading={loading}
    />
  );
}

interface StepContentProps {
  stepDescription?: string;
  imageUrls?: string[];
  stepTitle: string;
  type: StepType | undefined;
}

export function StepContent({
  stepDescription,
  imageUrls,
  stepTitle,
  type,
}: StepContentProps) {
  const hasDescription = !!stepDescription;
  const hasImages = imageUrls && imageUrls.length > 0 && type !== "BREAK";

  if (!hasDescription && !hasImages) return null;

  return (
    <>
      {hasDescription && (
        <div className={styles.stepInfo}>
          <div>
            <div className={styles.sectionTitle}>Описание:</div>
            <div className={`${styles.cardSection} ${styles.markdownContent}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stepDescription}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      {hasImages && (
        <div className={styles.stepInfo}>
          <div>
            <div className={styles.sectionTitle}>Изображения:</div>
            <div className={styles.imagesGrid}>
              {imageUrls!.map((imageUrl, index) => (
                <StepImageViewer
                  key={index}
                  src={imageUrl}
                  alt={`Изображение ${index + 1} для шага "${stepTitle}"`}
                  width={300}
                  height={200}
                  className={styles.stepImage}
                  thumbnailClassName={styles.imageContainer}
                  priority={index === 0}
                  loading={index === 0 ? "eager" : "lazy"}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
