import { useEffect, useState } from "react";
import { PrimaryButton } from "../../shared/ui";
import { trainingCoursePath } from "../../shared/router/location";

type ShareStatus = "idle" | "copied" | "shared" | "manual";

/** Next CourseDescriptionWithVideo placed course sharing at the bottom of
 * the expanded description; native share on mobile and clipboard on desktop. */
export function CourseShareButton({ courseName, courseType, courseDescription }: {
  courseName: string;
  courseType: string;
  courseDescription?: string;
}) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const coursePath = trainingCoursePath(courseType);
  const shareUrl = typeof window === "undefined" ? coursePath : new URL(coursePath, window.location.origin).href;

  useEffect(() => {
    if (status !== "copied" && status !== "shared") return;
    const id = window.setTimeout(() => setStatus("idle"), 2200);
    return () => window.clearTimeout(id);
  }, [status]);

  async function handleShare() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Курс: ${courseName}`,
          text: courseDescription ? `${courseName}\n\n${courseDescription}\n\n` : `${courseName}\n\n`,
          url: shareUrl,
        });
        setStatus("shared");
        return;
      } catch (error) {
        // A canceled native share is a deliberate choice, not an error.
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(shareUrl);
      setStatus("copied");
    } catch {
      // HTTP contexts / denied clipboard permissions: leave a selectable URL.
      setStatus("manual");
    }
  }

  return <>
    <PrimaryButton className="training-course-share-button" onClick={() => void handleShare()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.7 10.6 6.6-4.2M8.7 13.4l6.6 4.2" />
      </svg>
      {status === "copied" ? "Ссылка скопирована!" : status === "shared" ? "Ссылка отправлена!" : "Поделиться ссылкой на курс"}
    </PrimaryButton>
    {status === "manual" && <label className="training-course-share-manual">
      Не удалось скопировать автоматически. Выделите ссылку:
      <input type="text" aria-label="Ссылка на курс" readOnly value={shareUrl}
        onFocus={event => event.currentTarget.select()} />
    </label>}
  </>;
}
