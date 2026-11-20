/**
 * Source-only instrumentation adapter for the real SQL payment fixture. This
 * intentionally resolves the TS payment service source instead of the normal
 * built dist export. Default production/real-PG tests remain unmodified.
 */
import { vi } from 'vitest';
vi.mock('@gafus/subscription-payment-server/service', async () =>
  import('../../packages/subscription-payment-server/src/paymentService.ts'));
await import('../../packages/core/src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts');
