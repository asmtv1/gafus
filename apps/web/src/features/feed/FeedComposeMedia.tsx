"use client";

import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AddPhotoAlternateOutlined,
  ArrowBackRounded,
  ArrowForwardRounded,
  CloseRounded,
  MovieOutlined,
} from "@mui/icons-material";
import type { FeedBrowserAsset } from "./upload";
import styles from "./FeedComposeMedia.module.css";

interface FeedComposeMediaProps {
  files: readonly FeedBrowserAsset[];
  disabled: boolean;
  remaining: number;
  onSelect: (files: FileList | null) => void;
  onMove: (index: number, direction: number) => void;
  onRemove: (id: string) => void;
}

function FilePreview({
  asset, index, total, disabled, onMove, onRemove,
}: {
  asset: FeedBrowserAsset;
  index: number;
  total: number;
  disabled: boolean;
  onMove: (index: number, direction: number) => void;
  onRemove: (id: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const video = asset.file.type.startsWith("video/");

  useEffect(() => {
    const url = URL.createObjectURL(asset.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [asset.file]);

  return (
    <li className={styles.previewCard}>
      <div className={styles.previewImage}>
        {previewUrl ? (
          video ? (
            <video
              src={previewUrl}
              aria-label={"Видео: " + asset.file.name}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            // Local object URLs must not go through Next Image optimization.
            <img src={previewUrl} alt={"Выбранное фото: " + asset.file.name} />
          )
        ) : (
          <span className={styles.previewPending} aria-label="Подготавливаем предпросмотр">
            {video ? <MovieOutlined aria-hidden="true" /> : <AddPhotoAlternateOutlined aria-hidden="true" />}
          </span>
        )}
        <span className={styles.orderBadge}>{index + 1}</span>
        <button
          type="button"
          className={styles.removeButton}
          onClick={() => onRemove(asset.requestId)}
          disabled={disabled}
          aria-label={"Убрать вложение: " + asset.file.name}
          title="Убрать вложение"
        >
          <CloseRounded fontSize="small" aria-hidden="true" />
        </button>
      </div>
      <div className={styles.previewDescription}>
        <span className={styles.fileName} title={asset.file.name}>{asset.file.name}</span>
        <span className={styles.fileSize}>{(asset.file.size / (1024 * 1024)).toFixed(1)} МиБ</span>
      </div>
      {total > 1 && (
        <div className={styles.reorderButtons} aria-label={"Порядок вложения " + (index + 1)}>
          <button
            type="button"
            disabled={disabled || index === 0}
            onClick={() => onMove(index, -1)}
            aria-label={"Переместить " + asset.file.name + " влево"}
            title="Влево"
          >
            <ArrowBackRounded fontSize="small" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={disabled || index === total - 1}
            onClick={() => onMove(index, 1)}
            aria-label={"Переместить " + asset.file.name + " вправо"}
            title="Вправо"
          >
            <ArrowForwardRounded fontSize="small" aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

/** Preview selected files before uploading, with scoped object URLs per file. */
export function FeedComposeMedia({
  files, disabled, remaining, onSelect, onMove, onRemove,
}: FeedComposeMediaProps) {
  const [dragging, setDragging] = useState(false);
  const canAdd = !disabled && remaining > 0;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (canAdd && event.dataTransfer.files.length) onSelect(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(event.target.files);
    // Selecting a previously removed file must trigger change again.
    event.target.value = "";
  };

  return (
    <section className={styles.mediaSection} aria-label="Фото и видео для публикации">
      <div className={styles.mediaHeading}>
        <h2>Фото и видео</h2>
        <span className={styles.mediaCounter} aria-live="polite">
          {files.length} выбрано
        </span>
      </div>
      <p className={styles.mediaHint}>До 10 вложений, не более 3 видео. Можно менять порядок.</p>
      <div
        className={[styles.uploadZone, dragging && styles.uploadZoneActive, !canAdd && styles.uploadZoneDisabled]
          .filter(Boolean).join(" ")}
        onDragOver={event => {
          event.preventDefault();
          if (canAdd) setDragging(true);
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <label className={styles.filePicker}>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            disabled={!canAdd}
            onChange={handleChange}
            aria-label="Выбрать фотографии или видео"
          />
          <AddPhotoAlternateOutlined aria-hidden="true" className={styles.uploadIcon} />
          <span className={styles.uploadTitle}>
            {remaining > 0 ? "Добавить фото или видео" : "Достигнут лимит вложений"}
          </span>
          <span className={styles.uploadCaption}>Выберите файлы или перетащите сюда</span>
        </label>
      </div>
      {files.length > 0 && (
        <>
          <div className={styles.previewHeading}>
            <strong>Выбранные файлы</strong>
            <span>Порядок показа слева направо</span>
          </div>
          <ul className={styles.previewGrid}>
            {files.map((asset, index) => (
              <FilePreview
                key={asset.requestId}
                asset={asset}
                index={index}
                total={files.length}
                disabled={disabled}
                onMove={onMove}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
