import { useQuery } from "@tanstack/react-query";

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface QueuesStatsResponse {
  timestamp: string;
  queues: QueueStats[];
  totalJobs: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

async function fetchQueuesStats(): Promise<QueuesStatsResponse> {
  const response = await fetch("/api/queues/stats", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch queues stats");
  }

  return response.json();
}

export function useQueuesStats() {
  return useQuery({
    queryKey: ["queues-stats"],
    queryFn: fetchQueuesStats,
    refetchInterval: 30000, // Обновляем каждые 30 секунд
    refetchOnWindowFocus: true,
  });
}

