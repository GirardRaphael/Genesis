import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coordinates, DispatchTrip, Roadwork } from "./dispatchTypes";

maplibregl.setWorkerUrl(workerUrl);

const CENTER: Coordinates = [-73.73, 45.51];
const ISLAND_BOUNDS = new maplibregl.LngLatBounds(
  [-74.05, 45.38],
  [-73.42, 45.74],
);
const COLORS = ["#147c88", "#7d62b4", "#d2843b", "#3f8966"];
const LON_SCALE = Math.cos((45.5 * Math.PI) / 180);
const segmentLength = (a: Coordinates, b: Coordinates) =>
  Math.hypot((b[0] - a[0]) * LON_SCALE, b[1] - a[1]);
function offsets(points: Coordinates[]) {
  const result = [0];
  for (let i = 1; i < points.length; i++)
    result.push(result[i - 1] + segmentLength(points[i - 1], points[i]));
  return result;
}
function nearestOffset(
  points: Coordinates[],
  length: number[],
  point: Coordinates,
) {
  let nearest = 0,
    best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const dx = (b[0] - a[0]) * LON_SCALE,
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * LON_SCALE * dx + (point[1] - a[1]) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const distance = Math.hypot(
      (point[0] - a[0]) * LON_SCALE - dx * t,
      point[1] - a[1] - dy * t,
    );
    if (distance < best) {
      best = distance;
      nearest = length[i - 1] + (length[i] - length[i - 1]) * t;
    }
  }
  return nearest;
}
function pointAt(
  points: Coordinates[],
  length: number[],
  offset: number,
): Coordinates {
  for (let i = 1; i < length.length; i++)
    if (offset <= length[i]) {
      const t = (offset - length[i - 1]) / (length[i] - length[i - 1] || 1);
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ];
    }
  return points.at(-1) || CENTER;
}
export const dispatchColor = (vehicle: string) =>
  COLORS[
    Math.max(0, Number(vehicle.match(/(\d+)$/)?.[1] || 1) - 1) % COLORS.length
  ];

type Props = {
  trips: DispatchTrip[];
  selected: string;
  onSelect: (id: string) => void;
  focusVersion: number;
  roadworks?: Roadwork[];
  showRoadworks?: boolean;
};

