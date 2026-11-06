/** Restart a finished expo-video progressive MP4 without remounting its native decoder. */
export interface ReplayableVideoPlayer {
  currentTime: number;
  duration: number;
  play: () => void;
  replay: () => void;
}

/** Some native players do not restart after EOF with play() alone. */
export function playVideoFromBeginningIfEnded(player: ReplayableVideoPlayer, ended = false): void {
  const duration = player.duration;
  const position = player.currentTime;
  if (ended || (Number.isFinite(duration) && duration > 0 &&
    Number.isFinite(position) && position >= Math.max(0, duration - 0.25))) {
    // Native replay() seeks and starts atomically across iOS and Android.
    player.replay();
  } else {
    player.play();
  }
}
