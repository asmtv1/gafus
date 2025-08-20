"use client";

import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import "react-markdown-editor-lite/lib/index.css";

const MdEditor = dynamic(() => import("react-markdown-editor-lite"), {
  ssr: false,
});

export default function MarkdownInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <MdEditor
      value={value}
      style={{ height: "400px" }}
      renderHTML={(text) => <ReactMarkdown>{text}</ReactMarkdown>}
      onChange={({ text }) => onChange(text)}
      config={{
        view: {
          menu: true,
          md: true,
          html: true,
        },
        // Указываем, какие кнопки оставить
        shortcuts: true,
        image: false, // отключает drag-n-drop и paste картинок
      }}
      plugins={[
        "header",
        "font-bold",
        "font-italic",
        "font-underline",
        "font-strikethrough",
        "list-unordered",
        "list-ordered",
        "block-quote",
        "block-wrap",
        "table",
        "link",
        "clear",
        "logger",
        "mode-toggle",
        "full-screen",
      ]}
    />
  );
}
