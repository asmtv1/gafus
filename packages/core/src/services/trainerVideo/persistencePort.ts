/**
 * SQL-free TrainerVideo repository contract. The API composition supplies
 * server-owned owner-fenced and atomic metadata operations; Core never loads
 * the Prisma adapter at runtime.
 */
import type { TrainerVideoDto } from "@gafus/types";
import type { RegisterTrainerVideoInput } from "./schemas";
export type TrainerVideoStatus = NonNullable<TrainerVideoDto["transcodingStatus"]>;
export type TrainerVideoStoredRow = Omit<
  TrainerVideoDto,
  | "fileSize"
  | "trainer"
  | "displayName"
  | "transcodingStatus"
  | "transcodingError"
  | "hlsManifestPath"
  | "thumbnailPath"
> & {
  fileSize: bigint | number;
  trainer: { username: string; profile: { fullName: string | null } | null } | null;
  displayName: string | null;
  transcodingStatus: TrainerVideoStatus;
  transcodingError: string | null;
  hlsManifestPath: string | null;
  thumbnailPath: string | null;
};
export interface TrainerVideoPersistencePort {
  createTrainerVideoRow(input: RegisterTrainerVideoInput): Promise<TrainerVideoStoredRow>;
  markTrainerVideoTranscodingFailedRow(videoId: string, reason: string): Promise<void>;
  readTrainerVideoDeleteRow(
    videoId: string,
  ): Promise<Pick<
    TrainerVideoStoredRow,
    "id" | "trainerId" | "relativePath" | "hlsManifestPath" | "originalName"
  > | null>;
  clearTrainerStepVideoReferences(videoId: string, fullCdnUrl: string): Promise<string[]>;
  clearTrainerTemplateVideoReferences(videoId: string, fullCdnUrl: string): Promise<void>;
  deleteTrainerVideoRow(videoId: string): Promise<void>;
  readTrainerVideoOwnerRow(videoId: string): Promise<{ id: string; trainerId: string } | null>;
  renameTrainerVideoForOwner(
    videoId: string,
    trainerId: string,
    displayName: string | null,
  ): Promise<boolean>;
  readTrainerVideosRows(trainerId: string, forAdmin: boolean): Promise<TrainerVideoStoredRow[]>;
  readTrainerVideoStatusRows(videoIds: string[]): Promise<
    {
      id: string;
      transcodingStatus: TrainerVideoStatus;
      transcodingError: string | null;
      hlsManifestPath: string | null;
      thumbnailPath: string | null;
      durationSec: number | null;
    }[]
  >;
  readTrainerVideoMetadataRow(videoId: string): Promise<{
    id: string;
    thumbnailPath: string | null;
    transcodingStatus: TrainerVideoStatus;
  } | null>;
  readTrainerVideoManifestRow(videoId: string): Promise<{
    transcodingStatus: TrainerVideoStatus;
    hlsManifestPath: string | null;
    thumbnailPath: string | null;
  } | null>;
  readTrainerVideoPlaybackRow(videoId: string): Promise<{
    transcodingStatus: TrainerVideoStatus;
  } | null>;
}
