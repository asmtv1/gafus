# GAFUS: operational signals and recovery

All signals describe observed cohorts. No traffic is not an error; unavailable telemetry is not proof of health. Never place emails, tokens, coordinates, device/user/media IDs or signed URLs in labels. Thresholds are initial engineering choices, not accepted SLAs. Alloy remote_write does not evaluate alerts: install matching rules in the evaluator. Uptrace dashboards are templates, not evidence of notification delivery.

## Password reset

Owner: identity/mail. GafusPasswordResetMailStalled observes unexpired password_reset outbox rows overdue for dispatch or with expired processing lease, and PENDING/UNKNOWN provider attempts aged 5–60 minutes. Denominator: all attempts in exactly the same category and cohort, aggregated in one SQL statement. Do not sum outbox and provider counts: one message may be represented in both. Historical auth/general rows are not reclassified; general GafusMailProviderAttemptStalled and GafusMailQueueStalled still cover them. GafusMailMetricsUnavailable distinguishes unavailable metrics. Search the HTTP trace POST /api/v1/auth/password-reset-request by time and sanitized trace ID; inspect category/status in protected Admin system mail. Historical records may have no trace. Reconcile provider acceptance and expiry; reuse only the same idempotency key within its safe window. UNKNOWN does not prove non-delivery. Never resend expired reset tokens or invalidate a previous link merely on enqueue.

## OTA signature and mandatory update

Owner: mobile release. GafusOtaSignatureRejected is an absolute safety signal (SIGNATURE_REJECTED >0); GafusMandatoryOtaIncomplete counts MANDATORY_INCOMPLETE >=3 in one hour. Compare CHECKED and MANDATORY_ATTEMPT volumes, not a unique-device success rate; events cross window boundaries. GafusOtaMetricsUnavailable is separate. Uptrace: search fixed OtaSignatureRejected/OtaMandatoryIncomplete issue or stable error codes, platform/build/OTA/time; open an available sanitized diagnostic trace. Verify runtime/fingerprint/key/certificate/asset. STOP expansion and use compatible signed RECOVER after verifying trust. Never bypass signature or mandatory gate.

## CDN purge

Owner: media/CDN Worker. GafusMediaCdnPurgeStalled (age>3600s, backlog>0), expired leases, availability. Denominator for lease ratio is outstanding purge backlog, not media GETs. Filter media purge worker diagnostics by time; protected operator view for receipts. Reconcile saved receipt, lease, object version and provider ACK, then retry the existing idempotent purge. Do not wipe queues, open private access or equate CDN 404 with origin deletion. If no linked trace is available record the evidence gap.

## Chat2 outbox

Owner: Chat2/Worker. GafusChat2OutboxOldestPending, GafusChat2DispatchRetryStorm, dead letters, no success with backlog and missing metrics. Retry denominator is all claimed attempts within the same window; age/backlog absolute. Protected Admin diagnostics exposes correlation: search operationId and sourceTraceId, chat2.outbox.dispatch/publish/ack. Verify external ACK, lease and receipt before reprocessing. No generic replay of external effects.

## GPS without points

Owner: mobile tracking. GafusWalkGpsNoPoints: synced GPS-enabled completed walks >=120s, 10m grace and 60m cohort; >=3 and >=10% of eligible. GafusWalkGpsMetricsUnavailable separate. Unsynced local journals aren't counted; late chunks can heal counts; stationary zero metres is not missing points. Search fixed GPS_WALK_NO_POINTS/GPS_WALK_INSUFFICIENT_FIX diagnostic codes by platform/build/time, open sanitized trace if available. Check owner-scoped SQLite, native permissions, chunk ACK and session fence. Never delete journal or synthesize coordinates. Native fixes need a compatible binary.

## First frame

Owner: media-client. GafusVideoFirstFrameSlow: p95 >5s, >=30 rendered observations in 10m per surface/platform, for 10m. Web loadstart to requestVideoFrameCallback; native attachment to onFirstFrameRender. These boundaries differ; compare within platform/surface. Fullscreen reattachment is not a unique viewing session. Abandoned/unsupported are separate observations, never fake zero-duration frames. >120s is abandoned. Cross-origin iframe and metadata-only thumbnail generation do not offer actual presentation callbacks. Search video.first_frame spans and their parent HTTP build/OTA attributes. Histogram is process-local; use rate/increase. Investigate authorization/CDN/buffering/decoding separately, do not weaken access checks.

## Telemetry

Owner: observability. GafusMailMetricsUnavailable, domain availability, GafusServerDiagnosticExportDrops, GafusServerDiagnosticExportBlocked, GafusApiMetricsMissing. Check scrape source, bounded label allowlist, queue/retries/drops and auth; do not reveal credentials or blindly raise sampling. Missing trace is explicitly missing evidence, not success.

## Acceptance

Run promtool check rules and test rules. Exercise six original failure scenarios in nonprod with real source metrics, sanitized traces, zero/no traffic, delayed export, provider outage and recovery. Obtain actual notification receipts from each responsible operator; verify runbook and no repeat alarm after recovery. Record unknown trace and missing delivery as blockers. No live alert activation or production changes implied by this source document.
