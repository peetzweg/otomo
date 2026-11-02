<p align="center">
  <img src="public/favicon.svg" width="96" height="96" alt="">
</p>

<h1 align="center">ameblitz</h1>

<p align="center">
  <strong>Rain radar for Japan.</strong><br>
  The last 90 minutes and the next hour of rain, at 250 m, every 5 minutes.
</p>

ameblitz (雨, ame: rain) is an installable web app in the spirit of RegenRadar, built on the Japan
Meteorological Agency's own nowcast rather than a global composite.

- **Will I get wet?** A one-line answer for your location or any spot you tap: "Rain in ~15 min",
  "Rain stops in ~10 min", "Dry for the next hour".
- **The timeline is the chart.** Each bar is the rain at your spot for one 5-minute frame. Drag across it
  to scrub the map, or press play.
- **Readable through a storm.** The radar is recoloured into one modern ramp and drawn under the place
  names.
- **No backend.** Everything runs in the browser; it's a static site on GitHub Pages.

## Data

Radar: [気象庁 高解像度降水ナウキャスト](https://www.jma.go.jp/bosai/nowc/) (JMA high-resolution
precipitation nowcast): radar plus rain gauges, 250 m, every 5 minutes, analysis plus a forecast to
+60 minutes. Reused under JMA's terms of use (公共データ利用規約 v1.0), with credit, and marked as
processed because we recolour it.

How the tiles behave (see [src/radar/jma.ts](src/radar/jma.ts)):

- Tiles are `Access-Control-Allow-Origin: *`; the `targetTimes_*.json` time lists are not, so the latest
  run is found by probing for a tile on the fixed 5-minute grid.
- JMA only draws **even zooms (4, 6, 8, 10)**; odd zooms return an empty placeholder with a 200. Odd
  tiles are cut from their parent.
- Once a new run is out, the previous run's forecast loses its detailed zooms (z4 stays), so the probe
  checks z10.
- Every tile is an indexed PNG with JMA's 8-step colour scale, so recolouring is a palette swap and a
  pixel's colour is an intensity class (used for the rain-at-a-point timeline).

Base map: [OpenFreeMap](https://openfreemap.org) (© OpenMapTiles, © OpenStreetMap contributors).

## Develop

```sh
pnpm install
pnpm dev
```
