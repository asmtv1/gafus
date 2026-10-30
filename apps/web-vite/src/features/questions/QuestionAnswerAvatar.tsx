import { useState } from "react";

type Props = { name: string; url?: string | null };

/** Avatar from the sanitized question read model; initials only as a fallback. */
export function QuestionAnswerAvatar({ name, url }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = url && url !== failedUrl ? url : null;
  return (
    <span className="web4-question-answer-avatar" aria-hidden="true">
      {photo ? (
        <img src={photo} alt="" loading="lazy" decoding="async"
          referrerPolicy="no-referrer" onError={() => setFailedUrl(photo)} />
      ) : (name.trim().slice(0, 1).toLocaleUpperCase("ru-RU") || "?")}
    </span>
  );
}
