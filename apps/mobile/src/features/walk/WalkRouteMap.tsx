import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, AppState } from "react-native";
import { Text } from "react-native-paper";
import Constants from "expo-constants";
// No MapLibre native bridge exists in Expo Go; do not evaluate its package there.
const nativeMap = Constants.appOwnership === "expo" ? null :
  (require("@maplibre/maplibre-react-native") as typeof import("@maplibre/maplibre-react-native"));
const { Map, Camera, GeoJSONSource, Layer } = nativeMap ??
  ({} as typeof import("@maplibre/maplibre-react-native"));
import { readGpsTrackSnapshot, getOrFinalizeGpsDisplay, type GpsLiveStatus, type StoredGpsPoint } from "./walkGpsStorage";
import { appendWalkTrackPage, WALK_TRACK_PAGE_SIZE, WALK_DISPLAY_TOLERANCE_METERS, WalkGeometryCache, displayFixStatus, type WalkGeoJson } from "@gafus/core-client/walk-tracking";
import { WalkBacktrack } from "./WalkBacktrack";
import { reportClientError } from "@/shared/lib/error-reporting";
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
  localOnly = false,
  onGpsMeters,
}: {
  ownerId: string;
  walkId: string;
  live?: boolean;
  localOnly?: boolean;
  onGpsMeters?: (walkId: string, meters: number | null) => void;
}) {
  const [points, setPoints] = useState<StoredGpsPoint[]>([]);
  const [track,setTrack]=useState<WalkGeoJson>({type:"FeatureCollection",features:[]});
  const [now,setNow]=useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<GpsLiveStatus | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let refreshing = false;
    let cursor = 0;
    let generation:number|null=null;
    let routeRevision:number|null=null;
    let geometry=new WalkGeometryCache(WALK_DISPLAY_TOLERANCE_METERS);
    const collected: StoredGpsPoint[] = [];
    const reset=()=>{
      cursor=0;collected.length=0;
      geometry=new WalkGeometryCache(WALK_DISPLAY_TOLERANCE_METERS);
    };
    const append=(page:StoredGpsPoint[])=>{
      const before=collected.length;
      cursor=appendWalkTrackPage(collected,page,cursor);
      geometry.append(collected.slice(before));
    };
    setPoints([]);
    setTrack({type:"FeatureCollection",features:[]});
    setLiveStatus(null);
    setLoading(true);
    setError(false);
    const refresh = async () => {
      if (refreshing || cancelled || AppState.currentState!=="active") return;
      refreshing = true;
      const oldLength = collected.length;
      let rebuilt=false;
      try {
        let snapshot;
        for (;;) {
          snapshot = await readGpsTrackSnapshot(ownerId, walkId, cursor);
          const page = snapshot.points;
          if (cancelled) return;
          if(live&&generation!==null&&(snapshot.generation!==generation||snapshot.routeRevision!==routeRevision||snapshot.lastSeq<cursor)) {
            reset();rebuilt=true;generation=snapshot.generation;routeRevision=snapshot.routeRevision;continue;
          }
          generation=snapshot.generation;routeRevision=snapshot.routeRevision;
          append(page);
          if (page.length < WALK_TRACK_PAGE_SIZE) break;
        }
        if (!live && !localOnly && collected.length === 0) {
          // A walk recorded on another phone lives only in owner-scoped PostgreSQL.
          for (;;) {
            const result = await apiClient<
              (Omit<StoredGpsPoint, "timestamp"> & { timestamp: string })[]
            >(`/api/v1/walks/${encodeURIComponent(walkId)}/track?afterSeq=${cursor}`, {
              suppressSubscriptionPaywall: true,
              skipAuthRefreshReplay: true,
              requestGuard: () => !cancelled,
            });
            if (cancelled) return;
            if (!result.success || !result.data) throw new Error("WALK_TRACK_UNAVAILABLE");
            const page = result.data.map(point => ({ ...point, timestamp: Date.parse(point.timestamp) }));
            append(page);
            if (page.length < WALK_TRACK_PAGE_SIZE) break;
          }
        }
        if (!cancelled) {
          onGpsMeters?.(walkId, snapshot.meters);
          if (rebuilt||oldLength !== collected.length) {setPoints([...collected]);setTrack(geometry.snapshot());}
          if(!live&&process.env.EXPO_PUBLIC_WALK_FINAL_DISPLAY==="1") {
            const derived=await getOrFinalizeGpsDisplay(ownerId,walkId).catch(()=>null);
            if(cancelled) return;
            if(derived) setTrack(derived);
          }
          setLiveStatus(live ? snapshot.status : null);
          setNow(Date.now());
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          if (rebuilt||oldLength !== collected.length) {setPoints([...collected]);setTrack(geometry.snapshot());}
          setError(true);
          setLoading(false);
          // Error payloads must never carry a raw fix or route.
          reportClientError(new Error("WALK_TRACK_UNAVAILABLE"), { issueKey: "DogWalkRouteMap" });
        }
      } finally { refreshing = false; }
    };
    void refresh();
    const interval = live ? setInterval(() => void refresh(), 5000) : null;
    const clock=live?setInterval(()=>{if(AppState.currentState==="active")setNow(Date.now());},1000):null;
    const foreground=AppState.addEventListener("change",state=>{if(state==="active")void refresh();});
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if(clock) clearInterval(clock);
      foreground.remove();
    };
  }, [ownerId, walkId, live, localOnly, retry, onGpsMeters]);
  const accepted = useMemo(() => points.filter((p) => p.accepted), [points]);
  const last = accepted[accepted.length - 1];
  const display=live?displayFixStatus(liveStatus?.position??null,now):null;
  const gpsStatus=!live?`${accepted.length} точек маршрута`:
    !display?"Ожидаем сигнал GPS":
    `${display.stale||liveStatus?.quality==="lost"?"Последняя позиция":liveStatus?.quality==="good"?"GPS":"Поиск точного GPS"} · ${Math.round(display.ageMs/1000)} с · ${display.accuracyRadius==null?"точность неизвестна":`±${Math.round(display.accuracyRadius)} м`}`;
  const marker=useMemo(()=>display?{
    type:"FeatureCollection" as const,
    features:[{type:"Feature" as const,properties:{stale:display.stale},
      geometry:{type:"Point" as const,coordinates:[display.fix.longitude,display.fix.latitude]}}],
  }:null,[display?.fix.latitude,display?.fix.longitude,display?.stale]);
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
  if (Constants.appOwnership === "expo") return (
    <View style={styles.panel}>
      <Text style={styles.title}>Маршрут прогулки</Text>
      <Text style={styles.footer}>Карта маршрута доступна в сборке GAFUS для разработки. В Expo Go остальные разделы работают без карты.</Text>
    </View>
  );
  if (!live && (loading || !accepted.length))
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
      {error ? (
        <Pressable accessibilityRole="button" onPress={() => setRetry(n => n+1)}>
          <Text style={styles.footer}>Маршрут загружен не полностью. Нажмите, чтобы повторить.</Text>
        </Pressable>
      ) : null}
      <View style={styles.mapContainer}>
        <Map mapStyle={WALK_MAP_STYLE_URL} style={styles.map}>
          <Camera
            key={last ? "track" : "location"}
            initialViewState={
              routeBounds
                ? { bounds: routeBounds, padding: { top: 30, bottom: 30, left: 30, right: 30 } }
                : last
                  ? { center: [last.longitude, last.latitude], zoom: 15 }
                  : display ? {center:[display.fix.longitude,display.fix.latitude],zoom:15} : { zoom: 15 }
            }
            {...(live && last
              ? { center: [last.longitude, last.latitude] as [number, number] }
              : {})}

          />
          {live&&marker?<GeoJSONSource id="walk-position" data={marker}>
            <Layer id="walk-position-dot" type="circle" paint={{"circle-radius":7,"circle-color":display?.stale?"#999999":"#2869C5","circle-stroke-color":"#FFFFFF","circle-stroke-width":2}}/>
          </GeoJSONSource>:null}
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
      {live&&process.env.EXPO_PUBLIC_WALK_BACKTRACK==="1"?<WalkBacktrack key={walkId} points={accepted} position={liveStatus?.position??null} now={now}/>:null}
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
