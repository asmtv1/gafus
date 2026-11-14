# Legacy trainer Chrome synthetic scripts (October 2026)

These two preserved manual diagnostics predate the shared-browser QA harness. They hardcode an old source checkout and launch an independent Chrome/Puppeteer profile. They are **not executable release gates**, are not invoked from CI, and should not be rerun against developer profiles. Production application code and release CI do not depend on them.

Current Trainer smoke must run through the authenticated **McpGo-Playwright existing Chrome tab**, against the isolated QA stack, with independent role fixtures. Archiving avoids introducing an unused `puppeteer-core` dependency and its currently unpatched `extract-zip` high-severity advisories into the release dependency graph.
