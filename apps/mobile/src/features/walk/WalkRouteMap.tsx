import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { Map, Camera, GeoJSONSource, Layer, UserLocation } from "@maplibre/maplibre-react-native";
import { allGpsPoints, type StoredGpsPoint } from "./walkGpsStorage";
import { toWalkGeoJson } from "./walkRouteGeoJson";
import { reportClientError } from "@/shared/lib/tracer";
import { apiClient } from "@/shared/lib/api/client";

// One configurable map source. Self-hosted CDN tiles are explicitly out of scope.
const configuredMapStyle = process.env.EXPO_PUBLIC_WALK_MAP_STYLE_URL;
export const WALK_MAP_STYLE_URL = configuredMapStyle?.startsWith("https://")
  ? configuredMapStyle
  : "https://tiles.openfreemap.org/styles/liberty";

export function WalkRouteMap({
  ownerId,
  walkId,
  live = true,
}: {
  ownerId: string;
  walkId: string;
  live?: boolean;
}) {
  const [points, setPoints] = useState<StoredGpsPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setPoints([]);
    setLoading(true);
    setError(false);
    const refresh = async () => {
      try {
        let next = await allGpsPoints(ownerId, walkId);
        if (!live && next.length === 0) {
          // A walk recorded on another phone lives only in owner-scoped PostgreSQL.
          const received: StoredGpsPoint[] = [];
          let after = 0;
          for (let page = 0; page < 50; page++) {
            const result = await apiClient<
              (Omit<StoredGpsPoint, "timestamp"> & { timestamp: string })[]
            >(`/api/v1/walks/${encodeURIComponent(walkId)}/track?afterSeq=${after}`, {
              suppressSubscriptionPaywall: true,
              skipAuthRefreshReplay: true,
            });
            if (!result.success || !result.data) throw new Error("WALK_TRACK_UNAVAILABLE");
            received.push(
              ...result.data.map((point) => ({ ...point, timestamp: Date.parse(point.timestamp) })),
            );
            if (result.data.length < 200) break;
            after = result.data[result.data.length - 1]!.seq;
          }
          next = received;
        }
        if (!cancelled) {
          setPoints(next);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
        reportClientError(error, { issueKey: "DogWalkRouteMap" });
      }
    };
    void refresh();
    const interval = live ? setInterval(() => void refresh(), 5000) : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [ownerId, walkId, live, retry]);
  const accepted = useMemo(() => points.filter((p) => p.accepted), [points]);
  const last = accepted[accepted.length - 1];
  const lastReceived = points[points.length - 1];
  const gpsStatus = !live
    ? `${accepted.length} точек маршрута`
    : !lastReceived
      ? "Ожидаем сигнал GPS"
      : Date.now() - lastReceived.timestamp > 60_000
        ? "Нет свежих координат больше минуты"
        : lastReceived.reason === "poor_accuracy"
          ? "Слабый сигнал GPS"
          : lastReceived.accuracy != null
            ? `Точность GPS ±${Math.round(lastReceived.accuracy)} м`
            : "Точность GPS неизвестна";
  const track = useMemo(() => toWalkGeoJson(accepted), [accepted]);
  const routeBounds = useMemo<[number, number, number, number] | null>(() => {
    if (live || accepted.length < 2) return null;
    let west = Infinity,
      south = Infinity,
      east = -Infinity,
      north = -Infinity;
    for (const p of accepted) {
      west = Math.min(west, p.longitude);
      east = Math.max(east, p.longitude);
      south = Math.min(south, p.latitude);
      north = Math.max(north, p.latitude);
    }
    return [west, south, east, north];
  }, [accepted, live]);
  if (!live && (loading || error || !accepted.length))
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Маршрут прогулки</Text>
        <Text style={styles.footer}>
          {loading
            ? "Загружаем GPS-маршрут…"
            : error
              ? "Не удалось загрузить маршрут с сервера. Проверьте интернет и повторите."
              : "Для этой прогулки GPS-маршрут не сохранён."}
        </Text>
        {error ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку GPS-маршрута"
            onPress={() => setRetry((n) => n + 1)}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Повторить загрузку</Text>
          </Pressable>
        ) : null}
      </View>
    );
  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Маршрут прогулки</Text>
        <Text style={styles.meta}>{gpsStatus}</Text>
      </View>
      <View style={styles.mapContainer}>
        <Map mapStyle={WALK_MAP_STYLE_URL} style={styles.map}>
          <Camera
            key={last ? "track" : "location"}
            initialViewState={
              routeBounds
                ? { bounds: routeBounds, padding: { top: 30, bottom: 30, left: 30, right: 30 } }
                : last
                  ? { center: [last.longitude, last.latitude], zoom: 15 }
                  : { zoom: 15 }
            }
            {...(live && last
              ? { center: [last.longitude, last.latitude] as [number, number] }
              : {})}
            trackUserLocation={!last && live ? "default" : undefined}
          />
          {live ? <UserLocation /> : null}
          <GeoJSONSource id="walk-trail" data={track}>
            <Layer
              id="walk-trail-line"
              type="line"
              paint={{ "line-color": "#557645", "line-width": 5, "line-opacity": 0.9 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </GeoJSONSource>
        </Map>
      </View>
      <Text style={styles.footer}>
        Карта © OpenStreetMap · OpenFreeMap. GPS-маршрут хранится отдельно от карты.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    borderRadius: 20,
    backgroundColor: "#F8F4EA",
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E4DFD2",
  },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, color: "#34452A", fontWeight: "700" },
  meta: { fontSize: 12, color: "#777468" },
  mapContainer: { height: 270, borderRadius: 15, overflow: "hidden" },
  map: { flex: 1 },
  footer: { fontSize: 11, color: "#777468" },
  retry: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#DFE9D1",
    borderRadius: 10,
  },
  retryText: { color: "#34452A", fontWeight: "700", fontSize: 12 },
});
