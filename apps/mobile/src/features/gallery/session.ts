import { create } from "zustand";
import { registerGallerySessionCleanup } from "@/shared/stores/galleryCleanupBridge";
import { Image } from "expo-image";
import type { QueryClient } from "@tanstack/react-query";
import type { GalleryUploadDto } from "@gafus/types";

export interface UploadTask {
  id: string;
  owner: string;
  albumId?: string;
  filename: string;
  upload?: GalleryUploadDto;
  generation: number;
  cancelRequested?: boolean;
  retrySourceId?: string;
  retryOperation?: { parentId: string; requestId: string };
  status: "queued" | "sending" | "processing" | "ready" | "failed" | "expired" | "cancelling" | "cancelled";
  error?: string;
}
export const useGallerySession = create<{ tasks: UploadTask[]; epoch: number }>(() => ({ tasks: [], epoch: 0 }));
const clients = new Set<QueryClient>();
export const galleryRequests = new Map<string, AbortController>();
const cleaners = new Set<() => void>();
export function registerGalleryClient(client: QueryClient) { clients.add(client); }
export function registerGalleryCleanup(clean: () => void) { cleaners.add(clean); return () => { cleaners.delete(clean); }; }
export interface TaskFence { epoch: number; generation: number }
export function taskAt(id: string, fence: TaskFence, allowCancelled = false) {
  const state = useGallerySession.getState();
  const task = state.tasks.find(t => t.id === id);
  return state.epoch === fence.epoch && task?.generation === fence.generation
    && (allowCancelled || (!task.cancelRequested && task.status !== "cancelled")) ? task : undefined;
}
export function updateTask(id: string, patch: Partial<UploadTask>, fence: TaskFence, allowCancelled = false) {
  if (!taskAt(id, fence, allowCancelled)) return;
  useGallerySession.setState(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...patch } : t) }));
}

const DISMISSIBLE_STATUSES: ReadonlySet<UploadTask["status"]> = new Set([
  "ready", "cancelled", "failed", "expired",
]);
export function canDismissUploadTask(status: UploadTask["status"]) {
  return DISMISSIBLE_STATUSES.has(status);
}
/** Remove only a finished notification from the current session, never an active or newer upload. */
export function dismissUploadTask(id: string, fence: TaskFence) {
  useGallerySession.setState(state => {
    if (state.epoch !== fence.epoch) return state;
    const task = state.tasks.find(t => t.id === id);
    if (!task || task.generation !== fence.generation || !canDismissUploadTask(task.status)) return state;
    return { tasks: state.tasks.filter(t => t.id !== id) };
  });
}
/** Public lifecycle API: no signed URL or local upload survives logout. */
export function clearGallerySession() {
  for (const controller of galleryRequests.values()) controller.abort();
  galleryRequests.clear();
  useGallerySession.setState(s => ({ tasks: [], epoch: s.epoch + 1 }));
  for (const clean of cleaners) clean();
  for (const client of clients) {
    void client.cancelQueries({ queryKey: ["gallery"] });
    client.removeQueries({ queryKey: ["gallery"] });
  }
  // Signed Gallery/Feed media are now eligible for Expo's native disk cache.
  // Remove *physical* cached bytes on logout/account switch, not only React
  // query references or decoded memory pixels. This affects Expo's shared
  // image cache (including public images), intentionally favoring privacy.
  void Image.clearMemoryCache().catch(() => undefined);
  void Image.clearDiskCache().catch(() => undefined);
}

// Register once when the gallery feature loads, without importing authStore here.
registerGallerySessionCleanup(clearGallerySession);
