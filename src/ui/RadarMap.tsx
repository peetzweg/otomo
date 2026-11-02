import { addProtocol, Map as MapLibre, Marker, setWorkerUrl, type ExpressionSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { COVERAGE, radarTile, type Frame } from "../radar/jma";
import { radar, setPlace } from "../radar/radar";
import { useStore } from "../store";

// MapLibre looks for its worker next to its own module, which bundling moves; Vite builds it separately.
setWorkerUrl(workerUrl);

/** Tiles come through here to be recoloured, and for odd zooms, cut from their parent. */
addProtocol("jma", async (params, abort) => ({ data: await radarTile(params.url.replace("jma://", "https://"), abort.signal) }));

const ATTRIBUTION =
  '<a href="https://www.jma.go.jp/bosai/nowc/" target="_blank" rel="noopener">出典：気象庁ホームページ</a> (recoloured)';

const dark = matchMedia("(prefers-color-scheme: dark)");
const styleUrl = () => `https://tiles.openfreemap.org/styles/${dark.matches ? "dark" : "positron"}`;

/** Japanese names for Japanese readers; everyone else gets the English name where the map has one. */
const LABEL: ExpressionSpecification = navigator.language.startsWith("ja")
  ? ["coalesce", ["get", "name:ja"], ["get", "name"]]
  : ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];

const layerId = (frame: Frame) => `radar-${frame.id}`;

/** Every frame is its own layer so its tiles load ahead of time; only the current one is visible. */
function syncFrames(map: MapLibre, frames: Frame[], index: number) {
  const style = map.getStyle();
  const wanted = new Set(frames.map(layerId));
  for (const layer of style.layers) {
    if (layer.id.startsWith("radar-") && !wanted.has(layer.id)) {
      map.removeLayer(layer.id);
      map.removeSource(layer.id);
    }
  }
  // Rain goes under the place names, so towns stay readable through a storm.
  const firstLabel = style.layers.find((l) => l.type === "symbol")?.id;
  frames.forEach((frame, i) => {
    const id = layerId(frame);
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "raster",
        tiles: [`jma://www.jma.go.jp/bosai/jmatile/data/nowc/${frame.base}/none/${frame.valid}/surf/hrpns/{z}/{x}/{y}.png`],
        tileSize: 256,
        minzoom: 4,
        // 250 m data is fully resolved at z10; beyond that the map scales those tiles up.
        maxzoom: 10,
        bounds: COVERAGE,
        attribution: ATTRIBUTION,
      });
      map.addLayer(
        {
          id,
          type: "raster",
          source: id,
          paint: { "raster-opacity": 0, "raster-fade-duration": 0, "raster-resampling": "linear" },
        },
        firstLabel,
      );
    }
    map.setPaintProperty(id, "raster-opacity", i === index ? 1 : 0);
  });
}

function localizeLabels(map: MapLibre) {
  for (const layer of map.getStyle().layers) {
    if (layer.type === "symbol" && map.getLayoutProperty(layer.id, "text-field")) {
      map.setLayoutProperty(layer.id, "text-field", LABEL);
    }
  }
}

export function RadarMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre>(null);
  const markerRef = useRef<Marker>(null);
  /** The style is in and our layers can go on. `isStyleLoaded()` also waits for every tile, so it won't do. */
  const styleReady = useRef(false);
  const frames = useStore(radar, (s) => s.frames);
  const index = useStore(radar, (s) => s.index);
  const place = useStore(radar, (s) => s.place);

  useEffect(() => {
    const { place } = radar.get();
    const map = new MapLibre({
      container: container.current!,
      style: styleUrl(),
      center: [place.lng, place.lat],
      zoom: 8,
      minZoom: 4,
      maxZoom: 13,
      maxBounds: [
        [COVERAGE[0] - 8, COVERAGE[1] - 6],
        [COVERAGE[2] + 8, COVERAGE[3] + 6],
      ],
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const dot = document.createElement("div");
    dot.className = "place-dot";
    markerRef.current = new Marker({ element: dot }).setLngLat([place.lng, place.lat]).addTo(map);

    // A new style (light/dark switch) arrives without our layers, so they go back on every load.
    map.on("style.load", () => {
      styleReady.current = true;
      localizeLabels(map);
      const { frames, index } = radar.get();
      syncFrames(map, frames, index);
    });
    map.on("click", (e) => setPlace({ lng: e.lngLat.lng, lat: e.lngLat.lat, source: "pin" }));
    // The compact attribution starts open; it stays a tap away on the (i) so it doesn't cover the map.
    map.once("idle", () => container.current?.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show"));
    const onScheme = () => {
      styleReady.current = false;
      map.setStyle(styleUrl());
    };
    dark.addEventListener("change", onScheme);
    return () => {
      dark.removeEventListener("change", onScheme);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && styleReady.current) syncFrames(map, frames, index);
  }, [frames, index]);

  useEffect(() => {
    markerRef.current?.setLngLat([place.lng, place.lat]);
    markerRef.current?.getElement().classList.toggle("gps", place.source === "gps");
    // Only a fresh location fix moves the map; a tapped pin is already where you're looking.
    if (place.source === "gps") {
      const map = mapRef.current;
      map?.easeTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 9) });
    }
  }, [place]);

  return <div ref={container} className="map" />;
}
