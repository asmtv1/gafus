import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";

import styles from "./CourseDescriptionWithVideo.module.css";

import { getEmbeddedVideoInfo } from "@/utils";

interface Props {
  description: string | null;
  videoUrl?: string | null;
}

const CourseDescriptionWithVideo = memo(function CourseDescriptionWithVideo({ description, videoUrl }: Props) {
  if (!videoUrl)
    return (
      <details className={styles.details}>
        <summary className={styles.summary}>Описание курса</summary>
        <ReactMarkdown>{description ?? ""}</ReactMarkdown>
      </details>
    );

  const { embedUrl, isShorts } = useMemo(() => getEmbeddedVideoInfo(videoUrl), [videoUrl]);

  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Описание курса</summary>
      <div className={styles.markdownContent}>
        <ReactMarkdown>{description ?? ""}</ReactMarkdown>
      </div>

      <div className={styles.videoContainer}>
        <h3>Видео презентация курса:</h3>
        <div
          className={`${styles.videoWrapper} ${isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
        >
          <iframe
            src={embedUrl}
            title="Видео презентация курса"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={styles.videoIframe}
          />
        </div>
      </div>
    </details>
  );
});

export default CourseDescriptionWithVideo;
