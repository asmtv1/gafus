# Mobile intro v1: server contract

- `POST /api/v1/mobile-intro/events` stores a unique `(installationId, introVersion)` first-run row. It accepts `OPENED`, `COMPLETED`, or `SKIPPED`; the first terminal result wins.
- `POST /api/v1/mobile-intro/auth-outcome` is authenticated and stores the first `REGISTERED` or `LOGGED_IN` result. It includes the opening context so a queued opening arriving later joins the same row.
- `GET /api/v1/mobile-intro/admin/report?start=<UTC>&end=<UTC>` is ADMIN-only. The UI converts inclusive Europe/Samara dates to this half-open UTC interval.
- The report cohort is first openings in the requested period. Auth outcomes are counted whenever they occur, not only inside the period.
