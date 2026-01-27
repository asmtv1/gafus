import { View, StyleSheet, Text } from "react-native";

/** Рендер markdown (жирный, курсив, заголовки, списки) для React Native */
export function MarkdownText({ text }: { text: string }) {
  if (!text || typeof text !== "string") return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let listItems: string[] = [];
  let inList = false;

  const renderTextWithFormatting = (raw: string, style: object) => {
    const boldPattern = /\*\*(.+?)\*\*/g;
    const italicPattern = /(?<!\*)\*([^*]+?)\*(?!\*)/g;
    const boldMatches: Array<{ start: number; end: number; text: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = boldPattern.exec(raw)) !== null) {
      boldMatches.push({ start: m.index, end: m.index + m[0].length, text: m[1] });
    }
    const italicMatches: Array<{ start: number; end: number; text: string }> = [];
    while ((m = italicPattern.exec(raw)) !== null) {
      if (!boldMatches.some((b) => m!.index >= b.start && m!.index < b.end)) {
        italicMatches.push({ start: m.index, end: m.index + m[0].length, text: m[1] });
      }
    }
    const all = [
      ...boldMatches.map((x) => ({ ...x, type: "bold" as const })),
      ...italicMatches.map((x) => ({ ...x, type: "italic" as const })),
    ].sort((a, b) => a.start - b.start);

    let idx = 0;
    let last = 0;
    const parts: React.ReactNode[] = [];
    all.forEach((match) => {
      if (match.start > last) {
        parts.push(
          <Text key={idx++} style={style}>
            {raw.substring(last, match.start)}
          </Text>,
        );
      }
      if (match.type === "bold") {
        parts.push(
          <Text key={idx++} style={[style, styles.bold]}>
            {match.text}
          </Text>,
        );
      } else {
        parts.push(
          <Text key={idx++} style={[style, styles.italic]}>
            {match.text}
          </Text>,
        );
      }
      last = match.end;
    });
    if (last < raw.length) {
      parts.push(
        <Text key={idx++} style={style}>
          {raw.substring(last)}
        </Text>,
      );
    }
    if (parts.length === 0) {
      return <Text style={style}>{raw}</Text>;
    }
    return <Text style={style}>{parts}</Text>;
  };

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const p = currentParagraph.join(" ");
      elements.push(
        <View key={`p-${elements.length}`} style={styles.paragraph}>
          {renderTextWithFormatting(p, styles.paragraphText)}
        </View>,
      );
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <View key={`list-${elements.length}`} style={styles.list}>
          {listItems.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>{item.trim()}</Text>
            </View>
          ))}
        </View>,
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const t = line.trim();
    if (t.startsWith("# ")) {
      flushParagraph();
      flushList();
      elements.push(
        <View key={`h1-${index}`} style={styles.heading}>
          {renderTextWithFormatting(t.replace(/^#+\s/, ""), styles.h1)}
        </View>,
      );
      return;
    }
    if (t.startsWith("## ")) {
      flushParagraph();
      flushList();
      elements.push(
        <View key={`h2-${index}`} style={styles.heading}>
          {renderTextWithFormatting(t.replace(/^#+\s/, ""), styles.h2)}
        </View>,
      );
      return;
    }
    if (t.startsWith("### ")) {
      flushParagraph();
      flushList();
      elements.push(
        <View key={`h3-${index}`} style={styles.heading}>
          {renderTextWithFormatting(t.replace(/^#+\s/, ""), styles.h3)}
        </View>,
      );
      return;
    }
    if (t.startsWith("- ") || t.startsWith("* ")) {
      flushParagraph();
      inList = true;
      listItems.push(t.replace(/^[-*]\s/, ""));
      return;
    }
    if (t) {
      flushList();
      currentParagraph.push(t);
    } else {
      flushParagraph();
      flushList();
    }
  });
  flushParagraph();
  flushList();

  if (elements.length === 0) {
    return (
      <View style={styles.paragraph}>
        {renderTextWithFormatting(text, styles.paragraphText)}
      </View>
    );
  }
  return <View style={styles.root}>{elements}</View>;
}

const styles = StyleSheet.create({
  root: {},
  paragraph: { marginBottom: 8 },
  paragraphText: { fontSize: 14, lineHeight: 20, color: "#352E2E" },
  bold: { fontWeight: "600" },
  italic: { fontStyle: "italic" },
  heading: { marginTop: 12, marginBottom: 8 },
  h1: { fontSize: 20, fontWeight: "600", color: "#352E2E" },
  h2: { fontSize: 18, fontWeight: "600", color: "#352E2E" },
  h3: { fontSize: 16, fontWeight: "600", color: "#352E2E" },
  list: { marginBottom: 8, paddingLeft: 8 },
  listItem: { flexDirection: "row", marginBottom: 4 },
  bullet: { marginRight: 6, fontSize: 14, color: "#352E2E" },
  listText: { flex: 1, fontSize: 14, lineHeight: 20, color: "#352E2E" },
});
