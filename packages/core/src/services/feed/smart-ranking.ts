import { createHash } from "node:crypto";

/** Pure ranking calculations: no profile text, identifiers or location leak into API DTOs. */
export type SmartRecommendationReason =
  | "same_city" | "similar_pet" | "author_affinity" | "trending" | "discovery" | null;

export interface SmartFeedFeatures {
  ageHours: number;
  cityMatch: number;
  petTypeOverlap: number;
  breedOverlap: number;
  authorAffinity: number;
  reactions: number;
  uniqueCommenters: number;
  bookmarks: number;
  exploration: number;
  seenRecently: boolean;
}

export interface SmartFeedSignals {
  city: boolean;
  pets: boolean;
  behavior: boolean;
  exploration: boolean;
  seen?: boolean;
}

export interface RankedSmartPost {
  id: string;
  authorId: string;
  score: number;
  publishedAt: Date;
  discovery: boolean;
  reason: SmartRecommendationReason;
  sources?: string[];
  mlFeatures?: number[];
}

const weights = {
  freshness: 0.30,
  affinity: 0.22,
  city: 0.12,
  petType: 0.10,
  breed: 0.05,
  quality: 0.15,
  exploration: 0.06,
} as const;

export function normalizeSmartText(value: string | null | undefined): string | null {
  const result = value?.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  return result || null;
}

const BREED_ALIASES: Record<string, string> = {
  "labrador": "лабрадор", "labrador retriever": "лабрадор",
  "лабрадор ретривер": "лабрадор", "лабрадор-ретривер": "лабрадор",
  "golden retriever": "золотистый ретривер",
  "golden": "золотистый ретривер",
  "йорк": "йоркширский терьер",
  "yorkshire terrier": "йоркширский терьер",
  "french bulldog": "французский бульдог",
};

export function normalizeSmartBreed(breed: string | null | undefined): string | null {
  const value = normalizeSmartText(breed);
  return value ? (BREED_ALIASES[value] ?? value) : null;
}

export function jaccardSimilarity<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function sat(value: number, reference: number): number {
  return clamp01(Math.log1p(Math.max(0, value)) / Math.log1p(reference));
}

/** Saturate and decay affinity, so historical heavy interaction cannot dominate forever. */
export function smartAffinity(raw: number, daysSinceInteraction: number): number {
  const decayed = Math.max(0, raw) * Math.exp(-Math.LN2 * Math.max(0, daysSinceInteraction) / 30);
  return 1 - Math.exp(-decayed / 8);
}

/** Stable exploration within a UTC date bucket (not Math.random per request). */
export function smartExploration(userId: string, postId: string, utcDay: string): number {
  const n = createHash("sha256").update(JSON.stringify([userId, postId, utcDay])).digest().readUInt32BE(0);
  return n / 0xffffffff;
}

export function calculateSmartFeedScore(
  f: SmartFeedFeatures,
  signals: SmartFeedSignals = { city: true, pets: true, behavior: true, exploration: true },
): { score: number; reason: SmartRecommendationReason } {
  const freshness = Math.exp(-Math.LN2 * Math.max(0, f.ageHours) / 48);
  const quality = 0.35 * sat(f.reactions, 20) +
    0.40 * sat(f.uniqueCommenters, 10) +
    0.25 * sat(f.bookmarks, 10);

  // Reallocate unavailable feature weights rather than penalizing new users.
  const active = {
    freshness: weights.freshness,
    affinity: signals.behavior ? weights.affinity : 0,
    city: signals.city ? weights.city : 0,
    petType: signals.pets ? weights.petType : 0,
    breed: signals.pets ? weights.breed : 0,
    quality: weights.quality,
    exploration: signals.exploration ? weights.exploration : 0,
  };
  const total = Object.values(active).reduce((a, b) => a + b, 0);
  const parts = {
    freshness: active.freshness * clamp01(freshness) / total,
    affinity: active.affinity * clamp01(f.authorAffinity) / total,
    city: active.city * clamp01(f.cityMatch) / total,
    petType: active.petType * clamp01(f.petTypeOverlap) / total,
    breed: active.breed * clamp01(f.breedOverlap) / total,
    quality: active.quality * quality / total,
    exploration: active.exploration * clamp01(f.exploration) / total,
  };
  const positive = Object.values(parts).reduce((a, b) => a + b, 0);
  const explanations: { reason: SmartRecommendationReason; value: number }[] = [
    { reason: "same_city", value: parts.city },
    { reason: "similar_pet", value: parts.petType + parts.breed },
    { reason: "author_affinity", value: parts.affinity },
    { reason: "trending", value: parts.quality },
  ];
  const selected = explanations.sort((a, b) => b.value - a.value)[0];
  return {
    score: 100 * (positive - ((signals.seen ?? signals.behavior) && f.seenRecently ? 0.25 : 0)),
    reason: selected && selected.value > 0.025 ? selected.reason : "discovery",
  };
}

/** Respect diversity when possible, then fill remaining positions without dropping posts. */
export function rerankSmartFeed(input: RankedSmartPost[], limit = 200, explore = true): RankedSmartPost[] {
  const remaining = [...input].sort((a, b) =>
    b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime() || b.id.localeCompare(a.id));
  const output: RankedSmartPost[] = [];
  const counts = new Map<string, number>();
  const used = new Set<string>();
  const discoverySlots = new Set(explore ? [5, 11, 17] : []);
  for (let pass = 0; pass < 2; pass += 1) {
    while (output.length < Math.min(limit, remaining.length)) {
      const strict = pass === 0;
      const previous = output.at(-1);
      const eligible = (row: RankedSmartPost) => !used.has(row.id) &&
        (!strict || (previous?.authorId !== row.authorId &&
          (output.length >= 20 || (counts.get(row.authorId) ?? 0) < 2)));
      const preferredDiscovery = discoverySlots.has(output.length);
      const row = (preferredDiscovery ? remaining.find(candidate => candidate.discovery && eligible(candidate)) : undefined)
        ?? remaining.find(eligible);
      if (!row) break;
      used.add(row.id);
      output.push(row);
      counts.set(row.authorId, (counts.get(row.authorId) ?? 0) + 1);
    }
  }
  return output;
}
