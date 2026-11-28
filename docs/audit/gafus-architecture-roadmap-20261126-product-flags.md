# Persisted product flags and release policy

## Persisted product controls and release policy

These controls are not temporary feature experiments, and must not be removed simply because a flag is currently enabled. Defaults below distinguish missing records from storage failures. No production settings were read or changed.

| Control | Owner | Missing record / failure | Retirement gate |
|---|---|---|---|
| AppFeatureFlag keys | feature-flags-server | Existing six keys and compatibility rules in qa-handoff; DB error propagates | product switch/legacy client gates |
| GafusSettings economyEnabled, earningEnabled, spendingEnabled | Core GAFUS policy / gafus-server settings persistence | defaults true for missing row; DB error is not a new default row | retain active economy controls; ledger reconciliation before change |
| AppSubscriptionSettings plan enabled fields | subscription-shared/plans, subscription write/read | default product plan policy; legacy weekly plan resolver defaults true if field absent but public offer must exclude archived billing code; do not conflate schema default false with read compatibility | historic paid billing codes remain readable; plan removal after mixed release proof |
| RewardedAdSettings androidEnabled, iosEnabled | Core rewarded settings / gafus-server | missing row false both; legacy iOS flag resolution and legacy rewarded cutover still apply | old reward ledger reconciliation and explicit provider retirement |
| ReengagementSettings.enabled | reengagement / user preferences | missing setting uses enabled/default weekly cap 2 in worker, explicit false stops delivery; actual consent and user/campaign checks retained | permanent user opt-out, never retire without replacement |
| TrainerAIConfig.enabled | trainer-ai-server / Core trainerAI | absent authorized row -> null; role checked on read; explicit disabled config not a permission grant | active trainer settings; retain until replacement |
| MobileAppReleasePolicy.otaRequired, MobileOtaMandatoryPolicy.required | mobile-ota-server | missing policy optional; platform/runtime/signed revision selection required; transport/DB errors are not affirmative optional policy | active release gates, retain with exact native minimum and rollback proof |
| Mobile OTA delivery environment | mobile-ota-server / API | production sentinel required for production tester/checkout paths; missing denies | security/release selector; retain |
| Intro local completion/version | Mobile onboarding / mobile-intro-server | version/installation-specific receipt; server report does not grant access or block native minimum/mandatory OTA | after supported intro versions, migration and first/repeat launch verified |
| User/pet notification, privacy, and GPS toggles | owning user/pet/walk domain | user/record policy, not deployment switches; respect explicit choices | never remove without product/consent replacement |

Inventory covers literal environment switches found in checked TS/JS sources; it is not proof of all computed environment names or actual deployment configuration. Source check enforces owner, documented fallback and retirement gate for each discovered selector. Verify first/repeat launch, native minimum, platform OTA, release symbolication and real provider settings in QA before retiring a compatibility control.
