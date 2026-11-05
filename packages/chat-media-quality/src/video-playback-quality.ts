/** Shared startup quality for progressive MP4. No probes or automatic mid-stream switches. */
export type Mp4Quality = 360 | 720;
export type Mp4Mode = 'auto' | Mp4Quality;
export interface Mp4NetworkHints {
  width: number;
  devicePixelRatio?: number;
  saveData?: boolean;
  metered?: boolean;
  downlinkMbps?: number;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi' | 'unknown';
  connectionType?: 'wifi' | 'ethernet' | 'cellular' | 'unknown';
  cellularGeneration?: '2g' | '3g' | '4g' | '5g' | 'unknown';
  recentPerformance?: 'good' | 'poor';
}
export function selectMp4Quality(mode: Mp4Mode, hints: Mp4NetworkHints): Mp4Quality {
  if (mode !== 'auto') return mode;
  if (hints.saveData) return 360;
  if (hints.effectiveType === 'slow-2g' || hints.effectiveType === '2g' ||
      hints.effectiveType === '3g' || hints.cellularGeneration === '2g' ||
      hints.cellularGeneration === '3g') return 360;
  if (Number.isFinite(hints.downlinkMbps) && (hints.downlinkMbps ?? 0) < 2.5) return 360;
  if (hints.recentPerformance === 'poor') return 360;
  if ((Number.isFinite(hints.downlinkMbps) && (hints.downlinkMbps ?? 0) >= 3.5) ||
      hints.connectionType === 'wifi' || hints.connectionType === 'ethernet' ||
      hints.effectiveType === 'wifi' || hints.cellularGeneration === '5g' ||
      hints.effectiveType === '5g' ||
      hints.cellularGeneration === '4g' || hints.effectiveType === '4g') return 720;
  // Metered does not mean slow: trust a known fast 4G/5G link, but be
  // conservative when the OS cannot identify cellular throughput.
  if (hints.metered) return 360;
  const width = Number.isFinite(hints.width) && hints.width > 0 ? hints.width : 320;
  const dpr = Number.isFinite(hints.devicePixelRatio) && (hints.devicePixelRatio ?? 0) > 0
    ? Math.min(2, hints.devicePixelRatio!) : 1;
  const pixels = width * dpr;
  if (hints.recentPerformance === 'good' && pixels >= 320) return 720;
  return pixels >= 720 ? 720 : 360;
}
type Observation = { when: number; outcome: 'fast720' | 'slow' };
const experiences = new Map<string, Observation[]>();
const WINDOW_MS = 10 * 60_000;
export function mp4NetworkKey(hints: Mp4NetworkHints): string {
  return [hints.connectionType ?? 'unknown', hints.cellularGeneration ?? 'unknown',
    hints.effectiveType ?? 'unknown', hints.metered ? 'metered' : 'normal'].join(':');
}
export function rememberMp4Startup(
  networkKey: string, quality: Mp4Quality, elapsedMs: number, now = Date.now(),
): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(now)) return;
  const outcome = elapsedMs >= 4000 ? 'slow' : quality === 720 && elapsedMs <= 1800
    ? 'fast720' : null;
  if (!outcome) return;
  const previous = (experiences.get(networkKey) ?? []).filter(x => now - x.when <= WINDOW_MS && now >= x.when);
  experiences.set(networkKey, [...previous.slice(-3), {when: now, outcome}]);
}
export function recentMp4Performance(networkKey: string, now = Date.now()): 'good' | 'poor' | undefined {
  const list = (experiences.get(networkKey) ?? []).filter(x => now - x.when <= WINDOW_MS && now >= x.when);
  if (list.length && list[list.length - 1]!.outcome === 'slow') return 'poor';
  if (list.slice(-3).filter(x => x.outcome === 'fast720').length >= 2) return 'good';
  return undefined;
}
export function clearMp4Experience(): void { experiences.clear(); }
