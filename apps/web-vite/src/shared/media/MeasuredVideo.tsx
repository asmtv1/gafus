import { forwardRef, useCallback, useRef, type ComponentPropsWithoutRef } from "react";
import { apiRequest } from "../api/client";
import { observeFirstVideoFrame } from "./observeFirstVideoFrame";
type Surface = "moments" | "chat" | "training" | "preview";
type Props = ComponentPropsWithoutRef<"video"> & { frameSurface: Surface };
/** The element remains native; existing playback controls/ref are unchanged. */
export const MeasuredVideo = forwardRef<HTMLVideoElement, Props>(function MeasuredVideo(
  { frameSurface, ...props }, forwardedRef,
) {
  const detach = useRef<(() => void) | undefined>(undefined);
  const attach = useCallback((node: HTMLVideoElement | null) => {
    detach.current?.();
    detach.current = undefined;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
    if (node) {
      detach.current = observeFirstVideoFrame(node, event => {
        void apiRequest("/api/v1/video-quality/first-frame", {
          method: "POST", json: { platform: "web", surface: frameSurface, ...event },
          browserAuth: true,
        }).catch(() => undefined);
      });
    }
  }, [forwardedRef, frameSurface]);
  return <video {...props} ref={attach} />;
});
