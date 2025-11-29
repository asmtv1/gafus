import { useQuery } from "@tanstack/react-query";

interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "unknown";
  url?: string;
  responseTime?: number;
  error?: string;
}

interface DatabaseStatus {
  name: string;
  status: "online" | "offline" | "error";
  responseTime?: number;
  error?: string;
  details?: {
    version?: string;
    connections?: number;
  };
}

interface SystemMetrics {
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  cpu: {
    count: number;
    model: string;
    usage: number;
  };
  uptime: number;
}

interface SystemStatusResponse {
  timestamp: string;
  services: ServiceStatus[];
  databases: DatabaseStatus[];
  metrics?: SystemMetrics;
  metricsError?: string;
}

async function fetchSystemStatus(): Promise<SystemStatusResponse> {
  const response = await fetch("/api/system-status", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch system status");
  }

  return response.json();
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system-status"],
    queryFn: fetchSystemStatus,
    refetchInterval: 30000, // Обновляем каждые 30 секунд
    refetchOnWindowFocus: true,
  });
}

