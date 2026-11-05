import { useLayoutEffect, useState } from "react";
import { SecondaryButton } from "../../shared/ui";

type LocalPreview = { file: File; url: string };

/** Display only local, user-selected files; never upload while rendering.
 * Object URLs are owned by this leaf and revoked on replacement/unmount.
 */
export function MomentLocalMediaPreview({ files, disabled, onRemove, failures, onRetry }: {
  files: readonly File[];
  disabled: boolean;
  failures?: readonly (string | undefined)[];
  onRetry?: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const [previews, setPreviews] = useState<LocalPreview[]>([]);
  // Layout effect prevents the surviving video/photo from briefly disappearing
  // while new blob URLs are created after removing a neighboring attachment.
  useLayoutEffect(() => {
    if (!files.length || typeof URL.createObjectURL !== "function") {
      setPreviews([]);
      return;
    }
    const next = files.map(file => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => {
      next.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, [files]);
  if (!files.length) return null;
  return <div className="web4-compose-media-selected" aria-label="Выбранные вложения">
    <ul className="web4-compose-media-preview">
      {files.map((file, index) => {
        const url = previews[index]?.file === file ? previews[index].url : null;
        const isVideo = file.type.startsWith("video/");
        return <li key={`${file.name}-${file.lastModified}-${index}`}>
          <div className="web4-compose-media-frame">
            {url ? isVideo ?
              <video src={url} controls playsInline preload="auto"
                aria-label={`Предпросмотр видео ${file.name}`}/> :
              <img src={url} alt={`Предпросмотр фото ${file.name}`} /> :
              <span role="status">Подготавливаем предпросмотр…</span>}
            <span className="web4-compose-media-kind">{isVideo ? "Видео" : "Фото"}</span>
            {failures?.[index] && onRetry && <button type="button"
              className="web4-video-retry"
              aria-label={`Повторить обработку ${isVideo ? "видео" : "фото"} ${file.name}`}
              title={`Повторить подготовку и отправку только этого ${isVideo ? "видео" : "фото"}`} disabled={disabled}
              onClick={() => onRetry(index)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.3 6M20 4v7h-7" />
              </svg>
            </button>}
          </div>
          {failures?.[index] && <p role="alert" className="web4-video-retry-error">
            {failures[index]}
          </p>}
          <div className="web4-compose-media-caption">
            <span title={file.name}>{file.name}</span>
            <SecondaryButton variant="red" type="button" disabled={disabled}
              aria-label={`Убрать файл ${file.name}`}
              className="web4-compose-media-remove" title="Убрать вложение"
              onClick={() => onRemove(index)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6 18 18M18 6 6 18"/>
              </svg>
            </SecondaryButton>
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
