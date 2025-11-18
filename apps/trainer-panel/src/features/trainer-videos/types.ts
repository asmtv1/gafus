import type { TrainerVideoDto } from "@gafus/types";

export type TrainerVideoViewModel = Omit<TrainerVideoDto, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