export function DispatchMap({
  trips,
  selected,
  onSelect,
  focusVersion,
  roadworks = [],
  showRoadworks = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const vehicles = useRef(new Map<string, maplibregl.Marker>());
  const animations = useRef(new Map<string, number>());
  const lastFit = useRef(0);
  const onSelectRef = useRef(onSelect);
  const viewRef = useRef({ trips, selected });
  viewRef.current = { trips, selected };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    let loaded = false;
    let width = container.current.clientWidth;
    const resize = new ResizeObserver(() => {
      const currentMap = mapRef.current;
      const nextWidth = container.current?.clientWidth || width;
      currentMap?.resize();
      if (currentMap && loaded && Math.abs(nextWidth - width) > 1) {
        const view = viewRef.current;
        const points = view.trips.find((trip) => trip.id === view.selected)
          ?.route.coordinates;
        const bounds = points?.length
          ? points.reduce(
              (box, point) => box.extend(point),
              new maplibregl.LngLatBounds(points[0], points[0]),
            )
          : ISLAND_BOUNDS;
        currentMap.fitBounds(bounds, {
          padding: 45,
          maxZoom: points?.length ? 13.5 : 10.8,
          duration: 0,
        });
      }
      width = nextWidth;
    });
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: CENTER,
        zoom: 10.8,
        minZoom: 9,
        attributionControl: { compact: false },
      });
      mapRef.current = map;
      resize.observe(container.current);
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.on("load", () => {
        map.resize();
        loaded = true;
        setFailed(false);
        map.fitBounds(ISLAND_BOUNDS, {
          padding: 30,
          maxZoom: 10.8,
          duration: 0,
        });
        map.addSource("dispatch-routes", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "dispatch-route-casing",
          type: "line",
          source: "dispatch-routes",
          paint: {
            "line-color": "#ffffff",
            "line-width": 9,
            "line-opacity": 0.9,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "dispatch-routes",
          type: "line",
          source: "dispatch-routes",
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "width"],
            "line-opacity": ["get", "opacity"],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "dispatch-arrows",
          type: "symbol",
          source: "dispatch-routes",
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 95,
            "text-field": "▶",
            "text-size": 12,
            "text-rotation-alignment": "map",
            "text-keep-upright": false,
          },
          paint: {
            "text-color": ["get", "color"],
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });
        map.addSource("dispatch-roadworks", {
          type: "geojson",
          cluster: true,
          clusterRadius: 30,
          clusterMaxZoom: 13,
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "dispatch-roadworks",
          type: "circle",
          source: "dispatch-roadworks",
          paint: {
            "circle-color": "#c27120",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.5,
            "circle-radius": [
              "step",
              ["coalesce", ["get", "point_count"], 1],
              5,
              10,
              11,
              50,
              15,
              200,
              20,
            ],
          },
        });
        map.addLayer({
          id: "dispatch-roadwork-counts",
          type: "symbol",
          source: "dispatch-roadworks",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "point_count_abbreviated"]],
            "text-size": 11,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.on("click", "dispatch-routes", (event) => {
          const id = event.features?.[0]?.properties?.trip_id;
          if (typeof id === "string") onSelectRef.current(id);
        });
        map.on("mouseenter", "dispatch-routes", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "dispatch-routes", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "dispatch-roadworks", (event) => {
          const feature = event.features?.[0];
          const point = feature?.geometry;
          if (!feature || point?.type !== "Point") return;
          if (feature.properties?.point_count) {
            map.flyTo({
              center: point.coordinates as Coordinates,
              zoom: Math.min(map.getZoom() + 2, 15),
            });
            return;
          }
          const detail = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = String(
            feature.properties?.label || "Chantier déclaré",
          );
          const borough = document.createElement("div");
          borough.textContent = String(
            feature.properties?.borough || "Montréal",
          );
          detail.append(title, borough);
          new maplibregl.Popup({ closeButton: true })
            .setLngLat(point.coordinates as Coordinates)
            .setDOMContent(detail)
            .addTo(map);
        });
        map.on("mouseenter", "dispatch-roadworks", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "dispatch-roadworks", () => {
          map.getCanvas().style.cursor = "";
        });
        setReady(true);
      });
      map.on("error", () => {
        if (!loaded) setFailed(true);
      });
    } catch {
      setFailed(true);
      return;
    }
    return () => {
      resize.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      vehicles.current.forEach((marker) => marker.remove());
      vehicles.current.clear();
      animations.current.forEach(cancelAnimationFrame);
      animations.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const features = trips
      .filter((trip) => trip.route?.coordinates?.length >= 2)
      .map((trip) => ({
        type: "Feature" as const,
        properties: {
          trip_id: trip.id,
          color: dispatchColor(trip.vehicle_id),
          width: trip.id === selected ? 6 : 3.5,
          opacity: trip.id === selected ? 1 : 0.55,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: trip.route.coordinates,
        },
      }));
    (
      map.getSource("dispatch-routes") as maplibregl.GeoJSONSource | undefined
    )?.setData({ type: "FeatureCollection", features });
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    for (const trip of trips) {
      if (trip.id !== selected) continue;
      trip.stops.forEach((stop, index) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `dispatch-map-stop ${stop.kind}`;
        element.textContent = String(index + 1);
        element.title = `${index + 1}. ${stop.kind === "pickup" ? "Ramassage" : "Livraison"} · ${stop.label}`;
        element.setAttribute("aria-label", element.title);
        element.addEventListener("click", () => onSelectRef.current(trip.id));
        markers.current.push(
          new maplibregl.Marker({ element })
            .setLngLat(stop.coordinates)
            .addTo(map),
        );
      });
    }
  }, [trips, selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const running = new Set(
      trips.filter((trip) => trip.status === "running").map((trip) => trip.id),
    );
    for (const [id, marker] of vehicles.current)
      if (!running.has(id)) {
        marker.remove();
        vehicles.current.delete(id);
        const frame = animations.current.get(id);
        if (frame != null) cancelAnimationFrame(frame);
        animations.current.delete(id);
      }
    for (const trip of trips) {
      if (trip.status !== "running" || !trip.progress.coordinate) continue;
      const target = trip.progress.coordinate;
      let marker = vehicles.current.get(trip.id);
      if (!marker) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "dispatch-map-vehicle";
        element.style.setProperty("--vehicle", dispatchColor(trip.vehicle_id));
        element.textContent = "➤";
        element.title = `${trip.vehicle_id} · position simulée, pas GPS`;
        element.setAttribute("aria-label", element.title);
        element.addEventListener("click", () => onSelectRef.current(trip.id));
        marker = new maplibregl.Marker({ element })
          .setLngLat(target)
          .addTo(map);
        vehicles.current.set(trip.id, marker);
        continue;
      }
      const previousFrame = animations.current.get(trip.id);
      if (previousFrame != null) cancelAnimationFrame(previousFrame);
      const previous = marker.getLngLat();
      const points = trip.route.coordinates;
      if (
        matchMedia("(prefers-reduced-motion: reduce)").matches ||
        points.length < 2
      ) {
        marker.setLngLat(target);
        continue;
      }
      const length = offsets(points);
      const from = nearestOffset(points, length, [previous.lng, previous.lat]);
      const to = nearestOffset(points, length, target);
      if (to <= from) {
        marker.setLngLat(target);
        continue;
      }
      const began = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - began) / 2600);
        marker.setLngLat(
          t === 1 ? target : pointAt(points, length, from + (to - from) * t),
        );
        if (t < 1)
          animations.current.set(trip.id, requestAnimationFrame(frame));
        else animations.current.delete(trip.id);
      };
      animations.current.set(trip.id, requestAnimationFrame(frame));
    }
  }, [trips, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const features = showRoadworks
      ? roadworks.map((item) => ({
          type: "Feature" as const,
          properties: { label: item.label, borough: item.borough },
          geometry: { type: "Point" as const, coordinates: item.coordinates },
        }))
      : [];
    (
      map.getSource("dispatch-roadworks") as
        maplibregl.GeoJSONSource | undefined
    )?.setData({ type: "FeatureCollection", features });
  }, [roadworks, showRoadworks, ready]);

  useEffect(() => {
    if (!focusVersion || focusVersion <= lastFit.current) return;
    const trip = trips.find((item) => item.id === selected);
    const points = trip?.route?.coordinates;
    const map = mapRef.current;
    if (!map || !ready || !points?.length) return;
    lastFit.current = focusVersion;
    const bounds = points.reduce(
      (box, point) => box.extend(point),
      new maplibregl.LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, {
      padding: 65,
      maxZoom: 13.5,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 350,
    });
  }, [focusVersion, ready, selected, trips]);

  return (
    <div className="dispatch-map-shell">
      <div
        ref={container}
        className="dispatch-map-canvas"
        aria-label="Carte routière de Montréal et trajets enregistrés"
      />
      {failed && (
        <div className="dispatch-map-fallback" role="status">
          <strong>Fond de carte indisponible</strong>
          <span>Les trajets et arrêts restent consultables dans la liste.</span>
        </div>
      )}
      <div className="dispatch-map-caption">
        <span className="dispatch-map-live-dot" />
        MONTRÉAL · TRAJETS ROUTIERS · POSITIONS SIMULÉES
      </div>
      <button
        type="button"
        className="dispatch-map-reset"
        onClick={() =>
          mapRef.current?.fitBounds(ISLAND_BOUNDS, {
            padding: 30,
            maxZoom: 10.8,
            duration: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? 0
              : 350,
          })
        }
      >
        Voir toute l’île
      </button>
    </div>
  );
}
