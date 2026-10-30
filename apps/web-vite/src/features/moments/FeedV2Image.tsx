import { useEffect, useRef, useState } from "react";
import type { FeedV2ImageMedia } from "@gafus/types";
import {mediaCdnKindFromSignedUrl,probeCdnOutage} from "@gafus/core-client/media-delivery";
import {sameOriginCdnProbeFetch} from "../../shared/api/cdnProbe";
import {requestFeedImageFallback} from "./FeedCdnImage";
import "./feed-v2-media.css";

/** The encoder constrains the LONG edge, not the width. srcset must advertise
 * the actual nominal width for portraits; 360w/720w would overstate both. */
export function feedV2VariantWidth(width: number, height: number, maxEdge: 360 | 720): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return maxEdge;
  return Math.max(1, Math.min(width, Math.round(width * Math.min(1, maxEdge / Math.max(width, height)))));
}

/** No full-sized download until the viewer is open. Original aspect ratio is preserved. */
export function FeedV2Image({ media, firstVisible = false, alt = "Фото публикации" }: {
  media: FeedV2ImageMedia; firstVisible?: boolean; alt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [previewFallback,setPreviewFallback]=useState<string|null>(null);
  const [fullFallback,setFullFallback]=useState<string|null>(null);
  const previewAttempted=useRef(false);
  const fullAttempted=useRef(false);
  const generation=useRef(0);
  useEffect(()=>{
    generation.current++;
    previewAttempted.current=false;fullAttempted.current=false;
    setPreviewFallback(null);setFullFallback(null);
    const current=generation;
    return ()=>{current.current++;};
  },[media.id,media.urls.medium,media.urls.large]);
  const smallWidth = feedV2VariantWidth(media.width, media.height, 360);
  const mediumWidth = feedV2VariantWidth(media.width, media.height, 720);
  const srcSet = smallWidth === mediumWidth
    ? `${media.urls.medium} ${mediumWidth}w`
    : `${media.urls.small} ${smallWidth}w, ${media.urls.medium} ${mediumWidth}w`;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const attemptFallback=(url:string,variant:"thumb"|"full",attempted:{current:boolean},
    apply:(next:string)=>void)=>{
    if(attempted.current||mediaCdnKindFromSignedUrl(url)!=="feed")return;
    attempted.current=true;
    const current=generation.current;
    void (async()=>{
      if(!await probeCdnOutage(url,{fetcher:sameOriginCdnProbeFetch,timeoutMs:8500}))
        return;
      const next=await requestFeedImageFallback(media.id,variant);
      if(generation.current===current)apply(next);
    })().catch(()=>undefined);
  };
  return <>
    <button ref={ref} type="button" className="feed-v2-image-open"
      aria-label="Открыть фотографию полностью" onClick={() => setOpen(true)}>
      <img className="feed-v2-image" src={previewFallback??media.urls.medium}
        srcSet={previewFallback?undefined:srcSet}
        onError={()=>attemptFallback(media.urls.medium,"thumb",previewAttempted,setPreviewFallback)}
        sizes="(max-width: 720px) 100vw, 720px" alt={alt}
        width={media.width} height={media.height}
        loading={firstVisible ? "eager" : "lazy"}
        fetchPriority={firstVisible ? "high" : "auto"} decoding="async" referrerPolicy="no-referrer" />
    </button>
    {open && <div className="feed-v2-lightbox" role="presentation"
      onClick={() => { setOpen(false); ref.current?.focus(); }}>
      <div role="dialog" aria-modal="true" aria-label="Просмотр фотографии" className="feed-v2-lightbox-inner"
        onClick={event => event.stopPropagation()}>
        <button type="button" className="feed-v2-lightbox-close" aria-label="Закрыть"
          onClick={() => { setOpen(false); ref.current?.focus(); }}>×</button>
        <img src={fullFallback??media.urls.large} alt={alt} width={media.width} height={media.height}
          onError={()=>attemptFallback(media.urls.large,"full",fullAttempted,setFullFallback)}
          referrerPolicy="no-referrer" />
      </div>
    </div>}
  </>;
}
