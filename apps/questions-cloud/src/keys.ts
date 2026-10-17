/** Questions originals and intermediates are private; ONLY finals are CDN-readable. */
const id = "[A-Za-z0-9_-]{1,128}";
export const sourcePattern = new RegExp(`^questions/incoming/questions/(${id})/(${id})/source\\.(jpg|jpeg|png|webp)$`);
const stagedPattern = new RegExp(`^questions/processed/questions/(${id})/(${id})/(thumb|full)\\.webp$`);
export const FINAL_PATTERN = new RegExp(`^questions/uploads/questions/(${id})/(${id})/(thumb|full)\\.webp$`);
export function questionPaths(source: string) {
  const match = sourcePattern.exec(source);
  if (!match) throw new Error("QUESTIONS_UNTRUSTED_SOURCE");
  const prefix = `questions/processed/questions/${match[1]}/${match[2]}`;
  const final = `questions/uploads/questions/${match[1]}/${match[2]}`;
  const checked = [prefix + "/thumb.webp", prefix + "/full.webp"];
  if (checked.some(k => !stagedPattern.test(k))) throw new Error("QUESTIONS_UNTRUSTED_TARGET");
  return { source, ownerId: match[1]!, photoId: match[2]!,
    stageThumb: checked[0]!, stageFull: checked[1]!, stageFailed: prefix + "/failed.json",
    finalThumb: final + "/thumb.webp", finalFull: final + "/full.webp" };
}
