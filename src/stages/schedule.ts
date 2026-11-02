/**
 * What komoot doesn't know: the day, the start time, the checkpoints and the official numbers, copied
 * from the Rad Race riders portal. Checkpoint kilometres are the portal's; they are placed on the
 * komoot track in proportion, since the two measure each stage slightly differently.
 */
export interface Schedule {
  /** The day in Japan, yyyy-mm-dd. */
  date: string;
  /** Shared start time, JST. */
  start: string;
  distanceKm: number;
  climbM: number;
  checkpoints: { code: string; name: string; km: number }[];
}

export const SCHEDULE: Record<number, Schedule> = {
  1: {
    date: "2026-11-03",
    start: "07:30",
    distanceKm: 168.3,
    climbM: 2862,
    checkpoints: [
      { code: "CP1", name: "Amagi Mizu-no-Bunkamura", km: 53.3 },
      // The portal's decimal was hidden behind its SOS button; the venue sits at about km 116.
      { code: "CP2", name: "Kusu Sports Park", km: 116 },
    ],
  },
  2: {
    date: "2026-11-04",
    start: "08:00",
    distanceKm: 137.8,
    climbM: 3483,
    checkpoints: [
      { code: "CP3", name: "JA Handa-Kogen Drive-in", km: 60.1 },
      { code: "CP4", name: "Aso Milk Factory", km: 103.2 },
    ],
  },
  3: {
    date: "2026-11-05",
    start: "08:00",
    distanceKm: 155.6,
    climbM: 3594,
    checkpoints: [
      { code: "CP5", name: "Yoshimuta-kogen Midori-no-Mura", km: 38.1 },
      { code: "CP6", name: "Odori-toge Park", km: 112.4 },
    ],
  },
  4: {
    date: "2026-11-06",
    start: "08:00",
    distanceKm: 142.8,
    climbM: 2312,
    checkpoints: [{ code: "CP7", name: "Wake Park", km: 75.6 }],
  },
};
