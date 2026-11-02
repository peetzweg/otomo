import mlcontour from "maplibre-contour";
import { addProtocol, Map as MapLibre, Marker, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { COVERAGE, radarTile, type Frame } from "../radar/jma";
import { radar, setPlace } from "../radar/radar";
import { bounds, checkpoints, elevationAt, geojson, pointAt, routeLength, stageById } from "../stages/stages";
import { useStore } from "../store";
import { view, setCollapsed, type Base } from "./view";

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

const GSI = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
const TERRAIN_TILES = '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles (AWS)</a>';

/**
 * AWS's open elevation tiles, shared by the hillshade and the contour lines. The contours are traced in
 * a worker, in the browser, from the same tiles the hillshade uses.
 */
const dem = new mlcontour.DemSource({
  url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  encoding: "terrarium",
  maxzoom: 13,
  worker: true,
});
dem.setupMaplibre({ addProtocol });

/** Contour spacing in metres, [minor, major], by zoom: sparse when zoomed out, 10 m on a single climb. */
const CONTOURS = { 8: [200, 1000], 10: [100, 500], 11: [50, 250], 12: [20, 100], 14: [10, 50] };

/**
 * Puts the chosen base under the radar. Terrain shades the map's own fills; topo adds contour lines on
 * top of that; satellite swaps the map for GSI's (国土地理院) aerial photos, keeping its place names.
 */
function applyBase(map: MapLibre, base: Base) {
  const layers = map.getStyle().layers;
  // Over the land and water fills, under the roads and names.
  const belowRoads = layers.find((l) => l.type === "line" || l.type === "symbol")?.id;
  if (base === "terrain" || base === "topo") {
    map.addSource("base-dem", { type: "raster-dem", tiles: [dem.sharedDemProtocolUrl], encoding: "terrarium", tileSize: 256, maxzoom: 13, attribution: TERRAIN_TILES });
    map.addLayer(
      {
        id: "base-hillshade",
        type: "hillshade",
        source: "base-dem",
        paint: {
          "hillshade-exaggeration": base === "topo" ? 0.4 : 0.6,
          "hillshade-shadow-color": dark.matches ? "#000000" : "#4b5263",
          "hillshade-highlight-color": dark.matches ? "rgba(255, 255, 255, 0.18)" : "#ffffff",
          "hillshade-accent-color": dark.matches ? "#000000" : "#4b5263",
        },
      },
      belowRoads,
    );
  }
  if (base === "topo") {
    map.addSource("base-contours", {
      type: "vector",
      tiles: [dem.contourProtocolUrl({ thresholds: CONTOURS, elevationKey: "ele", levelKey: "level", contourLayer: "contours" })],
      maxzoom: 15,
    });
    // Dark: faint white lines. Light: the brown of a paper topo map.
    const [minor, major] = dark.matches ? ["rgba(255, 255, 255, 0.1)", "rgba(255, 255, 255, 0.26)"] : ["rgba(150, 105, 50, 0.22)", "rgba(150, 105, 50, 0.5)"];
    map.addLayer(
      {
        id: "base-contours",
        type: "line",
        source: "base-contours",
        "source-layer": "contours",
        paint: {
          "line-color": ["match", ["get", "level"], 1, major, minor],
          "line-width": ["match", ["get", "level"], 1, 1, 0.6],
        },
      },
      belowRoads,
    );
    map.addLayer(
      {
        id: "base-contour-labels",
        type: "symbol",
        source: "base-contours",
        "source-layer": "contours",
        filter: [">", ["get", "level"], 0],
        layout: {
          "symbol-placement": "line",
          "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
        },
        paint: {
          "text-color": dark.matches ? "rgba(255, 255, 255, 0.5)" : "rgba(130, 90, 40, 0.85)",
          "text-halo-color": dark.matches ? "#0b0d12" : "#ffffff",
          "text-halo-width": 1.2,
        },
      },
      belowRoads,
    );
  }
  if (base === "satellite") {
    for (const layer of layers) {
      if (layer.type !== "background" && layer.type !== "symbol") map.setLayoutProperty(layer.id, "visibility", "none");
    }
    map.addSource("base-photo", {
      type: "raster",
      tiles: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
      tileSize: 256,
      maxzoom: 18,
      attribution: GSI,
    });
    map.addLayer({ id: "base-photo", type: "raster", source: "base-photo" }, layers.find((l) => l.type !== "background")?.id);
  }
}

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
  // Rain goes under the place names (and the route), so both stay readable through a storm.
  const below = map.getLayer(ROUTE_CASING) ? ROUTE_CASING : style.layers.find((l) => l.type === "symbol")?.id;
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
        below,
      );
    }
    map.setPaintProperty(id, "raster-opacity", i === index ? 1 : 0);
  });
}

