import { prisma } from "@gafus/prisma";
import type { VideoPlaybackQualityEvent, VideoPlaybackQualityReport, VideoPlaybackQualityBreakdown } from "@gafus/types";

export async function recordVideoPlaybackQuality(event: VideoPlaybackQualityEvent): Promise<void> {
  // Duplicate POSTs must never double-count. No user/media IDs, URLs, or IP/SSID identifiers.
  await prisma.videoPlaybackQualityEvent.createMany({data: [event], skipDuplicates: true});
}
type Grouped = {
  day: string; surface: string; platform: string; quality: number;
  mode: string; networkClass: string; saveData: boolean;
  starts: number; only360: number; only720: number; fallbackStarts: number;
};
function tally(rows: Grouped[], field: keyof Pick<Grouped,"day"|"surface"|"platform"|"networkClass">): VideoPlaybackQualityBreakdown[] {
  const entries = new Map<string, VideoPlaybackQualityBreakdown>();
  for (const row of rows) {
    const name = row[field] as string;
    let value = entries.get(name);
    if (!value) {
      value = {label:name,count360:0,count720:0,total:0};
      entries.set(name,value);
    }
    if (row.quality === 360) value.count360 += row.starts;
    else value.count720 += row.starts;
    value.total += row.starts;
  }
  return Array.from(entries.values()).sort((a,b) => a.label.localeCompare(b.label));
}

/** UTC calendar periods; PostgreSQL aggregates keep API payload bounded. */
export async function getVideoPlaybackQualityReport(
  days: 7 | 30 | 90, now = new Date(),
): Promise<VideoPlaybackQualityReport> {
  const utcToday = Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const from = new Date(utcToday - (days - 1) * 86_400_000);
  const rows = await prisma.$queryRaw<Grouped[]>`
    SELECT "createdAt"::date::text AS "day", "surface", "platform", "quality",
      "mode", "networkClass", "saveData",
      COUNT(*)::int AS "starts",
      (COUNT(*) FILTER (WHERE "available360" AND NOT "available720"))::int AS "only360",
      (COUNT(*) FILTER (WHERE "available720" AND NOT "available360"))::int AS "only720",
      (COUNT(*) FILTER (WHERE "fallback"))::int AS "fallbackStarts"
    FROM "VideoPlaybackQualityEvent"
    WHERE "createdAt" >= ${from}
    GROUP BY 1,2,3,4,5,6,7
    ORDER BY 1,2,3,4
  `;
  const n = (value: number | bigint): number => Number(value);
  const mapped = rows.map(row => ({
    ...row, starts:n(row.starts), only360:n(row.only360),
    only720:n(row.only720), fallbackStarts:n(row.fallbackStarts),
  }));
  const byDayMap = new Map(tally(mapped,"day").map(value => [value.label,value]));
  const byDay: VideoPlaybackQualityBreakdown[] = Array.from({length:days},(_,i) => {
    const day = new Date(from.getTime()+i*86_400_000).toISOString().slice(0,10);
    return byDayMap.get(day) ?? {label:day,count360:0,count720:0,total:0};
  });
  const count360 = mapped.filter(r => r.quality === 360).reduce((a,r) => a+r.starts,0);
  const count720 = mapped.filter(r => r.quality === 720).reduce((a,r) => a+r.starts,0);
  const total = count360+count720;
  return {
    days,from:from.toISOString().slice(0,10),through:new Date(utcToday).toISOString().slice(0,10),
    total,count360,count720,percent360:total?Math.round(count360/total*1000)/10:0,
    auto360:mapped.filter(r => r.quality===360&&r.mode==="auto").reduce((a,r)=>a+r.starts,0),
    manual360:mapped.filter(r => r.quality===360&&r.mode==="manual").reduce((a,r)=>a+r.starts,0),
    only360:mapped.reduce((a,r)=>a+r.only360,0),
    only720:mapped.reduce((a,r)=>a+r.only720,0),
    fallbackStarts:mapped.reduce((a,r)=>a+r.fallbackStarts,0),
    savingData360:mapped.filter(r=>r.quality===360&&r.saveData).reduce((a,r)=>a+r.starts,0),
    byDay,bySurface:tally(mapped,"surface"),byPlatform:tally(mapped,"platform"),
    byNetwork:tally(mapped,"networkClass"),
  };
}
