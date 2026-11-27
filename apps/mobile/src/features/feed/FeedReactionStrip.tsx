import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FEED_REACTIONS, type FeedReaction, type FeedReactionCountDto } from "@gafus/types";
import { COLORS } from "@/shared/config";
import { s } from "./feedScreenShared";
// Telegram-style reactions: show only used reactions and keep the picker behind one compact button.
export function FeedReactionStrip({ reactions, myReaction, busy, onSelect }: {
  reactions: readonly FeedReactionCountDto[];
  myReaction: FeedReaction | null;
  busy: boolean;
  onSelect: (emoji: FeedReaction) => Promise<void>;
}) {
  const triggerRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const openPicker = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setPickerOpen(true);
    });
  };
  const paletteWidth = Math.min(242, screenWidth - 24);
  const paletteHeight = 58;
  const left = anchor
    ? Math.max(12, Math.min(screenWidth - paletteWidth - 12, anchor.x + anchor.width / 2 - paletteWidth / 2))
    : 12;
  const minimumTop = insets.top + 8;
  const maximumTop = Math.max(minimumTop, screenHeight - insets.bottom - paletteHeight - 8);
  const preferredTop = anchor
    ? (anchor.y - paletteHeight - 8 >= minimumTop
      ? anchor.y - paletteHeight - 8
      : anchor.y + anchor.height + 8)
    : minimumTop;
  const top = Math.max(minimumTop, Math.min(maximumTop, preferredTop));
  const used = FEED_REACTIONS.filter(emoji =>
    reactions.some(reaction => reaction.emoji === emoji && reaction.count > 0) || myReaction === emoji,
  );
  return <>
    <View style={s.compactReactions}>
      {used.map(emoji => {
        const count = reactions.find(reaction => reaction.emoji === emoji)?.count ?? 0;
        return <Pressable key={emoji} accessibilityRole="button"
          accessibilityLabel={`Реакция ${emoji}, ${count}`}
          accessibilityState={{ selected: myReaction === emoji, disabled: busy }}
          disabled={busy} hitSlop={6} onPress={event => {
            event.stopPropagation();
            void onSelect(emoji);
          }}
          style={[s.reactionPill, myReaction === emoji && s.reactionPillSelected]}>
          <Text style={s.reactionEmoji}>{emoji}</Text>
          {count > 0 && <Text style={s.reactionCount}>{count}</Text>}
        </Pressable>;
      })}
      <Pressable ref={triggerRef} accessibilityRole="button" accessibilityLabel="Добавить реакцию"
        disabled={busy} hitSlop={6} onPress={event => {
          event.stopPropagation();
          openPicker();
        }} style={s.addReaction}>
        <MaterialCommunityIcons name="heart-outline" size={22} color={COLORS.primary} />
      </Pressable>
    </View>
    {pickerOpen && anchor && <Modal visible transparent statusBarTranslucent animationType="fade"
      onRequestClose={() => setPickerOpen(false)}>
      <View style={s.reactionModal}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
          accessibilityLabel="Закрыть выбор реакции" onPress={() => setPickerOpen(false)} />
        <View style={[s.reactionPalette, { width: paletteWidth, left, top }]}
          accessibilityLabel="Выберите реакцию">
          {FEED_REACTIONS.map(emoji => (
            <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Реакция ${emoji}`}
              onPress={() => { setPickerOpen(false); void onSelect(emoji); }}
              style={[s.reactionPaletteItem, myReaction === emoji && s.reactionPillSelected]}>
              <Text style={s.reactionPaletteEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>}
  </>;
}
