import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState } from "react";
import { loadMomentMedia, type MomentMedia } from "./momentMedia";
import { MomentVideo } from "./MomentVideo";
import { FeedCdnImage } from "./FeedCdnImage";
import { FeedV2Image } from "./FeedV2Image";

/** Media delivery is reauthorized on opening, not embedded in feed Query cache. */
export function MomentMediaGallery({
  postId,
  count,
  initialMedia,
  autoLoad = false,
  inline = false,
}: {
  postId: string;
  count: number;
  initialMedia?: MomentMedia[];
  autoLoad?: boolean;
  inline?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(inline || (autoLoad && !!initialMedia?.length));
  const [attempt, setAttempt] = useState(0);
  const [assets, setAssets] = useState<MomentMedia[]>(() => initialMedia ?? []);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  // Fetch short-lived media URLs only when a feed card approaches the viewport.
  // Details and non-IntersectionObserver environments retain manual disclosure.
  useEffect(() => {
    if (!autoLoad || count === 0 || typeof IntersectionObserver === "undefined") return;
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setExpanded(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [autoLoad, count, postId]);
  useEffect(() => {
    if (!expanded) {
      setAssets([]);
      setError(false);
      setBusy(false);
      return;
    }
    if (initialMedia) {
      setAssets(initialMedia);
      setError(false);
      setBusy(false);
      return;
    }
    const abort = new AbortController();
    setAssets([]);
    setError(false);
    setBusy(true);
    void loadMomentMedia(postId, abort.signal)
      .then((items) => {
        if (!abort.signal.aborted) setAssets(items);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [expanded, postId, attempt, initialMedia]);

  if (count === 0) return null;
  return (
    <div
      className={"moment-media-gallery" + (inline ? " moment-media-inline" : "")}
      ref={container}
    >
      {!inline && (
        <button
          type="button"
          className="moment-media-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Скрыть вложения" : "Показать вложения (" + count + ")"}
        </button>
      )}
      {expanded && busy && <Loading message="Загружаем медиа…" className="moment-media-status" />}
      {expanded && error && (
        <div className="moment-media-status" role="alert">
          <p>Вложения недоступны. Повторите загрузку.</p>
          {inline && (
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Повторить загрузку
            </button>
          )}
        </div>
      )}
      {expanded && !busy && !error && assets.length === 0 && (
        <p className="moment-media-status">Готовых вложений пока нет.</p>
      )}
      {expanded && assets.length > 0 && (
        <div className="question-media-images moment-media-grid">
          {assets.map((asset, index) => (
            <figure key={asset.id}>
              {asset.kind === "video" ? (
                <MomentVideo
                  mediaId={asset.id}
                  poster={asset.url || null}
                  mp4Urls={asset.mp4Urls}
                  width={asset.width}
                  height={asset.height}
                />
              ) : asset.smallUrl && asset.mediumUrl && asset.fullUrl ? (
                <FeedV2Image
                  media={{
                    id: asset.id,
                    kind: "image",
                    status: "ready",
                    width: asset.width ?? 720,
                    height: asset.height ?? 720,
                    access: "viewer",
                    expiresAt: null,
                    placeholder: null,
                    urls: { small: asset.smallUrl, medium: asset.mediumUrl, large: asset.fullUrl },
                  }}
                  alt={"Фото " + (index + 1)}
                  firstVisible={index === 0}
                />
              ) : asset.url ? (
                <FeedCdnImage
                  url={asset.url}
                  mediaId={asset.id}
                  variant="thumb"
                  alt={"Фото " + (index + 1)}
                />
              ) : null}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
