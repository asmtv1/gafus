import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useFocusEffect } from "expo-router";
import { API_BASE_URL, COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi } from "@/shared/lib/api/feed";
let active: { postId: string; stop: () => void } | undefined;
export function stopFeedVideoOutsidePosts(visiblePostIds: Set<string>) {
  if (active && !visiblePostIds.has(active.postId)) active.stop();
}
function ActiveVideo({ uri, fail }: { uri: string; fail: () => void }) {
  const player = useVideoPlayer({ uri, contentType: "hls", useCaching: false }, instance => {
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
    instance.play();
  });
  useEffect(() => {
    const listener = player.addListener("statusChange", event => { if (event.status === "error") fail(); });
    return () => listener.remove();
  }, [player, fail]);
  return <VideoView player={player} style={s.fill} contentFit="contain" nativeControls allowsPictureInPicture={false} />;
}
export function FeedVideo({ postId, mediaId, poster, visible }: {
  postId: string; mediaId: string; poster: string | null; visible: boolean;
}) {
  const userId = useAuthStore(state => state.user?.id);
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    setUri(null); setBusy(false);
    if (active?.stop === stop) active = undefined;
  }, []);
  const fail = useCallback(() => { stop(); setError("Видео не загрузилось. Попробуйте ещё раз."); }, [stop]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => { if (state !== "active") stop(); });
    return () => { listener.remove(); stop(); };
  }, [stop, userId]);
  useFocusEffect(useCallback(() => () => stop(), [stop]));
  useEffect(() => { if (!visible) stop(); }, [visible, stop]);
  const play = async () => {
    active?.stop(); active = { postId, stop };
    const current = ++generation.current; setBusy(true); setError("");
    try {
      const ticket = await feedApi.requestPlayback(mediaId);
      if (generation.current !== current) return;
      if (!/^\/api\/v1\/feed-playback\/[A-Za-z0-9_-]+\?ticket=/.test(ticket.manifestUrl)) throw new Error("Не удалось открыть видео.");
      setUri(API_BASE_URL.replace(/\/$/, "") + ticket.manifestUrl);
      // A video lasts at most 60 s; a paused expired session is released rather than cached.
      timer.current = setTimeout(stop, 110_000);
    } catch (failure) {
      if (generation.current === current) { stop(); setError(failure instanceof Error ? failure.message : "Не удалось открыть видео."); }
    } finally { if (generation.current === current) setBusy(false); }
  };
  return <View style={s.fill}>
    {uri ? <ActiveVideo uri={uri} fail={fail} /> : <Pressable style={s.preview} accessibilityRole="button"
      accessibilityLabel={busy ? "Загружаем видео" : "Смотреть видео"} disabled={busy || !visible} onPress={() => void play()}>
      {poster && <Image source={{ uri: poster }} cachePolicy="memory" contentFit="contain" style={s.fill} />}
      <View style={s.action}><Text style={s.label}>{busy ? "Загружаем видео…" : error ? "Повторить" : "Смотреть видео"}</Text></View>
    </Pressable>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  preview: { flex: 1, alignItems: "center", justifyContent: "center" },
  action: { position: "absolute", bottom: 12, paddingHorizontal: 18, minHeight: 48,
    borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: "center" },
  label: { fontFamily: FONTS.montserrat, color: "#fff", fontSize: 14 },
  error: { position: "absolute", top: 8, left: 8, right: 8, backgroundColor: COLORS.cardBackground,
    color: COLORS.text, fontFamily: FONTS.montserrat, padding: 8 },
});
