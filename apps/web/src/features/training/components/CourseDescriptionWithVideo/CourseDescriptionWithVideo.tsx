import { memo, useMemo, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";

import styles from "./CourseDescriptionWithVideo.module.css";
import { ExpandMoreIcon } from "@shared/utils/muiImports";

import { getEmbeddedVideoInfo } from "@gafus/core/utils";
import ShareButton from "../ShareButton/ShareButton";

interface Props {
  description: string | null;
  videoUrl?: string | null;
  equipment?: string | null;
  trainingLevel?: string | null;
  courseName?: string;
  courseType?: string;
}

const CourseDescriptionWithVideo = memo(function CourseDescriptionWithVideo({
  description,
  videoUrl,
  equipment,
  trainingLevel,
  courseName,
  courseType,
}: Props) {
  const videoInfo = useMemo(() => (videoUrl ? getEmbeddedVideoInfo(videoUrl) : null), [
    videoUrl]);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState<boolean>(false);

  const handleToggleDescription = useCallback(() => {
    setIsDescriptionOpen(prev => !prev);
  }, []);

  // Функция для получения текста уровня сложности
  const getTrainingLevelText = useCallback((level: string | null) => {
    switch (level) {
      case "BEGINNER":
        return "Начальный";
      case "INTERMEDIATE":
        return "Средний";
      case "ADVANCED":
        return "Продвинутый";
      case "EXPERT":
        return "Экспертный";
      default:
        return "Не указан";
    }
  }, []);

  return (
    <div className={`${styles.descriptionContainer} ${isDescriptionOpen ? styles.expanded : ''}`}>
      <div 
        className={styles.descriptionHeader} 
        onClick={handleToggleDescription}
      >
        <h3 className={styles.descriptionTitle}>Описание курса</h3>
        <div className={styles.expandControl}>
          <span className={styles.expandText}>
            {isDescriptionOpen ? "Скрыть" : "Подробнее"}
          </span>
          <ExpandMoreIcon 
            className={`${styles.expandIcon} ${isDescriptionOpen ? styles.expanded : ''}`} 
          />
        </div>
      </div>
      <div className={`${styles.descriptionContent} ${isDescriptionOpen ? styles.expanded : styles.collapsed}`}>
        <ReactMarkdown>{description ?? ""}</ReactMarkdown>

        {(equipment || trainingLevel) && (
          <div className={styles.courseInfo}>
            {trainingLevel && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Уровень сложности:</span>
                <span className={styles.infoValue}>{getTrainingLevelText(trainingLevel)}</span>
              </div>
            )}
            {equipment && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Необходимое оборудование:</span>
                <span className={styles.infoValue}>{equipment}</span>
              </div>
            )}
          </div>
        )}

        {videoInfo && videoInfo.embedUrl && (
          <div className={styles.videoContainer}>
            <h3>Видео презентация курса:</h3>
            <div
              className={`${styles.videoWrapper} ${videoInfo.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
            >
              <iframe
                src={videoInfo.embedUrl}
                title="Видео презентация курса"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className={styles.videoIframe}
              />
            </div>
          </div>
        )}

        {/* Кнопка поделиться в конце контента */}
        {courseName && courseType && (
          <div className={styles.shareButtonContainer}>
            <ShareButton 
              courseName={courseName}
              courseType={courseType}
              courseDescription={description || undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default CourseDescriptionWithVideo;
