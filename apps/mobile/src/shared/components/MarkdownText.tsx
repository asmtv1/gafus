import { Platform, StyleSheet, View } from "react-native";
import Markdown from "react-native-markdown-display";

import { COLORS, FONTS } from "@/constants";

const androidText = Platform.OS === "android" ? { includeFontPadding: true } : {};

/**
 * lineHeight на heading* задаётся вместе с fontSize — библиотека передаёт эти text-поля
 * в листовые Text через родителей; коэффициент ~1.65 — запас под Impact и эмодзи сверху.
 */
const HEADING = {
  h1: { fontSize: 20, lineHeight: 34 },
  h2: { fontSize: 18, lineHeight: 31 },
  h3: { fontSize: 16, lineHeight: 28 },
  h4: { fontSize: 15, lineHeight: 26 },
  h5: { fontSize: 14, lineHeight: 25 },
  h6: { fontSize: 13, lineHeight: 23 },
} as const;

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
  container: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 24,
    fontFamily: FONTS.montserrat,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 6,
    ...androidText,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
    flexDirection: "column",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 2,
  },
  text: {
    flexShrink: 1,
    lineHeight: 24,
    ...androidText,
  },
  textgroup: {
    flexShrink: 1,
    maxWidth: "100%",
    lineHeight: 24,
    ...androidText,
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
    ...HEADING.h1,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 10,
    marginBottom: 8,
    flexDirection: "column",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 6,
  },
  heading2: {
    ...HEADING.h2,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 10,
    marginBottom: 8,
    flexDirection: "column",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 6,
  },
  heading3: {
    ...HEADING.h3,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 10,
    marginBottom: 8,
    flexDirection: "column",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 6,
  },
  heading4: {
    ...HEADING.h4,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 10,
    marginBottom: 8,
    flexDirection: "column",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 6,
  },
  heading5: {
    ...HEADING.h5,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 10,
    marginBottom: 8,
    flexDirection: "column",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 6,
  },
  heading6: {
    ...HEADING.h6,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginTop: 10,
    marginBottom: 8,
    flexDirection: "column",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    paddingTop: 6,
  },
  bullet_list: {
    marginBottom: 8,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  ordered_list: {
    marginBottom: 8,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  list_item: {
    marginBottom: 4,
    width: "100%",
    maxWidth: "100%",
    alignItems: "flex-start",
  },
  bullet_list_icon: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  bullet_list_content: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 24,
    fontFamily: FONTS.montserrat,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    ...androidText,
  },
  ordered_list_icon: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  ordered_list_content: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 24,
    fontFamily: FONTS.montserrat,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    ...androidText,
  },
  blockquote: {
    backgroundColor: "rgba(99, 97, 40, 0.08)",
    borderLeftColor: COLORS.border,
    borderLeftWidth: 4,
    paddingLeft: 12,
    paddingRight: 10,
    paddingTop: 14,
    paddingBottom: 12,
    marginVertical: 8,
    alignSelf: "stretch",
    maxWidth: "100%",
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
    maxWidth: "100%",
    lineHeight: 22,
    ...androidText,
  },
  link: {
    color: COLORS.secondary,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginVertical: 8,
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  thead: {
    backgroundColor: "rgba(99, 97, 40, 0.12)",
  },
  th: {
    padding: 8,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  tr: {
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  td: {
    padding: 8,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
  },
});
