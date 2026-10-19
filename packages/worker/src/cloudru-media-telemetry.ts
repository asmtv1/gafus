/** Best effort: telemetry must NEVER change a Cloud.ru :execute outcome.
 * Only allowlisted fixed Job names, HTTP statuses and timings are recorded.
 */
export function noteCloudruExecution(
  job: string, status: number | undefined, elapsedMs: number,
  transport?: "timeout" | "other",
): void {
  void import("@gafus/core/services/systemHealth")
    .then(({ recordMediaDispatch }) => recordMediaDispatch(job, status, elapsedMs, transport))
    .catch(() => {
      // Lost metrics are shown as stale/unavailable; never fail media uploads.
    });
}
