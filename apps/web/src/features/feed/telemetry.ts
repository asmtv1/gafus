"use client";
import { FeedTelemetryQueue, type FeedImpressionInput, type FeedRankingEventInput } from "@gafus/types";
import { feedApi } from "./api";

interface WebTelemetry {
  enqueueImpression: (event: FeedImpressionInput) => void;
  enqueueOutcome: (event: FeedRankingEventInput) => void;
  flush: () => Promise<boolean>;
}

const owners = new Map<string, WebTelemetry>();

export function webFeedTelemetry(userId: string): WebTelemetry {
  const existing = owners.get(userId);
  if (existing) return existing;
  const storage = (kind: string) => {
    const key = `gafus:feed:telemetry:v2:${kind}:${userId}`;
    return {
      read: async () => {
        try { return window.localStorage.getItem(key); } catch { return null; }
      },
      write: async (payload: string) => {
        try { window.localStorage.setItem(key, payload); } catch { /* private browsing */ }
      },
    };
  };
  const impressions = new FeedTelemetryQueue<FeedImpressionInput>(
    storage("impressions"), events => feedApi.recordImpressions(events));
  const outcomes = new FeedTelemetryQueue<FeedRankingEventInput>(
    storage("outcomes"), events => feedApi.recordRankingEvents(events));
  const restored = Promise.all([impressions.restore(), outcomes.restore()]);
  const flush = async () => {
    await restored;
    if (!await impressions.flush()) return false;
    return outcomes.flush();
  };
  const queue: WebTelemetry = {
    enqueueImpression: event => impressions.enqueue(event),
    enqueueOutcome: event => outcomes.enqueue(event),
    flush,
  };
  owners.set(userId, queue);
  const resume = () => { void flush(); };
  window.addEventListener("online", resume);
  window.addEventListener("pageshow", resume);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
  window.setInterval(resume, 5_000);
  void flush();
  return queue;
}
