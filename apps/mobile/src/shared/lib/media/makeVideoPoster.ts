import { Platform } from "react-native";
import { createVideoPlayer } from "expo-video";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Persist one local frame as a JPEG so Moments can show it before the video reaches S3. */
export async function makeFeedVideoPoster(uri: string): Promise<string | undefined> {
  if (Platform.OS === "web") return undefined;
  try {
    const player = createVideoPlayer({ uri });
    player.pause();
    return await new Promise<string | undefined>(resolve => {
      let finished = false;
      let started = false;
      let subscription: { remove: () => void } | undefined;
      const finish = (poster?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        subscription?.remove();
        player.release();
        resolve(poster);
      };
      const render = async () => {
        try {
          const frames = await player.generateThumbnailsAsync(0, { maxWidth: 480, maxHeight: 480 });
          if (!frames[0]) return finish();
          const image = await ImageManipulator.manipulate(frames[0]).renderAsync();
          const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
          finish(saved.uri);
        } catch { finish(); }
      };
      const onStatus = (status: string) => {
        if (status === "error") return finish();
        if (status === "readyToPlay" && !started) {
          started = true;
          void render();
        }
      };
      // Do not let a malformed video stall the picker indefinitely.
      const timeout = setTimeout(() => finish(), 6_000);
      subscription = player.addListener("statusChange", ({ status }) => onStatus(status));
      onStatus(player.status);
    });
  } catch { return undefined; }
}
