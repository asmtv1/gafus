import type { QuestionAuthorDto } from "@gafus/types";

type Viewer = { id: string; username: string } | null | undefined;

/** Old questions API responses contain id but may omit username. */
export function questionAuthorProfileIdentifier(author: Pick<QuestionAuthorDto, "id" | "username">, viewer?: Viewer): string {
  return author.username?.trim() || (viewer?.id === author.id ? viewer.username : "") || author.id;
}
