import { mobilePerformance } from "@/shared/lib/telemetry/mobilePerformance";
import { forwardRef, useLayoutEffect, useMemo, useRef, type ComponentRef } from "react";
import { VideoView, type VideoViewProps } from "expo-video";
import { Platform } from "react-native";
import { apiClient } from "@/shared/lib/api/client";
import { createNativeFrameObservation } from "@/shared/lib/media/firstFrameObservation";

type Props = VideoViewProps & { frameSurface: "moments" | "chat" | "training" | "preview" };
/** Preserve the actual Expo view and imperative handle. Only the first
 * onFirstFrameRender for an attached player/view is counted. */
export const MeasuredVideoView = forwardRef<ComponentRef<typeof VideoView>, Props>(function MeasuredVideoView(
  { frameSurface, player, onFirstFrameRender, ...props }, ref,
) {
  const attachment = useMemo(() => ({}), [player, frameSurface]);
  const observation = useRef<{ attachment: object; current: ReturnType<typeof createNativeFrameObservation> } | null>(null);
  useLayoutEffect(() => {
    if (!player || (Platform.OS !== "ios" && Platform.OS !== "android")) return;
    const platform = Platform.OS;
    const current = createNativeFrameObservation(() => performance.now(), event => {
      if(event.outcome==="rendered")mobilePerformance.record(frameSurface==="chat"?"CHAT_FIRST_FRAME":frameSurface==="training"?"TRAINING_FIRST_FRAME":frameSurface==="moments"?"MOMENTS_FIRST_FRAME":"VIDEO_FIRST_FRAME",event.elapsedMs);
      void apiClient("/api/v1/video-quality/first-frame", {
        method: "POST", body: { platform, surface: frameSurface, ...event },
        skipAuthRefreshReplay: true,
      }).catch(() => { /* diagnostic: expected First-frame analytics never affect actual playback. */ return undefined; });
    });
    observation.current = { attachment, current };
    return () => {
      if (observation.current?.attachment === attachment) observation.current = null;
      current.dispose();
    };
  }, [player, frameSurface, attachment]);
  return <VideoView {...props} player={player} ref={ref}
    onFirstFrameRender={() => {
      if (observation.current?.attachment === attachment) observation.current.current.firstFrame();
      onFirstFrameRender?.();
    }} />;
});
