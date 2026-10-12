/** Transport-independent model policy shared by trainer UI and persistence. */
export const TRAINER_AI_SUPPORTED_MODELS = [
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-r1",
  "meta-llama/llama-3.1-405b-instruct",
] as const;

export function isSupportedTrainerAIModel(model: string): boolean {
  return TRAINER_AI_SUPPORTED_MODELS.some(item => item === model);
}
