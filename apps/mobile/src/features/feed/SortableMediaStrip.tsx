import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { COLORS } from "@/shared/config";

const SIZE = 94;
const GAP = 9;
const STRIDE = SIZE + GAP;

export interface SortableMediaItem {
  id: string;
  uri?: string | null;
  kind: "photo" | "video";
}

interface SortableMediaStripProps {
  items: readonly SortableMediaItem[];
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function MediaTile({
  item, index, count, activeId, hoverIndex, disabled,
  onStart, onHover, onDrop, onFinish, onMove, onRemove,
  scrollRef, scrollOffset, contentWidth, viewportWidth, viewportLeft,
}: {
  item: SortableMediaItem;
  index: number;
  count: number;
  activeId: string | null;
  hoverIndex: number;
  disabled: boolean;
  onStart: (id: string, index: number) => void;
  onHover: (index: number) => void;
  onDrop: (from: number, to: number) => void;
  onFinish: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  scrollRef: AnimatedRef<Animated.ScrollView>;
  scrollOffset: SharedValue<number>;
  contentWidth: SharedValue<number>;
  viewportWidth: SharedValue<number>;
  viewportLeft: SharedValue<number>;
}) {
  const x = useSharedValue(0);
  const scale = useSharedValue(1);
  const dragging = useSharedValue(false);
  const scrollAtStart = useSharedValue(0);
  const destination = useSharedValue(index);

  const pan = Gesture.Pan()
    .enabled(!disabled && count > 1)
    .activateAfterLongPress(280)
    .onStart(() => {
      dragging.value = true;
      scale.value = withSpring(1.06, { damping: 19, stiffness: 260 });
      scrollAtStart.value = scrollOffset.value;
      destination.value = index;
      runOnJS(onStart)(item.id, index);
    })
    .onUpdate(event => {
      const width = viewportWidth.value;
      if (width > 0) {
        const position = event.absoluteX - viewportLeft.value;
        const edge = 42;
        const maxOffset = Math.max(0, contentWidth.value - width);
        let shift = 0;
        if (position < edge) shift = -Math.max(3, (edge - position) / 4);
        if (position > width - edge) shift = Math.max(3, (position - (width - edge)) / 4);
        if (shift !== 0 && maxOffset > 0) {
          const nextOffset = Math.max(0, Math.min(maxOffset, scrollOffset.value + shift));
          scrollTo(scrollRef, nextOffset, 0, false);
        }
      }
      const distance = event.translationX + scrollOffset.value - scrollAtStart.value;
      x.value = distance;
      const next = Math.max(0, Math.min(count - 1, index + Math.round(distance / STRIDE)));
      if (next !== destination.value) {
        destination.value = next;
        runOnJS(onHover)(next);
      }
    })
    .onEnd(() => {
      if (destination.value !== index) runOnJS(onDrop)(index, destination.value);
    })
    .onFinalize(() => {
      dragging.value = false;
      scale.value = withSpring(1, { damping: 19, stiffness: 260 });
      x.value = withSpring(0, { damping: 19, stiffness: 270 });
      runOnJS(onFinish)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    zIndex: dragging.value ? 10 : 0,
    elevation: dragging.value ? 7 : 0,
    transform: [
      { translateX: x.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        layout={LinearTransition.duration(170)}
        style={[
          styles.tile,
          activeId !== null && activeId !== item.id && hoverIndex === index && styles.dropTarget,
          animatedStyle,
        ]}
      >
        <View
          style={styles.thumbnail}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Вложение ${index + 1}${item.kind === "video" ? ", видео" : ", фотография"}`}
          accessibilityValue={{ text: `Позиция ${index + 1} из ${count}` }}
          accessibilityHint="Зажмите и перетащите, чтобы изменить порядок. Для VoiceOver используйте жесты изменения значения."
          accessibilityActions={[
            { name: "decrement", label: "Переместить влево" },
            { name: "increment", label: "Переместить вправо" },
          ]}
          onAccessibilityAction={event => {
            if (disabled) return;
            if (event.nativeEvent.actionName === "increment" && index < count - 1) onMove(index, index + 1);
            if (event.nativeEvent.actionName === "decrement" && index > 0) onMove(index, index - 1);
          }}
        >
          {item.uri ? (
            <Image source={{ uri: item.uri }} style={styles.image} contentFit="cover" />
          ) : (
            <MaterialCommunityIcons
              name={item.kind === "video" ? "play-circle-outline" : "image-outline"}
              size={32}
              color={COLORS.primary}
            />
          )}
          {item.kind === "video" && <View style={styles.videoBadge}>
            <MaterialCommunityIcons name="play" size={14} color="#fff" />
          </View>}
          <View style={styles.dragHint} pointerEvents="none">
            <MaterialCommunityIcons name="drag-horizontal" size={17} color={COLORS.primary} />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Убрать вложение ${index + 1}`}
          disabled={disabled}
          hitSlop={6}
          onPress={() => onRemove(item.id)}
          style={styles.remove}
        >
          <MaterialCommunityIcons name="close" size={18} color={COLORS.text} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export function SortableMediaStrip({ items, onMove, onRemove, disabled = false }: SortableMediaStripProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const viewportRef = useRef<View>(null);
  const offset = useSharedValue(0);
  const contentWidth = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportLeft = useSharedValue(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const scrollHandler = useAnimatedScrollHandler(event => {
    offset.value = event.contentOffset.x;
  });
  const measureViewport = useCallback(() => {
    requestAnimationFrame(() => {
      viewportRef.current?.measureInWindow((x, _y, width) => {
        viewportLeft.value = x;
        viewportWidth.value = width;
      });
    });
  }, [viewportLeft, viewportWidth]);
  const start = useCallback((id: string, index: number) => {
    setActiveId(id);
    setHoverIndex(index);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);
  const finish = useCallback(() => {
    setActiveId(null);
    setHoverIndex(-1);
  }, []);
  const hover = useCallback((index: number) => setHoverIndex(index), []);
  const drop = useCallback((from: number, to: number) => {
    if (from !== to) {
      onMove(from, to);
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, [onMove]);

  return (
    <View ref={viewportRef} collapsable={false} onLayout={measureViewport} style={styles.viewport}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={!disabled && activeId === null}
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onContentSizeChange={width => { contentWidth.value = width; }}
        contentContainerStyle={styles.row}
      >
        {items.map((item, index) => (
          <MediaTile
            key={item.id}
            item={item}
            index={index}
            count={items.length}
            activeId={activeId}
            hoverIndex={hoverIndex}
            disabled={disabled}
            onStart={start}
            onHover={hover}
            onDrop={drop}
            onFinish={finish}
            onMove={onMove}
            onRemove={onRemove}
            scrollRef={scrollRef}
            scrollOffset={offset}
            contentWidth={contentWidth}
            viewportWidth={viewportWidth}
            viewportLeft={viewportLeft}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { width: "100%" },
  row: { flexDirection: "row", gap: GAP, paddingVertical: 6, paddingHorizontal: 2 },
  tile: { width: SIZE, height: SIZE, borderRadius: 12 },
  dropTarget: { borderWidth: 2, borderColor: COLORS.primary },
  thumbnail: {
    width: "100%", height: "100%", backgroundColor: "#EAE6DB",
    borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  videoBadge: {
    position: "absolute", left: 5, top: 5, width: 23, height: 23,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  dragHint: {
    position: "absolute", left: 4, bottom: 4,
    width: 26, height: 22, alignItems: "center", justifyContent: "center",
    borderRadius: 7, backgroundColor: "rgba(250,247,239,0.87)",
  },
  remove: {
    position: "absolute", right: 4, top: 4, width: 30, height: 30,
    borderRadius: 15, backgroundColor: "#FAF7EF",
    alignItems: "center", justifyContent: "center",
  },
});
