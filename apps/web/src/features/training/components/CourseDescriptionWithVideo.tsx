import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";

import styles from "./CourseDescriptionWithVideo.module.css";

import { getEmbeddedVideoInfo } from "@/utils";

interface Props {
  description: string | null;
  videoUrl?: string | null;
}

const CourseDescriptionWithVideo = memo(function CourseDescriptionWithVideo({
  description,
  videoUrl,
}: Props) {
  const videoInfo = useMemo(() => (videoUrl ? getEmbeddedVideoInfo(videoUrl) : null), [videoUrl]);

  if (!videoUrl)
    return (
      <details className={styles.details}>
        <summary className={styles.summary}>Описание курса</summary>
        <ReactMarkdown>{description ?? ""}</ReactMarkdown>
      </details>
    );

  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Описание курса</summary>
      <div className={styles.markdownContent}>
        <ReactMarkdown>{description ?? ""}</ReactMarkdown>
      </div>

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
    </details>
  );
});

export default CourseDescriptionWithVideo;
