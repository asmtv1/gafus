import type { Message } from "./api";

/** Chronological, idempotent merge of paged history and live messages. */
export function mergeHistory(previous: Message[], incoming: Message[]): Message[] {
  const unique = new Map<string, Message>();
  for (const message of previous) unique.set(message.id, message);
  for (const message of incoming) unique.set(message.id, message);
  return [...unique.values()].sort((a, b) =>
    BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : 0,
  );
}

/** On a non-inverted FlatList older history is at y=0, never at onEndReached. */
export function shouldFetchOlderAtTop(input: {
  initialReady: boolean;
  movingUp: boolean;
  offsetY: number;
  contentHeight: number;
  viewportHeight: number;
}): boolean {
  return input.initialReady && input.movingUp && input.offsetY <= 140 &&
    input.contentHeight > input.viewportHeight + 40;
}
