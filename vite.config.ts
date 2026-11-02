import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** Where the app is served from: "/" locally, "/otomo/" on GitHub Pages (set by the workflow). */
const base = process.env.BASE_PATH ?? "/";

/** The deployed origin, for share links, which have to be absolute. The Pages workflow sets it. */
const siteUrl = (process.env.SITE_URL ?? "").replace(/\/$/, "");

/** Radar frames are named by their time, so a cached tile never goes stale; it only ages out. */
const HOUR = 60 * 60;

export default defineConfig({
  base,
  // Reachable over Tailscale (tailscale serve proxies the tailnet's ts.net name to the dev server).
  server: { allowedHosts: [".ts.net"] },
  // MapLibre's worker is an ES module that imports its shared chunk.
  worker: { format: "es" },
  plugins: [
    react(),
    {
      name: "otomo-site-url",
      transformIndexHtml: { order: "pre", handler: (html) => html.replaceAll("%SITE_URL%", siteUrl) },
    },
    VitePWA({
      registerType: "prompt",
      pwaAssets: { config: true, overrideManifestIcons: true, includeHtmlHeadLinks: true, injectThemeColor: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        globIgnores: ["**/apple-splash-*", "**/og.*"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://www.jma.go.jp" && url.pathname.startsWith("/bosai/jmatile/"),
            handler: "CacheFirst",
            options: {
              cacheName: "jma-tiles",
              expiration: { maxEntries: 4000, maxAgeSeconds: 4 * HOUR },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Elevation (hillshade, contours) and GSI's aerial photos never change between visits.
            urlPattern: ({ url }) =>
              url.href.startsWith("https://s3.amazonaws.com/elevation-tiles-prod/") || url.origin === "https://cyberjapandata.gsi.go.jp",
            handler: "CacheFirst",
            options: {
              cacheName: "terrain",
              expiration: { maxEntries: 3000, maxAgeSeconds: 30 * 24 * HOUR },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // The base map: styles, vector tiles, fonts and sprites. Fresh when online, there when not.
            urlPattern: ({ url }) => url.origin === "https://tiles.openfreemap.org",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "basemap",
              expiration: { maxEntries: 3000, maxAgeSeconds: 30 * 24 * HOUR },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        id: base,
        name: "Otomo · Tour de Friends Japan",
        short_name: "Otomo",
        description: "The companion app for Rad Race Tour de Friends Japan: rain radar along every stage, the climbs, and where you are.",
        lang: "en",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        categories: ["weather", "sports", "navigation"],
        // Shown in Android's and desktop Chrome's richer install dialog.
        screenshots: [{ src: `${base}og.png`, sizes: "1200x630", type: "image/png", form_factor: "wide", label: "Otomo, the Tour de Friends companion" }],
      },
    }),
  ],
});
