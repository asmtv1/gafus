import { useRef, type TouchEvent } from "react";
import { ApiError } from "../../shared/api/client";
export const errorCopy = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сессия завершена. Войдите снова.";
    if (error.status === 403) return "Нет доступа к этому альбому.";
    if (error.status === 404) return "Альбом недоступен или удалён.";
  }
  return "Не удалось загрузить фотоальбомы.";
};

export function nextMediaRefresh<T extends { urlsExpireAt: string | null; status?: string }>(
  pages: { items: T[] }[] | undefined,
): number | false {
  const items = pages?.flatMap((p) => p.items);
  // Next periodically checks processing and moving photos even after reload.
  // A page containing no signed URLs must still advance to READY/FAILED.
  if (
    items?.some((p) => p.status === "pending" || p.status === "processing" || p.status === "moving")
  )
    return 3000;
  const future = items
    ?.map((p) => (p.urlsExpireAt ? Date.parse(p.urlsExpireAt) : NaN))
    .filter((x) => Number.isFinite(x));
  if (!future?.length) return false;
  // setTimeout accepts only signed 32-bit delay. Without clamping, a
  // far-future expiry wraps to 1ms and floods private Gallery GET requests.
  const earliestExpiry = Math.min(...future);
  // If the API keeps returning an already expired signature, an immediate
  // refetch cannot fix it. Back off rather than flooding GETs every second.
  // Pending/processing rows above still retain their three-second cadence.
  if (earliestExpiry <= Date.now()) return 30_000;
  const untilRefresh = earliestExpiry - Date.now() - 15_000;
  return Math.max(1000, Math.min(300_000, untilRefresh));
}


/** Finger swipe on the fullscreen image surface only, never on dialog controls.
 * Long vertical drags, taps and multi-touch gestures must not change photos. */
export function useGallerySwipe(move: (delta: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event: TouchEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        event.touches.length !== 1 ||
        (target instanceof Element && target.closest("button,a,input,select,textarea"))
      ) {
        start.current = null;
        return;
      }
      const point = event.touches[0];
      if (point) start.current = { x: point.clientX, y: point.clientY };
    },
    onTouchEnd: (event: TouchEvent<HTMLDivElement>) => {
      const initial = start.current;
      start.current = null;
      if (!initial || event.changedTouches.length !== 1 || event.touches.length !== 0) return;
      const point = event.changedTouches[0];
      if (!point) return;
      const dx = point.clientX - initial.x;
      const dy = point.clientY - initial.y;
      if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        move(dx < 0 ? 1 : -1);
      }
    },
    onTouchCancel: () => {
      start.current = null;
    },
  };
}
