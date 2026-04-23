/**
 * Версии документов для записи в OfertaAcceptance.
 * Обновлять при изменении oferta.html, policy.html, personal.html, personal-distribution.html.
 * Предыдущие тексты — apps/web/public/legal/archive/ (см. docs/legal/document-versions.md).
 */
export const DOCUMENT_VERSIONS = {
  oferta: "2026-03-27",
  policy: "2026-04-23",
  personal: "2026-04-23",
  personalDistribution: "2026-04-23",
} as const;

export type DocumentVersions = typeof DOCUMENT_VERSIONS;
