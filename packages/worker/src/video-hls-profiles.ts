export interface HlsRendition {
  name: string;
  height: number;
  videoBitrate: number;
}

const STANDARD_RENDITIONS: readonly HlsRendition[] = [
  { name: "360p", height: 360, videoBitrate: 700_000 },
  { name: "540p", height: 540, videoBitrate: 1_300_000 },
  { name: "720p", height: 720, videoBitrate: 2_500_000 },
  { name: "1080p", height: 1080, videoBitrate: 4_500_000 },
];

function evenHeight(height: number): number {
  const rounded = Math.max(2, Math.floor(height));
  return rounded - (rounded % 2);
}

/**
 * Строит ABR-лестницу без апскейла. Низкие профили добавляются только когда
 * исходного битрейта достаточно, а максимальное исходное разрешение сохраняется всегда.
 */
export function createHlsRenditions(
  sourceHeight: number,
  sourceVideoBitrate: number,
): HlsRendition[] {
  const cappedHeight = evenHeight(Math.min(sourceHeight, 1080));
  const safeSourceBitrate = Math.max(300_000, Math.floor(sourceVideoBitrate));
  const eligible = STANDARD_RENDITIONS.filter(
    (profile) =>
      profile.height <= cappedHeight &&
      (profile.height === 360 || profile.videoBitrate <= safeSourceBitrate * 1.15),
  ).map((profile) => ({
    ...profile,
    videoBitrate: Math.min(profile.videoBitrate, safeSourceBitrate),
  }));

  const highestStandard = eligible.at(-1);
  if (!highestStandard || highestStandard.height !== cappedHeight) {
    const maxProfileBitrate =
      cappedHeight <= 360
        ? 700_000
        : cappedHeight <= 540
          ? 1_300_000
          : cappedHeight <= 720
            ? 2_500_000
            : 4_500_000;
    eligible.push({
      name: `${cappedHeight}p`,
      height: cappedHeight,
      videoBitrate: Math.min(safeSourceBitrate, maxProfileBitrate),
    });
  }

  const uniqueByHeight = new Map<number, HlsRendition>();
  for (const rendition of eligible) uniqueByHeight.set(rendition.height, rendition);
  return [...uniqueByHeight.values()].sort((a, b) => a.height - b.height);
}

export function createHlsMasterPlaylist(
  renditions: readonly HlsRendition[],
  audioBitrate: number,
): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];
  for (const rendition of renditions) {
    const averageBandwidth = rendition.videoBitrate + audioBitrate;
    const peakBandwidth = Math.ceil(averageBandwidth * 1.2);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${peakBandwidth},AVERAGE-BANDWIDTH=${averageBandwidth},NAME="${rendition.name}"`,
      `${rendition.name}.m3u8`,
    );
  }
  return `${lines.join("\n")}\n`;
}
