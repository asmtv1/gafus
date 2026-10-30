/**
 * Type-only context for the AG2 in-process contract test that intentionally
 * imports the actual Web Vite projection into the original Hono test suite.
 * This does not change backend runtime, enable Vite env in production, or
 * exclude any backend / cross-boundary tests from the full API typecheck.
 * The canonical definitions come from the same installed vite/client types
 * used by the real apps/web-vite compilation; no invented ambient shims.
 */
/// <reference types="vite/client" />
