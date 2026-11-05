import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import styles from "./WalksConnectedPage.module.css";

const configuredMapStyle = import.meta.env.VITE_WALK_MAP_STYLE_URL as string | undefined;
const WALK_MAP_STYLE_URL = configuredMapStyle?.startsWith("https://")
  ? configuredMapStyle
  : "https://tiles.openfreemap.org/styles/liberty";

interface WebWalk {
  clientId: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  steps: number;
  estimatedMeters: number;
  gpsMeters?: number | null;
  gpsEnabled?: boolean;
  incompleteSteps: boolean;
}
interface WebGpsPoint {
  seq: number;
  segment: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number | null;
  speed: number | null;
  accepted: boolean;
  reason: string;
  deltaMeters: number;
}
async function fetchOwnWalkPoints(clientId: string, signal: AbortSignal): Promise<WebGpsPoint[]> {
  const result: WebGpsPoint[] = [];
  let after = 0;
  for (let page = 0; page < 50; page++) {
    const data = await apiRequest<WebGpsPoint[]>(
      `/api/v1/walks/${clientId}/track?afterSeq=${after}`,
      {
        browserAuth: true,
        method: "GET",
        signal,
      },
    );
    result.push(...data);
    if (data.length < 200) break;
    after = data[data.length - 1]!.seq;
  }
  return result;
}
function distanceLabel(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} км` : `${meters} м`;
}
function durationLabel(s: number) {
  return s >= 3600
    ? `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`
    : `${Math.floor(s / 60)} мин`;
}

function WalkMap({ points }: { points: WebGpsPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const accepted = useMemo(
    () =>
      points.filter(
        (p) => p.accepted && Number.isFinite(p.longitude) && Number.isFinite(p.latitude),
      ),
    [points],
  );
  useEffect(() => {
    if (!container.current || !accepted.length) return;
    let destroyed = false;
    let map: MapLibreMap | undefined;
    void import("maplibre-gl")
      .then((maplibregl) => {
        if (destroyed || !container.current) return;
        const nextMap = new maplibregl.Map({
          container: container.current,
          style: WALK_MAP_STYLE_URL,
          center: [accepted[0]!.longitude, accepted[0]!.latitude],
          zoom: 15,
        });
        map = nextMap;
        nextMap.on("load", () => {
          const segments = new Map<number, [number, number][]>();
          for (const p of accepted) {
            const group = segments.get(p.segment) ?? [];
            group.push([p.longitude, p.latitude]);
            segments.set(p.segment, group);
          }
          const features = [...segments.entries()]
            .filter(([, coords]) => coords.length >= 2)
            .map(([segment, coordinates]) => ({
              type: "Feature" as const,
              properties: { segment },
              geometry: { type: "LineString" as const, coordinates },
            }));
          nextMap.addSource("walk-route", {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          });
          nextMap.addLayer({
            id: "walk-route-line",
            source: "walk-route",
            type: "line",
            paint: { "line-color": "#567744", "line-width": 5, "line-opacity": 0.94 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          const bounds = new maplibregl.LngLatBounds();
          for (const p of accepted) bounds.extend([p.longitude, p.latitude]);
          nextMap.fitBounds(bounds, { padding: 38, maxZoom: 16, duration: 0 });
        });
      })
      .catch(() => {
        // Map unavailable: retain the accessible walk summary.
      });
    return () => {
      destroyed = true;
      map?.remove();
    };
  }, [accepted]);
  if (!accepted.length)
    return <p className={styles.emptyRoute}>GPS-маршрут для этой прогулки не сохранён.</p>;
  return (
    <div
      ref={container}
      className={styles.map}
      role="img"
      aria-label="Карта записанного маршрута прогулки"
    />
  );
}

export function WalksConnectedPage({ ownerId }: { ownerId: string }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const walks = useQuery({
    queryKey: ["walk-history", ownerId],
    queryFn: ({ signal }) =>
      apiRequest<WebWalk[]>("/api/v1/walks", { method: "GET", browserAuth: true, signal }),
    retry: 1,
  });
  const current = walks.data?.find((w) => w.clientId === selected) ?? null;
  const [deleting, setDeleting] = useState(false);
  const removeSelected = async () => {
    if (
      !selected ||
      deleting ||
      !window.confirm("Удалить прогулку и её GPS-маршрут? Это действие нельзя отменить.")
    )
      return;
    setDeleting(true);
    try {
      await apiRequest(`/api/v1/walks/${selected}`, { method: "DELETE", browserAuth: true });
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ["walk-history", ownerId] });
    } catch {
      window.alert("Не удалось удалить прогулку. Повторите действие.");
    } finally {
      setDeleting(false);
    }
  };
  const route = useQuery({
    queryKey: ["walk-track", ownerId, selected],
    queryFn: ({ signal }) => fetchOwnWalkPoints(selected!, signal),
    enabled: Boolean(selected && current?.gpsEnabled),
    retry: 1,
  });
  return (
    <section className={styles.page} aria-label="История прогулок">
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>GAFUS · НА ПРОГУЛКЕ</span>
          <h1>История прогулок</h1>
          <p>
            Время с собакой, шаги и маршруты. Запись ведётся на телефоне, а здесь отображаются
            синхронизированные прогулки.
          </p>
        </div>
        <span className={styles.paw} aria-hidden="true">
          🐾
        </span>
      </div>
      {walks.isPending && <p role="status">Загружаем прогулки…</p>}
      {walks.isError && (
        <div role="alert">
          Не удалось загрузить историю.{" "}
          <button type="button" onClick={() => void walks.refetch()}>
            Повторить
          </button>
        </div>
      )}
      {walks.data?.length === 0 && (
        <p className={styles.emptyRoute}>
          Пока нет завершённых прогулок. Начните прогулку в мобильном приложении GAFUS.
        </p>
      )}
      <div className={styles.grid}>
        <div className={styles.list}>
          {walks.data?.map((walk) => (
            <button
              key={walk.clientId}
              type="button"
              className={`${styles.card} ${selected === walk.clientId ? styles.selected : ""}`}
              onClick={() => setSelected(walk.clientId)}
              aria-pressed={selected === walk.clientId}
            >
              <strong>
                {new Date(walk.startedAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              <span>
                {new Date(walk.startedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                —{" "}
                {new Date(walk.finishedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>
                {durationLabel(walk.durationSeconds)} · {walk.steps.toLocaleString("ru-RU")} шагов ·{" "}
                {walk.gpsMeters != null ? "" : "≈"}
                {distanceLabel(walk.gpsMeters ?? walk.estimatedMeters)}
              </span>
              <small>{walk.gpsEnabled ? "Маршрут GPS" : "Расстояние по шагам"}</small>
            </button>
          ))}
        </div>
        {current && (
          <div className={styles.detail}>
            <h2>Маршрут прогулки</h2>
            <button
              type="button"
              className={styles.deleteButton}
              disabled={deleting}
              onClick={() => void removeSelected()}
              aria-label="Удалить выбранную прогулку и GPS-маршрут"
            >
              {deleting ? "Удаляем…" : "Удалить прогулку"}
            </button>
            {current.gpsEnabled ? (
              <>
                {route.isPending && <p role="status">Загружаем маршрут…</p>}
                {route.isError && (
                  <p role="alert">
                    Маршрут временно недоступен.{" "}
                    <button onClick={() => void route.refetch()} type="button">
                      Повторить
                    </button>
                  </p>
                )}
                {route.data && <WalkMap points={route.data} />}
              </>
            ) : (
              <p className={styles.emptyRoute}>
                Для этой прогулки нет GPS-координат. При следующей прогулке разрешите запись
                местоположения на телефоне.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
