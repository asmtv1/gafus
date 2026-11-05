import { useEffect, useRef, useState } from "react";
import "./video-quality-settings.css";

export type VideoQualityMode = "auto" | 360 | 720;
const options: readonly VideoQualityMode[] = ["auto", 360, 720];

/** Overlay inside an MP4 player, never an always-visible bar below the video. */
export function VideoQualitySettings({ value, onChange, available }: {
  value: VideoQualityMode;
  onChange: (mode: VideoQualityMode) => void;
  available: { 360?: string; 720?: string } | undefined | null;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const both = Boolean(available?.[360] && available?.[720]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!both) return null;
  return <div className="video-quality-settings" ref={root}>
    <button type="button" className="video-quality-settings__trigger"
      aria-label="Настройки качества видео" aria-haspopup="true" aria-expanded={open}
      title="Качество видео" onClick={() => setOpen(previous => !previous)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.3 2.7 10 4.3a8 8 0 0 0-2.3 1.3L6.1 5 4.4 7.9l1.3 1.2a8 8 0 0 0 0 2.8l-1.3 1.2 1.7 2.9 1.6-.6a8 8 0 0 0 2.3 1.3l.3 1.6h3.4l.3-1.6a8 8 0 0 0 2.3-1.3l1.6.6 1.7-2.9-1.3-1.2a8 8 0 0 0 0-2.8l1.3-1.2-1.7-2.9-1.6.6a8 8 0 0 0-2.3-1.3l-.3-1.6h-3.4Z" transform="translate(0 1.5)" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
    </button>
    {open && <div className="video-quality-settings__menu" role="group" aria-label="Качество видео">
      <div className="video-quality-settings__heading">Качество</div>
      {options.map(mode => <button key={mode} type="button" aria-pressed={value === mode}
        className={value === mode ? "video-quality-settings__selected" : ""}
        onClick={() => { onChange(mode); setOpen(false); }}>
        <span>{mode === "auto" ? "Авто" : `${mode}p`}</span>
        {value === mode && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>;
}
