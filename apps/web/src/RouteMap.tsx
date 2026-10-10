import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, MapPin, Navigation } from "lucide-react";
import { vehicleColor } from "./Chart";
import type { Dataset, Plan, SimEvent } from "./types";
maplibregl.setWorkerUrl(workerUrl);
export function RouteMap({
  dataset,
  plan,
  vehicle,
  stop,
  onStop,
  simEvent,
}: {
  dataset: Dataset;
  plan: Plan;
  vehicle: string;
  stop: string;
  onStop: (id: string) => void;
  simEvent?: SimEvent;
}) {
  const ref = useRef<HTMLDivElement>(null),
    mapRef = useRef<maplibregl.Map | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "base",
              type: "background",
              paint: { "background-color": "#eff2ed" },
            },
          ],
        },
        center: dataset.depot.coordinates,
        zoom: 12,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({
          customAttribution: "Grille synthétique Genesis · Schéma, non routier",
          compact: false,
        }),
      );
    } catch {
      setFailed(true);
      return;
    }
    map.on("error", () => setFailed(true));
    map.on("load", () => {
      const points = [
        dataset.depot.coordinates,
        ...dataset.stops.map((s) => s.coordinates),
      ];
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: 55, duration: 0, maxZoom: 13 });
      const min = bounds.getSouthWest(),
        max = bounds.getNorthEast(),
        lines = [];
      for (
        let x = Math.floor(min.lng * 1000) / 1000 - 0.003;
        x < max.lng + 0.004;
        x += 0.002
      )
        lines.push({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [x, min.lat - 0.005],
              [x, max.lat + 0.005],
            ],
          },
        });
      for (
        let y = Math.floor(min.lat * 1000) / 1000 - 0.003;
        y < max.lat + 0.004;
        y += 0.0015
      )
        lines.push({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [min.lng - 0.005, y],
              [max.lng + 0.005, y],
            ],
          },
        });
      map.addSource("streets", {
        type: "geojson",
        data: { type: "FeatureCollection", features: lines },
      });
      map.addLayer({
        id: "street-casing",
        type: "line",
        source: "streets",
        paint: { "line-color": "#dce3dc", "line-width": 7 },
      });
      map.addLayer({
        id: "streets",
        type: "line",
        source: "streets",
        paint: { "line-color": "#ffffff", "line-width": 4 },
      });
      plan.routes.forEach((route, i) => {
        if (route.geometry.length < 2) return;
        map.addSource("route" + i, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: route.geometry },
          },
        });
        map.addLayer({
          id: "route" + i,
          type: "line",
          source: "route" + i,
          paint: {
            "line-color": vehicleColor(route.vehicle_id),
            "line-width": vehicle && vehicle !== route.vehicle_id ? 2 : 4,
            "line-opacity":
              vehicle && vehicle !== route.vehicle_id ? 0.2 : 0.85,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        route.geometry.slice(1).forEach((target, index) => {
          const source = route.geometry[index];
          if (source[0] === target[0] && source[1] === target[1]) return;
          const arrow = document.createElement('span');
          arrow.className = 'route-arrow'; arrow.textContent = '▸'; arrow.setAttribute('aria-hidden','true');
          arrow.style.color = vehicleColor(route.vehicle_id);
          if (vehicle && vehicle !== route.vehicle_id) arrow.style.opacity = '.2';
          new maplibregl.Marker({element:arrow,rotation:-Math.atan2(target[1]-source[1],target[0]-source[0])*180/Math.PI,rotationAlignment:'map'})
            .setLngLat([(source[0]+target[0])/2,(source[1]+target[1])/2]).addTo(map);
        });
      });
      dataset.stops.forEach((s, i) => {
        const routeIndex = plan.routes.findIndex((r) =>
          r.stop_ids.includes(s.id),
        );
        const el = document.createElement("button");
        el.className =
          "stop-marker" +
          (s.id === stop ? " selected" : "") +
          (plan.unserved_ids.includes(s.id) ? " unserved" : "");
        el.style.setProperty(
          "--marker-color",
          vehicleColor(plan.routes[routeIndex]?.vehicle_id || 'van-1'),
        );
        el.textContent = String(i + 1).padStart(2, "0");
        el.setAttribute("aria-label", `${s.label} · ${s.id}`);
        el.addEventListener("click", () => onStop(s.id));
        if (vehicle && plan.routes[routeIndex]?.vehicle_id !== vehicle)
          el.style.opacity = ".35";
        new maplibregl.Marker({ element: el })
          .setLngLat(s.coordinates)
          .addTo(map);
      });
      const depot = document.createElement("div");
      depot.className = "depot-marker";
      depot.textContent = "G";
      new maplibregl.Marker({ element: depot })
        .setLngLat(dataset.depot.coordinates)
        .addTo(map);
      if (simEvent?.stop_id) {
        const pos = dataset.stops.find(
          (s) => s.id === simEvent.stop_id,
        )?.coordinates;
        if (pos) {
          const el = document.createElement("div");
          el.className = "vehicle-marker";
          el.textContent = "➤";
          new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map);
        }
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [dataset, plan, vehicle, stop, onStop, simEvent]);
  return (
    <div className="map-shell">
      <div
        ref={ref}
        className="route-map"
        aria-label="Carte schématique des tournées à Montréal"
      />
      {failed && (
        <div className="map-fallback">
          <MapPin size={24} />
          <strong>Carte indisponible</strong>
          <span>
            Le plan complet reste accessible dans la table des visites.
          </span>
        </div>
      )}
      <div className="map-label">
        <Navigation size={13} />
        <span>
          MONTRÉAL <small>45,50° N / 73,57° O</small>
        </span>
      </div>
      <button
        className="map-locate"
        aria-label="Recentrer la carte"
        onClick={() =>
          mapRef.current?.flyTo({
            center: dataset.depot.coordinates,
            zoom: 12,
            duration: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? 0
              : 300,
          })
        }
      >
        <LocateFixed size={16} />
      </button>
      <div className="map-notice">
        Données synthétiques · tracés schématiques
      </div>
    </div>
  );
}
