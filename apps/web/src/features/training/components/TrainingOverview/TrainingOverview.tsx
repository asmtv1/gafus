import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./TrainingOverview.module.css";

import type { TrainingOverviewProps } from "./types";

export const TrainingOverview = memo(function TrainingOverview({
  title,
  description,
  duration,
}: TrainingOverviewProps) {
  return (
    <div>
      <h1>{title}</h1>
      <div className={styles.markdownContent}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{description ?? ""}</ReactMarkdown>
      </div>
      <p>Продолжительность тренировки сегодня: {duration} минут</p>
    </div>
  );
});
