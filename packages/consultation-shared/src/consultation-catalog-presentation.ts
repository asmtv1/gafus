function stripControlCharsExceptNewlines(s: string): string {
  let result = "";
  for (const char of s) {
    const code = char.charCodeAt(0);
    const allowed = char === "\t" || char === "\n" || char === "\r";
    const isC0Control = code <= 0x1f || code === 0x7f;
    if (allowed || !isC0Control) {
      result += char;
    }
  }
  return result;
}

const MAX_ABOUT_LENGTH = 20_000;

export function plainConsultationAboutHtml(raw: string | null): string {
  if (!raw?.trim()) {
    return "";
  }
  let s = raw.replace(/<[^>]*>/g, "");
  s = stripControlCharsExceptNewlines(s);
  if (s.length > MAX_ABOUT_LENGTH) {
    s = s.slice(0, MAX_ABOUT_LENGTH);
  }
  return s.trim();
}

export function cynologistDisplayInitials(displayName: string | null): string {
  const s = (displayName ?? "К").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? "";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase() || "К";
}
