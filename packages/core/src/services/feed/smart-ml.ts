import type { SmartFeedFeatures } from "./smart-ranking";
import type { SmartCandidateSource } from "./smart-retrieval";

export const SMART_ML_FEATURES = [
  "freshness", "city_match", "pet_match", "breed_match", "author_affinity",
  "reaction_rate", "comment_rate", "bookmark_rate", "seen_recently",
  "from_local", "from_pet", "from_affinity", "from_trending",
] as const;
export const SMART_ML_OBJECTIVES = ["reacted", "commented", "bookmarked", "negative"] as const;
export type SmartMlObjective = (typeof SMART_ML_OBJECTIVES)[number];
export type SmartMlVector = number[];

export interface SmartMlHead {
  bias: number;
  weights: number[];
  auc: number;
  brier: number;
  baselineBrier: number;
}
export interface SmartMlModel {
  schemaVersion: 1;
  version: string;
  trainedAt: string;
  trainRows: number;
  validationRows: number;
  heads: Record<SmartMlObjective, SmartMlHead>;
}

function bounded(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
function softCount(count: number, impressions: number, prior: number): number {
  return bounded((Math.max(0, count) + prior * 20) / (Math.max(0, impressions) + 20));
}
/** Snapshot computed before impression, numeric only; no usernames, pets, city names or IDs. */
export function toSmartMlVector(
  f: SmartFeedFeatures, impressions: number, sources: readonly SmartCandidateSource[],
): SmartMlVector {
  return [
    bounded(Math.exp(-Math.LN2 * Math.max(0, f.ageHours) / 48)),
    bounded(f.cityMatch), bounded(f.petTypeOverlap), bounded(f.breedOverlap),
    bounded(f.authorAffinity),
    softCount(f.reactions, impressions, 0.04),
    softCount(f.uniqueCommenters, impressions, 0.02),
    softCount(f.bookmarks, impressions, 0.01),
    f.seenRecently ? 1 : 0,
    sources.includes("local") ? 1 : 0,
    sources.includes("pet") ? 1 : 0,
    sources.includes("affinity") ? 1 : 0,
    sources.includes("trending") ? 1 : 0,
  ];
}

export function isSmartMlVector(value: unknown): value is SmartMlVector {
  return Array.isArray(value) && value.length === SMART_ML_FEATURES.length &&
    value.every(number => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 1);
}

export function isSmartMlModel(value: unknown): value is SmartMlModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<SmartMlModel>;
  if (model.schemaVersion !== 1 || !model.version || !model.heads ||
      !Number.isSafeInteger(model.trainRows) || !Number.isSafeInteger(model.validationRows)) return false;
  return SMART_ML_OBJECTIVES.every(objective => {
    const head = model.heads?.[objective];
    return !!head && Number.isFinite(head.bias) &&
      Array.isArray(head.weights) && head.weights.length === SMART_ML_FEATURES.length &&
      head.weights.every(n => typeof n === "number" && Number.isFinite(n)) &&
      Number.isFinite(head.auc) && Number.isFinite(head.brier) && Number.isFinite(head.baselineBrier);
  });
}

export function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-Math.min(value, 100)));
  const exp = Math.exp(Math.max(value, -100));
  return exp / (1 + exp);
}

export function predictSmartMl(model: SmartMlModel, vector: SmartMlVector): Record<SmartMlObjective, number> {
  const probabilities = {} as Record<SmartMlObjective, number>;
  for (const objective of SMART_ML_OBJECTIVES) {
    const head = model.heads[objective];
    probabilities[objective] = sigmoid(head.weights.reduce(
      (value, weight, index) => value + weight * vector[index]!, head.bias,
    ));
  }
  return probabilities;
}

export function scoreSmartMl(model: SmartMlModel, features: SmartMlVector): number {
  if (!isSmartMlVector(features)) throw new Error("Invalid recommendation feature snapshot");
  const p = predictSmartMl(model, features);
  // Expected utility favours meaningful conversation and saved content over raw clicks.
  return 100 * (0.20 * p.reacted + 0.25 * p.commented +
    0.30 * p.bookmarked - 0.50 * p.negative);
}

export interface SmartMlTrainingRow {
  at: Date;
  features: SmartMlVector;
  labels: Record<SmartMlObjective, 0 | 1>;
}

