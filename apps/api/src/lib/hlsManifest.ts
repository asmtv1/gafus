/** Переписывает URI ресурсов как в media-, так и в master-плейлистах HLS. */
export async function rewriteHlsManifest(
  manifestContent: string,
  resolveUri: (uri: string) => Promise<string>,
): Promise<string> {
  const lines = manifestContent.split("\n");
  const rewritten = await Promise.all(
    lines.map(async (line) => {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        const resolved = await resolveUri(uriMatch[1].trim());
        return line.replace(uriMatch[0], `URI="${resolved}"`);
      }
      if (line.trim() && !line.trimStart().startsWith("#")) {
        return resolveUri(line.trim());
      }
      return line;
    }),
  );
  return rewritten.join("\n");
}
