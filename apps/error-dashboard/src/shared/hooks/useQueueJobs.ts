import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface FailedJob {
  id: string;
  name: string;
  queueName: string;
  data: unknown;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

interface QueueJobsResponse {
  timestamp: string;
  jobs: FailedJob[];
  count: number;
}

async function fetchQueueJobs(
  queue?: string,
  status: string = "failed",
  limit: number = 50,
): Promise<QueueJobsResponse> {
  const params = new URLSearchParams();
  if (queue) params.append("queue", queue);
  params.append("status", status);
  params.append("limit", limit.toString());

  const response = await fetch(`/api/queues/jobs?${params}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch queue jobs");
  }

  return response.json();
}

export function useQueueJobs(queue?: string, status: string = "failed", limit: number = 50) {
  return useQuery({
    queryKey: ["queue-jobs", queue, status, limit],
    queryFn: () => fetchQueueJobs(queue, status, limit),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
}

// Хук для повторного запуска задачи
export function useRetryJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      queueName,
      jobId,
      action = "retry",
    }: {
      queueName: string;
      jobId: string;
      action?: "retry" | "remove" | "promote";
    }) => {
      const response = await fetch("/api/queues/retry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queueName, jobId, action }),
      });

      if (!response.ok) {
        throw new Error("Failed to retry job");
      }

      return response.json();
    },
    onSuccess: () => {
      // Обновляем статистику и список задач
      queryClient.invalidateQueries({ queryKey: ["queues-stats"] });
      queryClient.invalidateQueries({ queryKey: ["queue-jobs"] });
    },
  });
}

// Хук для массового retry
export function useBulkRetry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ queueName }: { queueName: string }) => {
      const response = await fetch("/api/queues/retry", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queueName }),
      });

      if (!response.ok) {
        throw new Error("Failed to bulk retry");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queues-stats"] });
      queryClient.invalidateQueries({ queryKey: ["queue-jobs"] });
    },
  });
}
