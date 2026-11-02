#!/usr/bin/env node
/**
 * Renders the map style picker's thumbnails (public/layers/<base>-<scheme>.jpg) from the running app:
 * each base over Sakurajima (the Stage 4 finish), with the app's own controls hidden. Needs Google Chrome and the dev
 * server (pnpm dev). Run from the repo root: node scripts/layers/render.mjs [http://localhost:5173/]
 */
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/";
const SAKURAJIMA = { lng: 130.62, lat: 31.6 };
// Rendered at 1× but three times the swatch's 52 px, zoomed in to match: raster tiles (satellite) are
// drawn for 1× screens, so a 3× render would only scale them up and blur them.
const SIZE = 156;
const japanDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
// The app keeps a "spot instead of stage" choice for the rest of a stage day; aim at whichever day it'll check.
const stageDay = japanDay < "2026-11-03" ? "2026-11-03" : japanDay > "2026-11-06" ? "2026-11-06" : japanDay;

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const scheme of ["dark", "light"]) {
  for (const base of ["map", "terrain", "topo", "satellite"]) {
    const page = await (await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1, colorScheme: scheme })).newPage();
    await page.addInitScript(
      ({ base, place, day }) => {
        localStorage.setItem("otomo.welcomed", "1");
        localStorage.setItem("otomo.installHintDismissed", "1");
        localStorage.setItem("otomo.base", base);
        localStorage.setItem("otomo.place", JSON.stringify({ ...place, source: "pin" }));
        localStorage.setItem("otomo.stage", JSON.stringify({ stage: null, day }));
      },
      { base, place: SAKURAJIMA, day: stageDay },
    );
    await page.goto(url);
    await page.addStyleTag({
      content: ".topbar, .sheet, .place-dot, .maplibregl-control-container, .install, .legend { display: none !important; }",
    });
    // From the app's z8 opening view in to where the island fills the frame.
    await page.mouse.move(SIZE / 2, SIZE / 2);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `public/layers/${base}-${scheme}.jpg`, type: "jpeg", quality: 82 });
    console.log(`public/layers/${base}-${scheme}.jpg`);
    await page.close();
  }
}
await browser.close();
