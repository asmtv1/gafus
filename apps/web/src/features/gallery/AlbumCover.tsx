"use client";

import { useState } from "react";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import styles from "./Gallery.module.css";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { galleryApi } from "./api";

/** Cover URLs are signed and can expire; a broken URL should not show a browser error icon. */
export function AlbumCover({
  albumId,
  coverPhotoId,
  url,
  onLoadError,
}: {
  albumId: string;
  coverPhotoId?: string | null;
  url?: string | null;
  onLoadError: (id: string) => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <div className={`${styles.thumb} ${styles.placeholder}`}>
        <CollectionsOutlinedIcon aria-hidden="true" className={styles.placeholderIcon} />
        <span>{url ? "Обложка недоступна" : "Нет обложки"}</span>
      </div>
    );
  }
  return (
    coverPhotoId ? <CdnImage
      source={url}
      requestFallback={() => galleryApi.requestMediaFallback(coverPhotoId, "thumb")}
      alt=""
      className={styles.thumb}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailedUrl(url);
        onLoadError(albumId);
      }}
    /> : <img src={url} alt="" className={styles.thumb} loading="lazy" referrerPolicy="no-referrer"
      onError={() => { setFailedUrl(url); onLoadError(albumId); }} />
  );
}
