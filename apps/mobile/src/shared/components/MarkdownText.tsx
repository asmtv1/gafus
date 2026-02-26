import { StyleSheet, View } from "react-native";
import Markdown from "react-native-markdown-display";

import { COLORS, FONTS } from "@/constants";

/** Рендер markdown (CommonMark) — как на web с react-markdown */
export function MarkdownText({ text }: { text: string }) {
  if (!text || typeof text !== "string") return null;

  return (
    <View style={styles.container}>
      <Markdown style={markdownStyles} mergeStyle>
        {text}
      </Markdown>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});

const markdownStyles = StyleSheet.create({
  body: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.montserrat,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  strong: {
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  em: {
    fontStyle: "italic",
    fontFamily: FONTS.montserrat,
  },
  s: {
    textDecorationLine: "line-through",
  },
  heading1: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 12,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 12,
    marginBottom: 8,
  },
  heading3: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 12,
    marginBottom: 8,
  },
  heading4: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 12,
    marginBottom: 8,
  },
  heading5: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 12,
    marginBottom: 8,
  },
  heading6: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 12,
    marginBottom: 8,
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  list_item: {
    marginBottom: 4,
  },
  bullet_list_icon: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  bullet_list_content: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.montserrat,
  },
  ordered_list_icon: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  ordered_list_content: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.montserrat,
  },
  blockquote: {
    backgroundColor: "rgba(99, 97, 40, 0.08)",
    borderLeftColor: COLORS.border,
    borderLeftWidth: 4,
    paddingLeft: 12,
    marginVertical: 8,
  },
  hr: {
    backgroundColor: "#ddd",
    height: 1,
    marginVertical: 12,
  },
  code_inline: {
    backgroundColor: "rgba(0,0,0,0.06)",
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    paddingHorizontal: 4,
  },
  code_block: {
    backgroundColor: "rgba(0,0,0,0.06)",
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    padding: 12,
    marginVertical: 8,
  },
  link: {
    color: COLORS.secondary,
  },
});
