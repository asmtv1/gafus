import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Only explicit HTTPS, same-origin absolute paths, and local fragments can
 * become links. No scheme-relative paths, credentials, raw HTML, images,
 * embedded media, script execution, or implicit external fetches. */
function safeLink(href: string): string | null {
  if (href !== href.trim() || /[\s\\]/.test(href)) return null;
  for (const char of href) {
    const code=char.charCodeAt(0);
    if (code<32 || code===127) return null;
  }
  if (/^#[A-Za-z0-9_-]+$/.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//") &&
    !/%(?:2f|5c|0a|0d|00)/i.test(href)) return href;
  if (!/^https:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    if (url.protocol === "https:" && url.hostname &&
      !url.username && !url.password && !url.port &&
      url.href.length <= 2048) return url.href;
  } catch {
    return null;
  }
  return null;
}

/** Only media origins already used by GAFUS itself may be fetched from
 * step Markdown. The original Next renderer also supports `![alt](url)`,
 * but unrestricted external images would leak authenticated readers to an
 * arbitrary tracking host. Same-origin assets and known GAFUS S3/CDN origins
 * retain this feature without enabling arbitrary remote fetches. */
function safeStepImage(href: string): string | null {
  const url = safeLink(href);
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if ([
      "gafus.ru", "www.gafus.ru", "cdn.gafus.ru", "s3.cloud.ru",
      "storage.yandexcloud.net", "mepsuduyokabib.begetcdn.cloud",
      "garaquachegasourn.begetcdn.cloud",
    ].includes(hostname)) return url;
  } catch {/* invalid image URL */}
  return null;
}

const allowedElements = [
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "em", "strong",
  "del", "ul", "ol", "li", "a", "table", "thead", "tbody", "tr",
  "th", "td", "blockquote", "code", "pre", "hr", "br",
];

/** Render Next-compatible GFM for either course or unlocked step content.
 * Keep raw HTML disabled. Only step content enables GFM task checkboxes and
 * images, with external media restricted to known first-party origins. */
export function SafeCourseDescriptionMarkdown({description,kind="course"}:{
  description:string;kind?:"course"|"step";
}){
  const step = kind === "step";
  return <div className={step
    ? "training-description-markdown training-description-markdown--step"
    : "training-description-markdown"}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml
      allowedElements={step ? [...allowedElements,"img","input"] : allowedElements}
      urlTransform={(url)=>safeLink(url)??""}
      components={{
        a:({href,children})=>{
          const safe=href?safeLink(href):null;
          return safe?<a href={safe} target={safe.startsWith("https://")?"_blank":undefined}
            rel="noopener noreferrer nofollow">{children}</a>:<span>{children}</span>;
        },
        img:({src,alt})=>{
          const safe=step && src ? safeStepImage(src) : null;
          return safe?<img src={safe} alt={alt??""} loading="lazy" decoding="async"
            referrerPolicy="no-referrer"/>:null;
        },
        input:({type,checked})=>step && type==="checkbox"
          ? <input type="checkbox" checked={Boolean(checked)} disabled readOnly/>
          : null,
        table:({children})=><div className="training-markdown-table-scroll"
          role="region" aria-label={step ? "Таблица описания шага" : "Таблица описания курса"}
          tabIndex={0}>
          <table>{children}</table>
        </div>,
      }}>
      {description}
    </ReactMarkdown>
  </div>;
}