const ROUTE = "route";
const ROUTE_CASING = "route-casing";

/** The selected stage over the radar: a white line with a dark edge reads on any rain colour. */
function syncRoute(map: MapLibre, stageId: string | undefined) {
  const stage = stageById(stageId);
  const source = map.getSource(ROUTE) as GeoJSONSource | undefined;
  if (!stage) {
    for (const id of [`${ROUTE}-ends`, ROUTE, ROUTE_CASING]) if (map.getLayer(id)) map.removeLayer(id);
    if (source) map.removeSource(ROUTE);
    return;
  }
  if (source) return source.setData(geojson(stage));
  // On top of everything: this style puts some labels before its roads, so "under the labels" would
  // be under the roads and bridges too.
  map.addSource(ROUTE, { type: "geojson", data: geojson(stage) });
  const line = ["==", ["geometry-type"], "LineString"] as ExpressionSpecification;
  map.addLayer(
    {
      id: ROUTE_CASING,
      type: "line",
      source: ROUTE,
      filter: line,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#0b0d12", "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 12, 9] },
    },
  );
  map.addLayer(
    {
      id: ROUTE,
      type: "line",
      source: ROUTE,
      filter: line,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2, 12, 5] },
    },
  );
  map.addLayer({
    id: `${ROUTE}-ends`,
    type: "circle",
    source: ROUTE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "end"], "start", "#3fd38a", "#ff468c"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  });
}

