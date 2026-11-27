export type PurgeSnapshot = { pending: number; expired: number; oldestAgeSeconds: number };

export function renderMediaCdnPurgeMetrics(snapshot: PurgeSnapshot | null): string {
  const rows: [string, number][] = [["available", snapshot === null ? 0 : 1]];
  if (snapshot !== null) {
    rows.push(["pending", snapshot.pending], ["expired_leases", snapshot.expired],
      ["oldest_age_seconds", snapshot.oldestAgeSeconds]);
  }
  return rows.map(([name, value]) => {
    const metric = "gafus_media_cdn_purge_" + name;
    return "# TYPE " + metric + " gauge\n" + metric + " " + value + "\n";
  }).join("");
}
