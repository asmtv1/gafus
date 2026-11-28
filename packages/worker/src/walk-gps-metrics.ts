import type { WalkGpsSnapshot } from "@gafus/tracking-server/walks";

export function renderWalkGpsMetrics(snapshot: WalkGpsSnapshot | null): string {
  const prefix = "gafus_mobile_telemetry_walk_gps_";
  const rows: [string, number][] = [["available", snapshot === null ? 0 : 1]];
  if (snapshot !== null) rows.push(["eligible_1h", snapshot.eligible],
    ["no_points_1h", snapshot.noPoints], ["insufficient_fix_1h", snapshot.insufficientFix]);
  return rows.map(([name, count]) => "# TYPE " + prefix + name + " gauge\n" +
    prefix + name + " " + count + "\n").join("");
}