/** Frames the stage between the top bar and the sheet. */
function fitStage(map: MapLibre, stageId: string | undefined, animate = true) {
  const stage = stageById(stageId);
  if (!stage) return;
  const top = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 60;
  const sheet = document.querySelector(".sheet")?.getBoundingClientRect().top ?? innerHeight * 0.6;
  map.fitBounds(bounds(stage), {
    padding: { top: top + 24, bottom: innerHeight - sheet + 24, left: 28, right: 28 },
    duration: animate ? 900 : 0,
    maxZoom: 11,
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
  const checkpointMarkers = useRef<Marker[]>([]);
  /** The style is in and our layers can go on. `isStyleLoaded()` also waits for every tile, so it won't do. */
  const styleReady = useRef(false);
  const frames = useStore(radar, (s) => s.frames);
  const index = useStore(radar, (s) => s.index);
  const place = useStore(radar, (s) => s.place);
  const stage = useStore(radar, (s) => s.stage);
  const position = useStore(radar, (s) => s.position);
  const cursorKm = useStore(radar, (s) => s.cursorKm);
  const riderRef = useRef<Marker>(null);
  const cursorRef = useRef<Marker>(null);
  const base = useStore(view, (s) => s.base);

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
      applyBase(map, view.get().base);
      const { frames, index, stage } = radar.get();
      syncRoute(map, stage);
      syncFrames(map, frames, index);
    });
    // Moving the map yourself folds the sheet away to make room; a fit to a stage doesn't.
    const fold = (e: { originalEvent?: Event }) => e.originalEvent && setCollapsed(true);
    // Gestures (drag, pinch, double tap) start a move that carries the event behind it; a wheel zoom's
    // move doesn't, but the wheel itself is reported.
    map.on("movestart", fold);
    map.on("wheel", () => setCollapsed(true));
    // A tap pins a spot; while a stage is shown the map is just for looking around.
    map.on("click", (e) => !radar.get().stage && setPlace({ lng: e.lngLat.lng, lat: e.lngLat.lat, source: "pin" }));
    // Open on the stage straight away. The sheet is already laid out (it renders with the map), so its
    // height is known; waiting for "load" would mean waiting for every first tile, radar included.
    fitStage(map, radar.get().stage, false);
    // The compact attribution opens itself whenever a source brings new credits; it stays a tap away on
    // the (i) instead, so it doesn't cover the map, until you open it yourself.
    let creditsOpened = false;
    const credits = container.current!.querySelector(".maplibregl-ctrl-attrib")!;
    credits.addEventListener("click", (e) => {
      if ((e.target as Element).closest(".maplibregl-ctrl-attrib-button")) creditsOpened = true;
    });
    const keepClosed = new MutationObserver(() => {
      if (!creditsOpened && credits.classList.contains("maplibregl-compact-show")) credits.classList.remove("maplibregl-compact-show");
    });
    keepClosed.observe(credits, { attributes: true, attributeFilter: ["class"] });
    const onScheme = () => {
      styleReady.current = false;
      map.setStyle(styleUrl(), { diff: false });
    };
    dark.addEventListener("change", onScheme);
    return () => {
      keepClosed.disconnect();
      dark.removeEventListener("change", onScheme);
      map.remove();
    };
  }, []);

  // A new base means a fresh style; style.load puts the base, the route and the radar back on.
  const shownBase = useRef(base);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownBase.current === base) return;
    shownBase.current = base;
    styleReady.current = false;
    map.setStyle(styleUrl(), { diff: false });
  }, [base]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && styleReady.current) syncFrames(map, frames, index);
  }, [frames, index]);

  useEffect(() => {
    const map = mapRef.current;
    markerRef.current?.getElement().classList.toggle("hidden", !!stage);
    checkpointMarkers.current.forEach((m) => m.remove());
    const ride = stageById(stage);
    checkpointMarkers.current =
      map && ride
        ? checkpoints(ride).map((cp) => {
            const pin = document.createElement("div");
            pin.className = "checkpoint";
            pin.textContent = cp.code;
            pin.title = `${cp.name} · km ${cp.km}`;
            return new Marker({ element: pin }).setLngLat([cp.lng, cp.lat]).addTo(map);
          })
        : [];
    if (!map || !styleReady.current) return;
    syncRoute(map, stage);
    fitStage(map, stage);
  }, [stage]);

  useEffect(() => {
    markerRef.current?.setLngLat([place.lng, place.lat]);
    markerRef.current?.getElement().classList.toggle("gps", place.source === "gps");
    // Only a fresh location fix moves the map; a tapped pin is already where you're looking.
    if (place.source === "gps") {
      const map = mapRef.current;
      map?.easeTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 9) });
    }
  }, [place]);

  // You, on a stage. (On a single spot, the spot's own dot shows a located position.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !stage || !position) {
      riderRef.current?.remove();
      riderRef.current = null;
      return;
    }
    if (!riderRef.current) {
      const dot = document.createElement("div");
      dot.className = "place-dot gps";
      riderRef.current = new Marker({ element: dot }).setLngLat([position.lng, position.lat]).addTo(map);
    }
    riderRef.current.setLngLat([position.lng, position.lat]);
  }, [stage, position]);

  // The point being scrubbed on the elevation profile.
  useEffect(() => {
    const map = mapRef.current;
    const ride = stageById(stage);
    if (!map || !ride || cursorKm === undefined) {
      cursorRef.current?.remove();
      cursorRef.current = null;
      return;
    }
    if (!cursorRef.current) {
      const dot = document.createElement("div");
      dot.className = "map-cursor";
      dot.append(Object.assign(document.createElement("span"), { className: "map-cursor-label" }));
      cursorRef.current = new Marker({ element: dot }).setLngLat(pointAt(ride, cursorKm)).addTo(map);
    }
    cursorRef.current.setLngLat(pointAt(ride, cursorKm));
    const km = Math.round((cursorKm * ride.distanceKm) / routeLength(ride));
    cursorRef.current.getElement().firstElementChild!.textContent = `${elevationAt(ride, cursorKm).toLocaleString("en-US")} m · km ${km}`;
  }, [stage, cursorKm]);

  return <div ref={container} className="map" />;
}
