/**
 * Версии юридических документов для пользовательских согласий.
 * Обновлять при изменении oferta.html, policy.html, personal.html, personal-distribution.html.
 * Предыдущие тексты — apps/web/public/legal/archive/ (см. docs/legal/document-versions.md).
 */
export const DOCUMENT_VERSIONS = {
  oferta: "2026-08-13",
  policy: "2026-08-13",
  personal: "2026-08-13",
  personalDistribution: "2026-05-13",
} as const;

export type DocumentVersions = typeof DOCUMENT_VERSIONS;
