interface HlsVariant {
  bandwidth: number;
  uri: string;
}

/** Native HLS downloads must not follow file:, data:, blob: or other custom schemes. */
function isSupportedVariantUri(uri: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1];
  return !scheme || scheme.toLowerCase() === "http" || scheme.toLowerCase() === "https";
}

/** Выбирает максимально качественный вариант из master playlist для офлайн-копии. */
export function selectHighestBandwidthVariant(manifest: string): string | null {
  const lines = manifest.split(/\r?\n/);
  const variants: HlsVariant[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const bandwidth = Number(/(?:^|[:,])BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0);
    // An EXT-X-STREAM-INF must be followed by its own URI line.
    // Never borrow a later variant's URI or media segment from a broken master.
    const uri = lines[index + 1]?.trim();
    if (uri && !uri.startsWith("#") && isSupportedVariantUri(uri)) {
      variants.push({ bandwidth, uri });
    }
  }
  if (variants.length === 0) return null;
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants[0]?.uri ?? null;
}
