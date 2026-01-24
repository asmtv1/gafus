export interface TrainerVideoDto {
  id: string;
  trainerId: string;
  relativePath: string;
  originalName: string;
  displayName?: string | null;
  mimeType: string;
  fileSize: number;
  durationSec: number | null;
  // HLS транскодирование
  hlsManifestPath?: string | null;
  thumbnailPath?: string | null;
  transcodingStatus?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  transcodingError?: string | null;
  createdAt: Date;
  updatedAt: Date;
  trainer?: {
    username: string;
    fullName?: string | null;
  };
}

export interface TrainerVideoUploadResult {
  success: boolean;
  video?: TrainerVideoDto;
  error?: string;
  cdnUrl?: string;
  status?: number;
}
