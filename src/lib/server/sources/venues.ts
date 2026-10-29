/**
 * Where each NFL stadium is, by nflverse stadium_id: latitude, longitude, and elevation in meters.
 * Travel distance, time zones crossed, altitude, and an international site are computed from this
 * table and the schedule alone, so every one is known before kickoff. Time zones are the nearest
 * 15-degree meridian, which is a stable approximation and ignores daylight saving.
 */
export type Venue = {
  latitude: number;
  longitude: number;
  elevationM: number;
  international: boolean;
};

const home = (latitude: number, longitude: number, elevationM: number): Venue => ({
  latitude,
  longitude,
  elevationM,
  international: false,
});
const abroad = (latitude: number, longitude: number, elevationM: number): Venue => ({
  latitude,
  longitude,
  elevationM,
  international: true,
});

const VENUES: Record<string, Venue> = {
  ATL97: home(33.7554, -84.4008, 320),
  ATL00: home(33.7577, -84.401, 320),
  BAL00: home(39.278, -76.6227, 10),
  BOS00: home(42.0909, -71.2643, 90),
  BUF00: home(42.7738, -78.787, 190),
  CAR00: home(35.2258, -80.8528, 220),
  CHI98: home(41.8623, -87.6167, 180),
  CIN00: home(39.0955, -84.5161, 150),
  CLE00: home(41.5061, -81.6995, 200),
  DAL00: home(32.7473, -97.0945, 180),
  DEN00: home(39.7439, -105.0201, 1609),
  DET00: home(42.34, -83.0456, 180),
  GNB00: home(44.5013, -88.0622, 200),
  HOU00: home(29.6847, -95.4107, 15),
  IND00: home(39.7601, -86.1639, 220),
  JAX00: home(30.3239, -81.6373, 5),
  KAN00: home(39.0489, -94.4839, 270),
  LAX01: home(33.9535, -118.3392, 30),
  LAX97: home(33.8644, -118.2611, 15),
  LAX99: home(34.0141, -118.2879, 25),
  MIA00: home(25.958, -80.2389, 3),
  MIN01: home(44.9738, -93.2581, 250),
  NAS00: home(36.1665, -86.7713, 130),
  NOR00: home(29.9511, -90.0812, 2),
  NYC01: home(40.8135, -74.0745, 3),
  OAK00: home(37.7516, -122.2005, 10),
  PHI00: home(39.9008, -75.1675, 5),
  PHO00: home(33.5276, -112.2626, 340),
  PIT00: home(40.4468, -80.0158, 220),
  SDG00: home(32.7831, -117.1196, 30),
  SEA00: home(47.5952, -122.3316, 5),
  SFO01: home(37.403, -121.97, 10),
  TAM00: home(27.9759, -82.5033, 10),
  VEG00: home(36.0909, -115.1833, 620),
  WAS00: home(38.9078, -76.8645, 20),
  FRA00: abroad(50.0686, 8.6455, 110),
  GER00: abroad(48.2188, 11.6247, 510),
  LON00: abroad(51.556, -0.2796, 30),
  LON01: abroad(51.4559, -0.3415, 15),
  LON02: abroad(51.6043, -0.0664, 30),
  MAD01: abroad(40.453, -3.6883, 650),
  MEL00: abroad(-37.82, 144.9834, 10),
  MEX00: abroad(19.3029, -99.1505, 2240),
  MUN01: abroad(48.2188, 11.6247, 510),
  PAR00: abroad(48.9245, 2.3601, 35),
  RIO00: abroad(-22.9122, -43.2302, 10),
  SAO00: abroad(-23.5453, -46.4742, 760),
};

export function venueOf(stadiumId: string | undefined): Venue | null {
  return stadiumId === undefined ? null : (VENUES[stadiumId] ?? null);
}

const EARTH_KM = 6371;

/** Great-circle distance in kilometers. */
export function distanceKm(a: Venue, b: Venue): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whole time zones between two venues, from the nearest 15-degree meridian. */
export function zonesCrossed(a: Venue, b: Venue): number {
  return Math.abs(Math.round(a.longitude / 15) - Math.round(b.longitude / 15));
}
