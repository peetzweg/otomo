import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** Where the app is served from: "/" locally, "/ameblitz/" on GitHub Pages (set by the workflow). */
const base = process.env.BASE_PATH ?? "/";

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
    VitePWA({
      registerType: "prompt",
      pwaAssets: { config: true, overrideManifestIcons: true, includeHtmlHeadLinks: true, injectThemeColor: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        globIgnores: ["**/apple-splash-*"],
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
        name: "ameblitz",
        short_name: "ameblitz",
        description: "Rain radar for Japan: where it's raining now and where it will rain in the next hour.",
        theme_color: "#0b0d12",
        background_color: "#0b0d12",
        display: "standalone",
        orientation: "portrait",
        categories: ["weather"],
      },
    }),
  ],
});
