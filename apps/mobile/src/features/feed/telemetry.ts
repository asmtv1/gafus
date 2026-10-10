import AsyncStorage from "@react-native-async-storage/async-storage";
import { FeedTelemetryQueue, type FeedImpressionInput, type FeedRankingEventInput } from "@gafus/types";
import { feedApi } from "@/shared/lib/api/feed";

type MobileTelemetry = {
  impressions: FeedTelemetryQueue<FeedImpressionInput>;
  outcomes: FeedTelemetryQueue<FeedRankingEventInput>;
  ready: Promise<void>;
  flush: () => Promise<boolean>;
  enqueueImpression: (event: FeedImpressionInput) => void;
  enqueueOutcome: (event: FeedRankingEventInput) => void;
};

const owners = new Map<string, MobileTelemetry>();

export function mobileFeedTelemetry(userId: string): MobileTelemetry {
  const existing = owners.get(userId);
  if (existing) return existing;
  const createStorage = (kind: string) => {
    const key = `gafus:feed:telemetry:v2:${kind}:${userId}`;
    return {
      read: () => AsyncStorage.getItem(key),
      write: (payload: string) => AsyncStorage.setItem(key, payload),
    };
  };
  const impressions = new FeedTelemetryQueue<FeedImpressionInput>(
    createStorage("impressions"), events => feedApi.recordImpressions(events));
  const outcomes = new FeedTelemetryQueue<FeedRankingEventInput>(
    createStorage("outcomes"), events => feedApi.recordRankingEvents(events));
  const ready = Promise.all([impressions.restore(), outcomes.restore()]).then(() => undefined);
  const flush = async () => {
    await ready;
    if (!await impressions.flush()) return false;
    return outcomes.flush();
  };
  const telemetry: MobileTelemetry = {
    impressions, outcomes, ready, flush,
    enqueueImpression: event => impressions.enqueue(event),
    enqueueOutcome: event => outcomes.enqueue(event),
  };
  owners.set(userId, telemetry);
  return telemetry;
}
