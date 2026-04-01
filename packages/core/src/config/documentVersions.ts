/**
 * Версии документов для записи в OfertaAcceptance.
 * Обновлять при изменении oferta.html, policy.html, personal.html, personal-distribution.html.
 * Предыдущие тексты — apps/web/public/legal/archive/ (см. docs/legal/document-versions.md).
 */
export const DOCUMENT_VERSIONS = {
  oferta: "2026-03-27",
  policy: "2026-03-27",
  personal: "2026-03-27",
  personalDistribution: "2026-02",
} as const;

export type DocumentVersions = typeof DOCUMENT_VERSIONS;
