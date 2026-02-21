/**
 * Версии документов для записи в OfertaAcceptance.
 * Обновлять при изменении oferta.html, policy.html, personal.html, personal-distribution.html.
 */
export const DOCUMENT_VERSIONS = {
  oferta: "2026-02-20",
  policy: "2026-02",
  personal: "2026-02",
  personalDistribution: "2026-02",
} as const;

export type DocumentVersions = typeof DOCUMENT_VERSIONS;
