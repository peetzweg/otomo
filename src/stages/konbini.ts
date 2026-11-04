/**
 * 7-Eleven, FamilyMart and Lawson stores within a few hundred metres of each stage, from OpenStreetMap
 * (fetched at build time by scripts/konbini.mjs, so they're there offline).
 */
import data from "./konbini.json";
import { routeLength, type Stage } from "./stages";

export type Brand = "7-Eleven" | "FamilyMart" | "Lawson";

export interface Konbini {
  brand: Brand;
  /** The branch, as mapped ("ローソン 玖珠町総合運動公園前店"); often empty. */
  name: string;
  lng: number;
  lat: number;
  /** On the komoot track. */
  routeKm: number;
  /** In the portal's kilometres. */
  km: number;
}

export const NEAR_M: number = data.nearM;

/** Each chain's own colour. */
export const BRAND_COLORS: Record<Brand, string> = {
  "7-Eleven": "#f58220",
  FamilyMart: "#00a650",
  Lawson: "#1d7fd6",
};

export const BRANDS = Object.keys(BRAND_COLORS) as Brand[];

/**
 * Each chain's logo on a white tile (public/konbini/*.png, 72 px), from their own sites: 7-Eleven's
 * app icon (sej.co.jp), FamilyMart's home screen icon (family.co.jp), Lawson's favicon (lawson.co.jp).
 */
export const brandIcon = (brand: Brand) => `${import.meta.env.BASE_URL}konbini/${brand.toLowerCase()}.png`;

type Row = [number, number, number, Brand, string];

export function konbini(stage: Stage): Konbini[] {
  const rows = ((data.stages as unknown as Record<string, Row[]>)[stage.id] ?? []) as Row[];
  const scale = stage.distanceKm / routeLength(stage);
  return rows.map(([lng, lat, routeKm, brand, name]) => ({ brand, name, lng, lat, routeKm, km: routeKm * scale }));
}

/** Long stretches without a store, longest first: where to stock up before. */
export function gaps(stage: Stage, atLeastKm = 20) {
  const stores = konbini(stage);
  const scale = stage.distanceKm / routeLength(stage);
  const marks = [{ km: 0, store: undefined as Konbini | undefined }, ...stores.map((s) => ({ km: s.km, store: s })), { km: routeLength(stage) * scale, store: undefined }];
  const out = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const length = marks[i + 1].km - marks[i].km;
    if (length >= atLeastKm) out.push({ from: marks[i].km, to: marks[i + 1].km, length, before: marks[i].store, after: marks[i + 1].store });
  }
  return out.sort((a, b) => b.length - a.length);
}

/** The next store ahead of a point on the route. */
export const nextKonbini = (stage: Stage, routeKm: number) => konbini(stage).find((s) => s.routeKm > routeKm);