/** Exact pairwise ROC-AUC with ties worth half-credit. */
export function smartRocAuc(pairs: Array<{ probability: number; label: 0 | 1 }>): number {
  const sorted = [...pairs].sort((a, b) => a.probability - b.probability);
  const positives = pairs.filter(pair => pair.label === 1).length;
  const negatives = pairs.length - positives;
  if (!positives || !negatives) return 0.5;
  let rankSum = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.probability === sorted[i]!.probability) j += 1;
    const averageRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) {
      if (sorted[k]!.label) rankSum += averageRank;
    }
    i = j;
  }
  return (rankSum - positives * (positives + 1) / 2) / (positives * negatives);
}

function fitLogistic(rows: SmartMlTrainingRow[], objective: SmartMlObjective): { bias: number; weights: number[] } {
  const dim = SMART_ML_FEATURES.length;
  const positives = rows.reduce((n, row) => n + row.labels[objective], 0);
  let bias = Math.log((positives + 1) / (rows.length - positives + 1));
  const weights = Array<number>(dim).fill(0);
  // Deterministic full-batch gradient descent with L2 regularization.
  for (let step = 0; step < 100; step += 1) {
    let gradientBias = 0;
    const gradient = Array<number>(dim).fill(0);
    for (const row of rows) {
      const prediction = sigmoid(bias + weights.reduce((total, weight, i) =>
        total + weight * row.features[i]!, 0));
      const delta = prediction - row.labels[objective];
      gradientBias += delta;
      for (let i = 0; i < dim; i += 1) gradient[i]! += delta * row.features[i]!;
    }
    const lr = 0.20 / (1 + step / 100);
    bias -= lr * gradientBias / rows.length;
    for (let i = 0; i < dim; i += 1) {
      weights[i]! -= lr * (gradient[i]! / rows.length + 0.02 * weights[i]!);
    }
  }
  return { bias, weights };
}

export function trainSmartMl(
  data: SmartMlTrainingRow[], version: string, trainedAt: Date,
  limits = { minTrain: 1000, minValid: 200, minPositive: 15 },
): SmartMlModel | null {
  const chronological = data.filter(row =>
    Number.isFinite(row.at.getTime()) && isSmartMlVector(row.features) &&
    SMART_ML_OBJECTIVES.every(objective => row.labels[objective] === 0 || row.labels[objective] === 1),
  ).sort((a, b) => a.at.getTime() - b.at.getTime());
  const split = Math.floor(chronological.length * 0.8);
  const train = chronological.slice(0, split);
  const valid = chronological.slice(split);
  if (train.length < limits.minTrain || valid.length < limits.minValid ||
      !version || version.length > 64) return null;
  const heads = {} as Record<SmartMlObjective, SmartMlHead>;
  for (const objective of SMART_ML_OBJECTIVES) {
    const positiveTrain = train.reduce((n, row) => n + row.labels[objective], 0);
    const positiveValid = valid.reduce((n, row) => n + row.labels[objective], 0);
    if (positiveTrain < limits.minPositive || positiveValid < 1 ||
        train.length - positiveTrain < limits.minPositive ||
        valid.length - positiveValid < 1) return null;
    const fit = fitLogistic(train, objective);
    const pairs = valid.map(row => ({
      probability: sigmoid(fit.bias + fit.weights.reduce(
        (total, weight, i) => total + weight * row.features[i]!, 0,
      )),
      label: row.labels[objective],
    }));
    const rate = positiveTrain / train.length;
    const brier = pairs.reduce((sum, pair) => sum + (pair.probability - pair.label) ** 2, 0) / pairs.length;
    const baselineBrier = pairs.reduce((sum, pair) => sum + (rate - pair.label) ** 2, 0) / pairs.length;
    heads[objective] = { ...fit, auc: smartRocAuc(pairs), brier, baselineBrier };
  }
  return {
    schemaVersion: 1, version, trainedAt: trainedAt.toISOString(),
    trainRows: train.length, validationRows: valid.length, heads,
  };
}

/** Conservative release gate: keep a candidate in shadow without automatic promotion. */
export function smartMlPassesOfflineGate(model: SmartMlModel): boolean {
  return model.trainRows >= 1000 && model.validationRows >= 200 &&
    SMART_ML_OBJECTIVES.every(objective => model.heads[objective].auc >= 0.50 &&
      model.heads[objective].brier <= model.heads[objective].baselineBrier);
}
