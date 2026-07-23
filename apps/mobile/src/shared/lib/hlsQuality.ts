export interface HlsQualityVariant {
  id: string;
  label: string;
  height: number | null;
  bandwidth: number;
  uri: string;
}

function getAttribute(value: string, name: string): string | null {
  const quoted = new RegExp(`(?:^|,)${name}="([^"]+)"`).exec(value)?.[1];
  if (quoted) return quoted;
  return new RegExp(`(?:^|,)${name}=([^,]+)`).exec(value)?.[1]?.trim() ?? null;
}

function getVariantHeight(attributes: string, name: string | null, uri: string): number | null {
  const resolution = getAttribute(attributes, "RESOLUTION");
  const resolutionHeight = Number(/\d+x(\d+)/i.exec(resolution ?? "")?.[1] ?? 0);
  if (resolutionHeight > 0) return resolutionHeight;

  const namedHeight = Number(/(\d{3,4})p/i.exec(name ?? "")?.[1] ?? 0);
  if (namedHeight > 0) return namedHeight;

  const uriHeight = Number(/(?:^|[^\d])(\d{3,4})p(?:[^\d]|$)/i.exec(uri)?.[1] ?? 0);
  return uriHeight > 0 ? uriHeight : null;
}

/** Разбирает варианты master.m3u8, уже переписанные API в абсолютные защищённые URL. */
export function parseHlsQualityVariants(
  manifest: string,
  manifestUri: string,
): HlsQualityVariant[] {
  const lines = manifest.split(/\r?\n/);
  const variants: HlsQualityVariant[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

    const attributes = line.slice("#EXT-X-STREAM-INF:".length);
    const relativeUri = lines.slice(index + 1).find((candidate) => {
      const value = candidate.trim();
      return value.length > 0 && !value.startsWith("#");
    });
    if (!relativeUri) continue;

    let uri: string;
    /* eslint-disable @gafus/require-client-catch-tracer -- невалидная строка варианта HLS пропускается парсером */
    try {
      uri = new URL(relativeUri.trim(), manifestUri).toString();
    } catch {
      continue;
    }
    /* eslint-enable @gafus/require-client-catch-tracer */

    const name = getAttribute(attributes, "NAME");
    const height = getVariantHeight(attributes, name, relativeUri);
    const bandwidth = Number(getAttribute(attributes, "BANDWIDTH") ?? 0);
    const label = height ? `${height}p` : (name ?? `${Math.round(bandwidth / 1000)} кбит/с`);

    variants.push({ id: uri, label, height, bandwidth, uri });
  }

  return [...new Map(variants.map((variant) => [variant.uri, variant])).values()].sort(
    (first, second) =>
      (second.height ?? 0) - (first.height ?? 0) || second.bandwidth - first.bandwidth,
  );
}

export function canLoadHlsQualityVariants(uri: string): boolean {
  return /^https?:\/\//i.test(uri) && (uri.includes(".m3u8") || uri.includes("/manifest"));
}
