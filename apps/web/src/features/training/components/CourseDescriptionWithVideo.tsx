import { memo, useMemo, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";

import styles from "./CourseDescriptionWithVideo.module.css";
import { ExpandMoreIcon } from "@/utils/muiImports";

import { getEmbeddedVideoInfo } from "@/utils";

interface Props {
  description: string | null;
  videoUrl?: string | null;
  equipment?: string | null;
  trainingLevel?: string | null;
}

const CourseDescriptionWithVideo = memo(function CourseDescriptionWithVideo({
  description,
  videoUrl,
  equipment,
  trainingLevel,
}: Props) {
  const videoInfo = useMemo(() => (videoUrl ? getEmbeddedVideoInfo(videoUrl) : null), [videoUrl]);
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

  if (!videoUrl) {
    return (
      <div className={`${styles.descriptionContainer} ${isDescriptionOpen ? styles.expanded : ''}`}>
        <div 
          className={styles.descriptionHeader} 
          onClick={handleToggleDescription}
        >
          <h3 className={styles.descriptionTitle}>Описание курса</h3>
          <ExpandMoreIcon 
            className={`${styles.expandIcon} ${isDescriptionOpen ? styles.expanded : ''}`} 
          />
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
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.descriptionContainer} ${isDescriptionOpen ? styles.expanded : ''}`}>
      <div 
        className={styles.descriptionHeader} 
        onClick={handleToggleDescription}
      >
        <h3 className={styles.descriptionTitle}>Описание курса</h3>
        <ExpandMoreIcon 
          className={`${styles.expandIcon} ${isDescriptionOpen ? styles.expanded : ''}`} 
        />
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

        {videoInfo && (
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
      </div>
    </div>
  );
});

export default CourseDescriptionWithVideo;
