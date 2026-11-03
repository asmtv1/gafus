import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Loaded on demand when an editor preview is opened.
 * Markdown HTML is never trusted as raw DOM. */
export default function TrainerMarkdownPreview({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{content}</ReactMarkdown>;
}
