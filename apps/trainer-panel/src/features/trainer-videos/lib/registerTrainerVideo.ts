/**
 * Регистрация видео тренера в БД после загрузки на CDN.
 * Делегирует в @gafus/core.
 */

import type { TrainerVideoDto } from "@gafus/types";
import {
  registerTrainerVideo as registerTrainerVideoCore,
  type RegisterTrainerVideoInput,
} from "@gafus/core/services/trainerVideo";

export async function registerTrainerVideo(
  input: RegisterTrainerVideoInput,
): Promise<TrainerVideoDto> {
  const result = await registerTrainerVideoCore(input);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data!;
}
