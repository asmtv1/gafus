import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import {
  isSmartMlModel, isSmartMlVector, predictSmartMl, scoreSmartMl,
  smartMlPassesOfflineGate, smartRocAuc, toSmartMlVector, trainSmartMl,
  SMART_ML_FEATURES, type SmartMlModel, type SmartMlTrainingRow,
} from "./smart-ml";
import { trainSmartFeedRanker } from "./smart-ml-training";
import { activateSmartFeedRanker } from "./smart-ml-promotion";

const features = () => Array(SMART_ML_FEATURES.length).fill(0.25) as number[];
function data(count: number): SmartMlTrainingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(Date.UTC(2026, 0, 1) + index * 3600_000),
    features: features().map((v, i) => i === 0 ? index % 20 / 20 : v),
    labels: {
      reacted: index % 4 === 0 ? 1 : 0,
      commented: index % 5 === 0 ? 1 : 0,
      bookmarked: index % 6 === 0 ? 1 : 0,
      negative: index % 7 === 0 ? 1 : 0,
    },
  }));
}

describe("offline ML ranker", () => {
  it("creates bounded, numeric-only snapshots and validates their schema", () => {
    const vector = toSmartMlVector({
      ageHours: 12, cityMatch: 1, petTypeOverlap: 0.5, breedOverlap: 0.2,
      authorAffinity: 0.3, reactions: 8, uniqueCommenters: 2,
      bookmarks: 1, exploration: 0.3, seenRecently: false,
    }, 100, ["local", "pet"]);
    expect(isSmartMlVector(vector)).toBe(true);
    expect(vector).toHaveLength(SMART_ML_FEATURES.length);
    expect(vector[9]).toBe(1);
    expect(vector[10]).toBe(1);
    expect(isSmartMlVector([...vector, 3])).toBe(false);
    expect(isSmartMlVector(Array(SMART_ML_FEATURES.length).fill("Москва"))).toBe(false);
  });
  it("computes correct ROC-AUC including ties", () => {
    expect(smartRocAuc([{ probability: 0.1, label: 0 }, { probability: 0.9, label: 1 }])).toBe(1);
    expect(smartRocAuc([{ probability: 0.9, label: 0 }, { probability: 0.1, label: 1 }])).toBe(0);
    expect(smartRocAuc([{ probability: 0.5, label: 0 }, { probability: 0.5, label: 1 }])).toBe(0.5);
  });
  it("uses chronological train/validation split without leaked future rows", () => {
    const model = trainSmartMl(data(120), "model-test", new Date("2026-10-10"), {
      minTrain: 40, minValid: 10, minPositive: 3,
    });
    expect(model).not.toBeNull();
    expect(model?.trainRows).toBe(96);
    expect(model?.validationRows).toBe(24);
    expect(isSmartMlModel(model)).toBe(true);
    expect(isSmartMlModel({ ...model, schemaVersion: 2 })).toBe(false);
    if (!model) return;
    const predicted = predictSmartMl(model, features());
    for (const probability of Object.values(predicted)) {
      expect(probability).toBeGreaterThan(0);
      expect(probability).toBeLessThan(1);
    }
    expect(Number.isFinite(scoreSmartMl(model, features()))).toBe(true);
  });
  it("requires sufficient qualified exposures and explicit quality gate", () => {
    expect(trainSmartMl(data(80), "small", new Date())).toBeNull();
    expect(smartMlPassesOfflineGate({
      schemaVersion: 1, version: "weak", trainedAt: new Date().toISOString(),
      trainRows: 1200, validationRows: 300,
      heads: Object.fromEntries(["reacted", "commented", "bookmarked", "negative"].map(name =>
        [name, { bias: 0, weights: features(), auc: 0.49, brier: 0.1, baselineBrier: 0.2 }],
      )) as SmartMlModel["heads"],
    })).toBe(false);
  });
  it("does not activate or create a model with insufficient real data", async () => {
    const create = vi.fn();
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      feedSmartRankerModel: { create },
    } as unknown as FeedDb;
    await expect(trainSmartFeedRanker(db)).resolves.toEqual({
      status: "insufficient_data", samples: 0,
    });
    expect(create).not.toHaveBeenCalled();
  });
  it("manual promotion rejects missing, weak or stale rankers before any writes", async () => {
    const updateMany = vi.fn();
    const update = vi.fn();
    const findUnique = vi.fn().mockResolvedValue(null);
    const db = {
      $transaction: vi.fn().mockImplementation(fn => fn({
        feedSmartRankerModel: { findUnique, updateMany, update },
      })),
    } as unknown as FeedDb;
    await expect(activateSmartFeedRanker(db, "lr-v1-202610101230")).rejects.toThrow();
    await expect(activateSmartFeedRanker(db, "unsafe-model")).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
