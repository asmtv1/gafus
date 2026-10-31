# Archived GitHub Actions (2026-10-31)

Historical workflows are preserved as text for incident investigation and rollback
of configuration changes. These files are **not active workflows**: GitHub Actions
recognizes workflow files only under \`.github/workflows/\`.

- \`production-app-only.yml\` — incident-specific rescue/migration recovery; never run
  unattended. Its safe, normal redeploy action is now \`Deploy Only\`.
- \`production-media-activate-reusable.yml\` — one-time initial Cloud.ru V2 activation;
  not needed for normal application releases and intentionally not repeated.
- \`refactor-vite-release.yml\`, \`refactor-browser-boundary.yml\` — old branch-specific
  checks consolidated into main CI/CD.
- \`beget-synthetic-acceptance.yml\`, \`beget-final-readonly-smoke.yml\` — specialized
  signed CDN test-fixture workflows; normal releases use read-only CDN checks.

To restore a historical diagnostic workflow, review all side effects and move it back
under \`.github/workflows/\` in a controlled PR. Do not automatically revive
one-time migration/cutover scripts.
