import { useEffect, useRef, useState } from "react";
import { publicImageUrl } from "../profile/publicProfileApi";

const FEED_ID = /^[A-Za-z0-9_-]{1,128}$/;
const USERNAME = /^[A-Za-z0-9_-]{1,128}$/;

type AvatarSubject = { postId: string; commentId?: never } |
  { commentId: string; postId?: never };

/** Resolve short-lived author avatars for both posts and comments only when
 * visible. Never place signed/opaque media links in the shared Feed query cache. */
export function MomentAuthorAvatar(props: AvatarSubject & {
  username: string; name: string;
}) {
  const { username, name } = props;
  const comment = typeof props.commentId === "string";
  const id = comment ? props.commentId! : props.postId!;
  const subjectPath = comment ? "comments" : "posts";
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const initial = name.trim().charAt(0).toLocaleUpperCase("ru-RU") || "Г";

  useEffect(() => {
    setVisible(false);
    const element = root.current;
    if (!element) return;
    // Without viewport observation, preserve the initials rather than firing
    // unbounded per-card detail requests for the entire feed.
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "150px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, subjectPath]);

  useEffect(() => {
    setImage(null);
    setLoaded(false);
    if (!visible || !FEED_ID.test(id) || !USERNAME.test(username)) return;
    const controller = new AbortController();
    void fetch(`/api/v1/feed/${subjectPath}/${id}`, {
      method: "GET", credentials: "include", cache: "no-store",
      signal: controller.signal, headers: { Accept: "application/json" },
    }).then(async response => {
      if (!response.ok) return null;
      const envelope: unknown = await response.json();
      if (!envelope || typeof envelope !== "object" || !("success" in envelope) ||
          envelope.success !== true || !("data" in envelope)) return null;
      const data = envelope.data;
      if (!data || typeof data !== "object" || !("id" in data) ||
          data.id !== id || !("author" in data)) return null;
      const author = data.author;
      if (!author || typeof author !== "object" || !("username" in author) ||
          author.username !== username || !("avatarUrl" in author) ||
          (author.avatarUrl !== null && typeof author.avatarUrl !== "string")) return null;
      return publicImageUrl(author.avatarUrl as string | null);
    }).then(url => {
      if (!controller.signal.aborted) setImage(url);
    }).catch(() => { /* Keep the initials if the authorized image is unavailable. */ });
    return () => controller.abort();
  }, [id, subjectPath, username, visible]);

  return <span ref={root} className={comment ? "moment-comment-avatar" : "web4-moment-author-avatar"} aria-hidden="true">
    <span className="moment-avatar-initial" style={{ visibility: loaded ? "hidden" : "visible" }}>
      {initial}
    </span>
    {image && <img src={image} alt="" loading="lazy" decoding="async"
      referrerPolicy="no-referrer" style={{ opacity: loaded ? 1 : 0 }}
      onLoad={() => setLoaded(true)}
      onError={() => { setImage(null); setLoaded(false); }}/>}
  </span>;
}
