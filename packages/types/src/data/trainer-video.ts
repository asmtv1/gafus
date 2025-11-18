export interface TrainerVideoDto {
  id: string;
  trainerId: string;
  relativePath: string;
  originalName: string;
  displayName?: string | null;
  mimeType: string;
  fileSize: number;
  durationSec: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainerVideoUploadResult {
  success: boolean;
  video?: TrainerVideoDto;
  error?: string;
  cdnUrl?: string;
  status?: number;
}

