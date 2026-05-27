# Test Coverage Policy

## Mandatory Test Areas

Changes in these areas require tests in the same PR:

- auth and session handling
- payments, purchases, Apple IAP, YooKassa webhooks
- subscription access and paywall logic
- training progress, step status, exams, timers
- video manifest, segment, and playback URL access
- consultations, booking, cancellation, trainer availability
- pets, pet documents, prevention reminders
- offline cache, sync, downloaded course data
- push notifications and reminders
- admin and trainer mutations
- user deletion, consent, and personal data flows

## Required Test Level

- Pure functions: unit tests beside the source file.
- Services with Prisma or queues: mocked service tests in `packages/*/src/**/*.test.ts`.
- HTTP routes: contract tests for auth, validation, success, and error mapping.
- Zustand stores: state transition tests with persistence mocked.
- UI components: behavior tests only when they own branching or critical user actions.
- E2E: smoke tests for the few user journeys that combine auth, routing, server actions, and persistence.

## Pull Request Checklist

- [ ] I added or updated tests for changed critical logic.
- [ ] I added a regression test for each bug fix.
- [ ] I did not replace service tests with UI-only tests.
- [ ] I covered unauthorized and validation-failure paths for changed routes.
- [ ] I ran the narrow test command for changed code.
