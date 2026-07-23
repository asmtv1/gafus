interface HlsVariant {
  bandwidth: number;
  uri: string;
}

/** Выбирает максимально качественный вариант из master playlist для офлайн-копии. */
export function selectHighestBandwidthVariant(manifest: string): string | null {
  const lines = manifest.split(/\r?\n/);
  const variants: HlsVariant[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const bandwidth = Number(/(?:^|[:,])BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0);
    const uri = lines.slice(index + 1).find((candidate) => {
      const value = candidate.trim();
      return value.length > 0 && !value.startsWith("#");
    });
    if (uri) variants.push({ bandwidth, uri: uri.trim() });
  }
  if (variants.length === 0) return null;
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants[0]?.uri ?? null;
}
