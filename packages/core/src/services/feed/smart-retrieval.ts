/** Pure smart feed candidate source merge: no table delegates or SQL types. */
export const SMART_SOURCES = ["recent", "local", "pet", "affinity", "trending"] as const;
export type SmartCandidateSource = (typeof SMART_SOURCES)[number];
export interface SmartCandidate {
  id: string;
  authorId: string;
  publishedAt: Date | null;
  sources: SmartCandidateSource[];
}
export interface SmartRetrievalOptions {
  useCity: boolean;
  usePets: boolean;
  useBehavior: boolean;
  historyResetAt?: Date | null;
}
export type SmartPostProjection = { id: string; authorId: string; publishedAt: Date | null };
export type SmartSourceGroup = {
  source: SmartCandidateSource;
  posts: readonly SmartPostProjection[];
};
export interface SmartRetrievalPort {
  readCandidateSources(viewerId: string, at: Date, options: SmartRetrievalOptions): Promise<SmartSourceGroup[]>;
}
export function mergeSmartSources(groups: readonly SmartSourceGroup[], limit = 500): SmartCandidate[] {
  const merged = new Map<string, SmartCandidate>();
  for (const group of groups) {
    for (const post of group.posts) {
      const existing = merged.get(post.id);
      if (existing) {
        if (!existing.sources.includes(group.source)) existing.sources.push(group.source);
      } else if (merged.size < limit) {
        merged.set(post.id, { ...post, sources: [group.source] });
      }
    }
  }
  return [...merged.values()];
}
/** Client-neutral policy merges bounded, visibility-checked server projections. */
export async function retrieveSmartCandidates(
  port: SmartRetrievalPort, viewerId: string, at: Date, options: SmartRetrievalOptions,
): Promise<SmartCandidate[]> {
  return mergeSmartSources(await port.readCandidateSources(viewerId, at, options));
}
