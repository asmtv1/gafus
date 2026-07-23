export interface CoordinatedVideoPlayer {
  pause: () => void;
}

let activePlayer: CoordinatedVideoPlayer | null = null;

/**
 * expo-video освобождает нативный SharedObject при размонтировании компонента.
 * Событие blur/AppState может прийти рядом с этим моментом, поэтому pause не
 * должен ронять приложение, если нативный объект уже освобождён.
 */
export function pauseVideoPlayerSafely(player: CoordinatedVideoPlayer): boolean {
  /* eslint-disable @gafus/require-client-catch-tracer -- освобождённый expo-video SharedObject здесь ожидаем и намеренно игнорируем */
  try {
    player.pause();
    return true;
  } catch {
    return false;
  }
  /* eslint-enable @gafus/require-client-catch-tracer */
}

/** Гарантирует, что одновременно воспроизводится только один видео-плеер. */
export function activateVideoPlayer(player: CoordinatedVideoPlayer): void {
  if (activePlayer === player) return;
  const previousPlayer = activePlayer;
  activePlayer = player;
  if (previousPlayer) pauseVideoPlayerSafely(previousPlayer);
}

export function releaseVideoPlayer(player: CoordinatedVideoPlayer): void {
  if (activePlayer === player) activePlayer = null;
}

/** Только для изоляции unit-тестов. */
export function resetVideoPlaybackCoordinator(): void {
  activePlayer = null;
}
